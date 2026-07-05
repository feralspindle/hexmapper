import { describe, expect, it } from 'vitest'
import { accessTokenNeedsRefresh, connectionWasStable, snapshotRefreshDelay } from './realtimeProtocol.js'

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
