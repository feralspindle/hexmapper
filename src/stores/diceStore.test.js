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
vi.mock('@/stores/authStore.js', () => ({
  useAuthStore: () => ({ user: { id: 'me' }, displayName: 'Me' }),
}))
vi.mock('@/lib/diceSound.js', () => ({
  playDiceSound: vi.fn(),
  playChatSound: vi.fn(),
}))

import { playDiceSound } from '@/lib/diceSound.js'
import { useDiceStore } from './diceStore.js'

const roll = (id, overrides = {}) => ({
  id,
  session_id: 's1',
  user_id: 'someone-else',
  pending: { d20: 1 },
  results: [4],
  total: 4,
  modifier: 0,
  created_at: `2026-07-04T00:00:0${id.at(-1) ?? 0}Z`,
  ...overrides,
})

describe('diceStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    resetKit(kit)
    vi.mocked(playDiceSound).mockClear()
  })

  test('init loads roll history and annotations', async () => {
    kit.responses.dice_rolls = { data: [roll('r1'), roll('r2')], error: null }
    kit.responses.dice_roll_annotations = { data: [{ id: 'a1', roll_id: 'r1', body: 'nice' }], error: null }
    const store = useDiceStore()
    await store.init('s1')

    expect(store.rolls.map(r => r.id)).toEqual(['r2', 'r1'])
    expect(store.annotations.r1).toHaveLength(1)
  })

  test('rollsWithStreaks marks per-user hot and cold streaks without mutating raw rolls', async () => {
    kit.responses.dice_rolls = {
      data: [
        roll('r1', { user_id: 'hot', total: 11 }),
        roll('r2', { user_id: 'hot', total: 12 }),
        roll('r3', { user_id: 'cold', total: 3 }),
        roll('r4', { user_id: 'hot', total: 13 }),
        roll('r5', { user_id: 'cold', total: 4 }),
        roll('r6', { user_id: 'cold', total: 5 }),
      ],
      error: null,
    }
    const store = useDiceStore()
    await store.init('s1')

    expect(store.rollsWithStreaks.find(r => r.id === 'r4').streak).toMatchObject({ kind: 'hot', count: 3 })
    expect(store.rollsWithStreaks.find(r => r.id === 'r6').streak).toMatchObject({ kind: 'cold', count: 3 })
    expect(store.rolls.find(r => r.id === 'r4').streak).toBeUndefined()
  })

  test('re-init with the same session id does not create a duplicate channel', async () => {
    const store = useDiceStore()
    await store.init('s1')
    await store.init('s1')

    expect(kit.channels).toHaveLength(1)
  })

  test('incoming realtime roll from another user is prepended and plays a sound', async () => {
    const store = useDiceStore()
    await store.init('s1')

    kit.channels[0].emitPostgres('dice_rolls', 'INSERT', roll('r9'))

    expect(store.rolls[0].id).toBe('r9')
    expect(store.latestRoll.id).toBe('r9')
    expect(playDiceSound).toHaveBeenCalledTimes(1)
  })

  test('own rolls and duplicate ids arriving via realtime are ignored (echo suppression)', async () => {
    kit.responses.dice_rolls = { data: [roll('r1')], error: null }
    const store = useDiceStore()
    await store.init('s1')

    kit.channels[0].emitPostgres('dice_rolls', 'INSERT', roll('mine', { user_id: 'me' }))
    kit.channels[0].emitPostgres('dice_rolls', 'INSERT', roll('r1'))

    expect(store.rolls.map(r => r.id)).toEqual(['r1'])
    expect(playDiceSound).not.toHaveBeenCalled()
  })

  test('rollDice posts to the API, records the roll, and clears pending state', async () => {
    kit.api['post /dice-rolls'] = body => roll('server-roll', { pending: body.pending })
    const store = useDiceStore()
    await store.init('s1')

    const promise = store.rollDice({ d20: 1 }, 2, 'attack')
    expect(store.pendingRoll).not.toBeNull()
    const result = await promise

    expect(result.id).toBe('server-roll')
    expect(store.rolls[0].id).toBe('server-roll')
    expect(store.pendingRoll).toBeNull()
    expect(playDiceSound).toHaveBeenCalledTimes(1)
  })

  test('a second rollDice while one is pending is dropped', async () => {
    let resolvePost
    kit.api['post /dice-rolls'] = () => new Promise(resolve => (resolvePost = () => resolve(roll('only'))))
    const store = useDiceStore()
    await store.init('s1')

    const first = store.rollDice({ d6: 1 }, 0)
    await store.rollDice({ d6: 2 }, 0)
    resolvePost()
    await first

    expect(store.rolls.filter(r => r.id === 'only')).toHaveLength(1)
    expect(kit.apiClient.post).toHaveBeenCalledTimes(1)
  })

  test('a failed rollDice leaves history untouched and clears pending', async () => {
    kit.api['post /dice-rolls'] = new kit.ApiError('nope', 500)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const store = useDiceStore()
    await store.init('s1')

    const result = await store.rollDice({ d20: 1 }, 0)

    expect(result).toBeUndefined()
    expect(store.rolls).toEqual([])
    expect(store.pendingRoll).toBeNull()
    errorSpy.mockRestore()
  })

  test('addAnnotation is optimistic and swaps the temp entry for the server row', async () => {
    kit.api['post /dice-roll-annotations'] = body => ({ id: 'server-ann', roll_id: 'r1', body: body.body })
    const store = useDiceStore()
    await store.init('s1')

    await store.addAnnotation('r1', '  crit!  ')

    expect(store.annotations.r1).toHaveLength(1)
    expect(store.annotations.r1[0]).toMatchObject({ id: 'server-ann', body: 'crit!' })
  })

  test('a failed annotation rolls the optimistic entry back', async () => {
    kit.api['post /dice-roll-annotations'] = new kit.ApiError('nope', 500)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const store = useDiceStore()
    await store.init('s1')

    await store.addAnnotation('r1', 'crit!')

    expect(store.annotations.r1).toEqual([])
    errorSpy.mockRestore()
  })

  test('annotation realtime INSERT dedupes against existing annotations', async () => {
    const store = useDiceStore()
    await store.init('s1')

    kit.channels[0].emitPostgres('dice_roll_annotations', 'INSERT', { id: 'a1', roll_id: 'r1', body: 'x' })
    kit.channels[0].emitPostgres('dice_roll_annotations', 'INSERT', { id: 'a1', roll_id: 'r1', body: 'x' })

    expect(store.annotations.r1).toHaveLength(1)
  })

  test('a stale refresh from before cleanup cannot repopulate the store (generation guard)', async () => {
    let resolveFetch
    kit.responses.dice_rolls = () => new Promise(resolve => (resolveFetch = () => resolve({ data: [roll('stale')], error: null })))
    const store = useDiceStore()
    const initPromise = store.init('s1')

    store.cleanup()
    kit.responses.dice_rolls = { data: [], error: null }
    resolveFetch()
    await initPromise

    expect(store.rolls).toEqual([])
  })

  test('cleanup removes the channel and resets all state', async () => {
    kit.responses.dice_rolls = { data: [roll('r1')], error: null }
    const store = useDiceStore()
    await store.init('s1')
    store.cleanup()

    expect(kit.channels[0].removed).toBe(true)
    expect(store.rolls).toEqual([])
    expect(store.annotations).toEqual({})
    expect(store.latestRoll).toBeNull()
  })
})
