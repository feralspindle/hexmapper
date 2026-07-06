import { describe, test, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { resetKit } from '../../test/helpers/storeTestKit.js'

const kit = vi.hoisted(() => ({}))

vi.mock('@/lib/supabase', async () => {
  const { createSupabaseMock } = await import('../../test/helpers/storeTestKit.js')
  return createSupabaseMock(kit)
})
vi.mock('@/lib/realtime.js', async () => {
  const { createRealtimeMock } = await import('../../test/helpers/storeTestKit.js')
  return createRealtimeMock(kit)
})
vi.mock('@/lib/apiClient.js', async () => {
  const { createApiClientMock } = await import('../../test/helpers/storeTestKit.js')
  return createApiClientMock(kit)
})

import { useActivityStore } from './activityStore.js'

const activity = (id, overrides = {}) => ({ id, dungeon_id: 'd1', verb: 'opened', what: 'door', ...overrides })

describe('activityStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    resetKit(kit)
  })

  test('init loads the activity feed for the dungeon', async () => {
    kit.responses.dungeon_activity = { data: [activity('a1')], error: null }
    const store = useActivityStore()
    await store.init('s1', 'd1')

    expect(store.activities.map(a => a.id)).toEqual(['a1'])
    expect(kit.channels[0].options.sessionId).toBe('s1')
  })

  test('realtime INSERT prepends new entries and dedupes repeats', async () => {
    const store = useActivityStore()
    await store.init('s1', 'd1')

    kit.channels[0].emitPostgres('dungeon_activity', 'INSERT', activity('a1'))
    kit.channels[0].emitPostgres('dungeon_activity', 'INSERT', activity('a2'))
    kit.channels[0].emitPostgres('dungeon_activity', 'INSERT', activity('a1'))

    expect(store.activities.map(a => a.id)).toEqual(['a2', 'a1'])
  })

  test('record posts to the API and prepends the result without duplicating the echo', async () => {
    kit.api['post /dungeon-activity'] = body => activity('a-new', body)
    const store = useActivityStore()
    await store.init('s1', 'd1')

    await store.record('lit', 'torch')
    kit.channels[0].emitPostgres('dungeon_activity', 'INSERT', activity('a-new'))

    expect(store.activities.filter(a => a.id === 'a-new')).toHaveLength(1)
    expect(kit.apiClient.post).toHaveBeenCalledWith('/dungeon-activity', { dungeon_id: 'd1', verb: 'lit', what: 'torch' })
  })

  test('record before init is a no-op', async () => {
    const store = useActivityStore()
    await store.record('lit', 'torch')

    expect(kit.apiClient.post).not.toHaveBeenCalled()
  })

  test('a failed record logs and leaves the feed unchanged', async () => {
    kit.api['post /dungeon-activity'] = new kit.ApiError('nope', 500)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const store = useActivityStore()
    await store.init('s1', 'd1')

    await store.record('lit', 'torch')

    expect(store.activities).toEqual([])
    errorSpy.mockRestore()
  })

  test('switching dungeons sequentially replaces the old channel', async () => {
    const store = useActivityStore()
    await store.init('s1', 'd1')
    await store.init('s1', 'd2')

    expect(kit.channels).toHaveLength(2)
    expect(kit.channels[0].removed).toBe(true)
    expect(kit.channels[1].removed).toBe(false)
  })

  test('a stale fetch from a previous dungeon cannot overwrite the new feed', async () => {
    let resolveFirst
    kit.responses.dungeon_activity = () => new Promise(resolve => (resolveFirst = () => resolve({ data: [activity('old')], error: null })))
    const store = useActivityStore()
    const first = store.init('s1', 'd1')

    kit.responses.dungeon_activity = { data: [activity('new', { dungeon_id: 'd2' })], error: null }
    await store.init('s1', 'd2')
    resolveFirst()
    await first

    expect(store.activities.map(a => a.id)).toEqual(['new'])
    expect(kit.channels).toHaveLength(2)
    expect(kit.channels[0].removed).toBe(true)
    expect(kit.channels[1].removed).toBe(false)
  })

  test('an INSERT arriving while the snapshot is in flight is merged, not dropped', async () => {
    let resolveFetch
    kit.responses.dungeon_activity = () => new Promise(resolve => (resolveFetch = () => resolve({ data: [activity('a1', { created_at: '2026-07-06T10:00:00Z' })], error: null })))
    const store = useActivityStore()
    const pending = store.init('s1', 'd1')

    kit.channels[0].emitPostgres('dungeon_activity', 'INSERT', activity('a2', { created_at: '2026-07-06T11:00:00Z' }))
    resolveFetch()
    await pending

    expect(store.activities.map(a => a.id)).toEqual(['a2', 'a1'])
  })

  test('the first SUBSCRIBED status triggers exactly one catch-up refresh', async () => {
    kit.responses.dungeon_activity = { data: [], error: null }
    const store = useActivityStore()
    await store.init('s1', 'd1')

    kit.responses.dungeon_activity = { data: [activity('a1')], error: null }
    kit.channels[0].setStatus('SUBSCRIBED')
    await new Promise(resolve => setTimeout(resolve))
    expect(store.activities.map(a => a.id)).toEqual(['a1'])

    const queriesAfterFirst = kit.queries.length
    kit.channels[0].setStatus('SUBSCRIBED')
    await new Promise(resolve => setTimeout(resolve))
    expect(kit.queries.length).toBe(queriesAfterFirst)
  })

  test('overlapping inits for the same dungeon never leave a duplicate channel', async () => {
    let resolveFirst
    kit.responses.dungeon_activity = () => new Promise(resolve => (resolveFirst = () => resolve({ data: [], error: null })))
    const store = useActivityStore()
    const first = store.init('s1', 'd1')

    kit.responses.dungeon_activity = { data: [], error: null }
    await store.init('s1', 'd1')
    resolveFirst()
    await first

    expect(kit.channels.filter(c => !c.removed)).toHaveLength(1)
  })

  test('cleanup while an init is in flight prevents a zombie channel', async () => {
    let resolveFetch
    kit.responses.dungeon_activity = () => new Promise(resolve => (resolveFetch = () => resolve({ data: [activity('late')], error: null })))
    const store = useActivityStore()
    const pending = store.init('s1', 'd1')

    store.cleanup()
    resolveFetch()
    await pending

    expect(kit.channels.every(c => c.removed)).toBe(true)
    expect(store.activities).toEqual([])
  })

  test('reconnect refresh reloads the feed', async () => {
    const store = useActivityStore()
    await store.init('s1', 'd1')

    kit.responses.dungeon_activity = { data: [activity('a1')], error: null }
    await kit.channels[0].reconnect()

    expect(store.activities.map(a => a.id)).toEqual(['a1'])
  })

  test('cleanup removes the channel and clears the feed', async () => {
    kit.responses.dungeon_activity = { data: [activity('a1')], error: null }
    const store = useActivityStore()
    await store.init('s1', 'd1')
    store.cleanup()

    expect(kit.channels[0].removed).toBe(true)
    expect(store.activities).toEqual([])
  })
})
