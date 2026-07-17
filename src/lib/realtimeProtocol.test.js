import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { accessTokenNeedsRefresh, connectionWasStable, pendingKeys, snapshotRefreshDelay, REALTIME_TABLES } from './realtimeProtocol.js'

const NOW_MS = 1_750_000_000_000
const NOW_S = NOW_MS / 1000

describe('accessTokenNeedsRefresh', () => {
  it('refreshes a token that is already expired', () => {
    expect(accessTokenNeedsRefresh(NOW_S - 10, NOW_MS, 30)).toBe(true)
  })

  it('refreshes a token expiring within the margin', () => {
    expect(accessTokenNeedsRefresh(NOW_S + 20, NOW_MS, 30)).toBe(true)
  })

  it('keeps a token with plenty of lifetime left', () => {
    expect(accessTokenNeedsRefresh(NOW_S + 3600, NOW_MS, 30)).toBe(false)
  })

  it('skips sessions without an expiry', () => {
    expect(accessTokenNeedsRefresh(undefined, NOW_MS, 30)).toBe(false)
    expect(accessTokenNeedsRefresh(null, NOW_MS, 30)).toBe(false)
  })
})

describe('connectionWasStable', () => {
  it('treats a connection that lived past the threshold as stable', () => {
    expect(connectionWasStable(NOW_MS - 31_000, NOW_MS, 30_000)).toBe(true)
  })

  it('treats a connection killed moments after ready as unstable', () => {
    expect(connectionWasStable(NOW_MS - 600, NOW_MS, 30_000)).toBe(false)
  })

  it('treats a connection that never became ready as unstable', () => {
    expect(connectionWasStable(null, NOW_MS, 30_000)).toBe(false)
  })
})

describe('snapshotRefreshDelay', () => {
  it('runs immediately when no refresh has happened yet', () => {
    expect(snapshotRefreshDelay(null, NOW_MS, 10_000)).toBe(0)
  })

  it('runs immediately once the minimum interval has elapsed', () => {
    expect(snapshotRefreshDelay(NOW_MS - 10_000, NOW_MS, 10_000)).toBe(0)
    expect(snapshotRefreshDelay(NOW_MS - 60_000, NOW_MS, 10_000)).toBe(0)
  })

  it('waits out the remainder of the interval after a recent refresh', () => {
    expect(snapshotRefreshDelay(NOW_MS - 4_000, NOW_MS, 10_000)).toBe(6_000)
  })

  it('waits the full interval when called back-to-back, coalescing a reconnect storm', () => {
    expect(snapshotRefreshDelay(NOW_MS, NOW_MS, 10_000)).toBe(10_000)
  })
})

describe('pendingKeys', () => {
  it('holds a key pending until every overlapping write releases it', () => {
    const pending = pendingKeys()
    pending.begin(['name'])
    pending.begin(['name'])
    pending.end(['name'])
    expect(pending.has('name')).toBe(true)
    pending.end(['name'])
    expect(pending.has('name')).toBe(false)
  })

  it('tracks keys independently and clears them all at once', () => {
    const pending = pendingKeys()
    pending.begin(['a', 'b'])
    pending.end(['a'])
    expect([...pending.keys()]).toEqual(['b'])
    pending.clear()
    expect(pending.has('b')).toBe(false)
  })

  it('releasing a key that was never begun is a no-op', () => {
    const pending = pendingKeys()
    pending.end(['ghost'])
    expect(pending.has('ghost')).toBe(false)
  })
})

// A table subscribed on the frontend with no aggregate_type mapping never
// receives a single server event - the store just sits there silently stale
// (that is exactly how journal and light updates got lost, #192). This walks
// both codebases so the next unmapped table fails CI instead of shipping.
describe('REALTIME_TABLES contract', () => {
  const repoRoot = join(__dirname, '..', '..')

  function walk(dir, extensions, files = []) {
    for (const name of readdirSync(dir)) {
      if (name === 'node_modules' || name === 'target' || name.startsWith('.')) continue
      const path = join(dir, name)
      if (statSync(path).isDirectory()) walk(path, extensions, files)
      else if (extensions.some(ext => name.endsWith(ext))) files.push(path)
    }
    return files
  }

  it('covers every table the frontend subscribes to', () => {
    const subscribed = new Set()
    for (const file of walk(join(repoRoot, 'src'), ['.js', '.vue'])) {
      if (file.endsWith('.test.js')) continue
      const source = readFileSync(file, 'utf8')
      for (const match of source.matchAll(/table:\s*'([a-z_]+)'/g)) subscribed.add(match[1])
    }
    expect(subscribed.size).toBeGreaterThan(0)
    const mapped = new Set(Object.values(REALTIME_TABLES))
    const unmapped = [...subscribed].filter(table => !mapped.has(table))
    expect(unmapped).toEqual([])
  })

  it('maps only aggregate types the server actually emits', () => {
    const emitted = new Set()
    for (const file of walk(join(repoRoot, 'server', 'src'), ['.rs'])) {
      const source = readFileSync(file, 'utf8')
      for (const match of source.matchAll(/aggregate_type:\s*"([a-z_]+)"/g)) emitted.add(match[1])
      for (const match of source.matchAll(/aggregate_type,[^)]*?'([a-z_]+)'/gs)) emitted.add(match[1])
      for (const match of source.matchAll(/select\s+'([a-z_]+)',/g)) emitted.add(match[1])
    }
    expect(emitted.size).toBeGreaterThan(0)
    const phantom = Object.keys(REALTIME_TABLES).filter(type => !emitted.has(type))
    expect(phantom).toEqual([])
  })
})
