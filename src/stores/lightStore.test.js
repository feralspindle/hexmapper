import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { resetKit } from '../../test/helpers/storeTestKit.js'

const kit = vi.hoisted(() => ({}))

vi.mock('@/lib/realtime.js', async () => {
  const { createRealtimeMock } = await import('../../test/helpers/storeTestKit.js')
  return createRealtimeMock(kit)
})
vi.mock('@/lib/apiClient.js', async () => {
  const { createApiClientMock } = await import('../../test/helpers/storeTestKit.js')
  return createApiClientMock(kit)
})

import { useLightStore } from './lightStore.js'

const source = (overrides = {}) => ({
  id: 'light-1',
  session_id: 'sess-1',
  name: 'Torch',
  kind: 'torch',
  mode: 'real_time',
  duration_ms: 3_600_000,
  elapsed_ms: 0,
  running: false,
  started_at: null,
  duration_rounds: 10,
  rounds_elapsed: 0,
  expired: false,
  attached_character_id: null,
  ...overrides,
})

describe('lightStore', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    setActivePinia(createPinia())
    resetKit(kit)
  })

  afterEach(() => {
    useLightStore().cleanup()
    vi.useRealTimers()
  })

  test('init loads sources and subscribes', async () => {
    kit.api['get /light-sources?session_id=sess-1'] = [source()]
    const store = useLightStore()
    await store.init('sess-1')

    expect(store.sources).toHaveLength(1)
    expect(kit.channels.map(c => c.name)).toContain('lights:sess-1')
  })

  test('remaining interpolates from the server anchor while running', async () => {
    const startedAt = new Date().toISOString()
    kit.api['get /light-sources?session_id=sess-1'] = [
      source({ running: true, started_at: startedAt, elapsed_ms: 60_000 }),
    ]
    const store = useLightStore()
    await store.init('sess-1')

    vi.advanceTimersByTime(30_000)
    const remaining = store.remaining(store.sources[0])
    // 60s banked + ~30s live = ~90s elapsed of 60min
    expect(remaining).toBeLessThanOrEqual(3_600_000 - 89_000)
    expect(remaining).toBeGreaterThanOrEqual(3_600_000 - 91_000)
  })

  test('a running source that hits zero reports expiry exactly once', async () => {
    const startedAt = new Date().toISOString()
    kit.api['get /light-sources?session_id=sess-1'] = [
      source({ running: true, started_at: startedAt, elapsed_ms: 3_599_500 }),
    ]
    const expired = source({ expired: true, running: false, elapsed_ms: 3_600_000 })
    const expireCall = vi.fn(() => expired)
    kit.api['post /light-sources/light-1/expire'] = expireCall
    const store = useLightStore()
    await store.init('sess-1')

    await vi.advanceTimersByTimeAsync(2_000)
    expect(expireCall).toHaveBeenCalledTimes(1)
    expect(store.sources[0].expired).toBe(true)
  })

  test('rounds sources ignore the clock and tick by rounds', async () => {
    kit.api['get /light-sources?session_id=sess-1'] = [
      source({ mode: 'rounds', rounds_elapsed: 4 }),
    ]
    kit.api['post /light-sources/light-1/tick'] = source({ mode: 'rounds', rounds_elapsed: 5 })
    const store = useLightStore()
    await store.init('sess-1')

    expect(store.remaining(store.sources[0])).toBe(6)
    vi.advanceTimersByTime(60_000)
    expect(store.remaining(store.sources[0])).toBe(6)

    await store.tick('light-1')
    expect(store.remaining(store.sources[0])).toBe(5)
  })

  test('tickAll only touches unexpired rounds sources', async () => {
    kit.api['get /light-sources?session_id=sess-1'] = [
      source({ id: 'a', mode: 'rounds' }),
      source({ id: 'b', mode: 'rounds', expired: true }),
      source({ id: 'c', mode: 'real_time' }),
    ]
    const tickA = vi.fn(() => source({ id: 'a', mode: 'rounds', rounds_elapsed: 1 }))
    kit.api['post /light-sources/a/tick'] = tickA
    const tickB = vi.fn()
    kit.api['post /light-sources/b/tick'] = tickB
    const tickC = vi.fn()
    kit.api['post /light-sources/c/tick'] = tickC
    const store = useLightStore()
    await store.init('sess-1')

    await store.tickAll(1)
    expect(tickA).toHaveBeenCalledTimes(1)
    expect(tickB).not.toHaveBeenCalled()
    expect(tickC).not.toHaveBeenCalled()
  })

  test('realtime updates land in the list', async () => {
    kit.api['get /light-sources?session_id=sess-1'] = [source()]
    const store = useLightStore()
    await store.init('sess-1')

    const channel = kit.channels.find(c => c.name === 'lights:sess-1')
    channel.emitPostgres('light_sources', 'UPDATE', source({ running: true, started_at: new Date().toISOString() }))
    expect(store.sources[0].running).toBe(true)

    channel.emitPostgres('light_sources', 'DELETE', {}, { id: 'light-1' })
    expect(store.sources).toHaveLength(0)
  })
})
