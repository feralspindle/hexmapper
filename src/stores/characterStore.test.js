import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { resetKit } from '../../test/helpers/storeTestKit.js'

const kit = vi.hoisted(() => ({ auth: {} }))

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
  useAuthStore: () => kit.auth,
}))
vi.mock('@/lib/diceSound.js', () => ({
  playLuckSound: vi.fn(),
  playDiceSound: vi.fn(),
  playChatSound: vi.fn(),
}))

import { statMod, parseDamageDie, parseAttack, useCharacterStore } from './characterStore.js'

const char = (id, overrides = {}) => ({
  id,
  session_id: 's1',
  user_id: 'me',
  data: { name: `Char ${id}`, maxHitPoints: 10, currentHp: 10, ...overrides.data },
  ...overrides,
})

describe('character sheet helpers', () => {
  test('statMod follows the (stat - 10) / 2 rounding-down rule', () => {
    expect(statMod(10)).toBe(0)
    expect(statMod(11)).toBe(0)
    expect(statMod(12)).toBe(1)
    expect(statMod(9)).toBe(-1)
    expect(statMod(8)).toBe(-1)
    expect(statMod(7)).toBe(-2)
    expect(statMod(20)).toBe(5)
    expect(statMod(3)).toBe(-4)
  })

  test('parseDamageDie handles counts, sides, and modifiers', () => {
    expect(parseDamageDie('d6')).toEqual({ count: 1, sides: 6, modifier: 0 })
    expect(parseDamageDie('2d8+3')).toEqual({ count: 2, sides: 8, modifier: 3 })
    expect(parseDamageDie('1d4-1')).toEqual({ count: 1, sides: 4, modifier: -1 })
    expect(parseDamageDie(' D12 ')).toEqual({ count: 1, sides: 12, modifier: 0 })
  })

  test('parseDamageDie rejects garbage', () => {
    expect(parseDamageDie(null)).toBeNull()
    expect(parseDamageDie('')).toBeNull()
    expect(parseDamageDie('sword')).toBeNull()
    expect(parseDamageDie('d')).toBeNull()
  })

  test('parseAttack extracts a label and bonus', () => {
    expect(parseAttack('Longsword: +4 to hit')).toEqual({ label: 'Longsword', bonus: 4, raw: 'Longsword: +4 to hit' })
    expect(parseAttack('Bite -1')).toEqual({ label: 'Bite -1', bonus: -1, raw: 'Bite -1' })
  })
})

describe('characterStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    resetKit(kit)
    kit.auth = { user: { id: 'me' }, displayName: 'Me' }
    localStorage.clear()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  async function loadedStore(chars = [char('c1')], members = []) {
    kit.responses.characters = { data: chars, error: null }
    kit.responses.session_members = { data: members, error: null }
    const store = useCharacterStore()
    await store.loadAll('s1')
    return store
  }

  test('loadAll loads characters and auto-selects your only character', async () => {
    const store = await loadedStore([char('c1'), char('other', { user_id: 'them' })])

    expect(store.characters).toHaveLength(2)
    expect(store.activeId).toBe('c1')
    expect(store.myCharacters.map(c => c.id)).toEqual(['c1'])
    expect(store.otherCharacters.map(c => c.id)).toEqual(['other'])
    expect(store.canEditActiveCharacter).toBe(true)
  })

  test('loadAll restores the previously active character from localStorage', async () => {
    localStorage.setItem('char_active_me_s1', 'c2')
    const store = await loadedStore([char('c1'), char('c2')])

    expect(store.activeId).toBe('c2')
  })

  test('setActive persists locally, updates member selections, and notifies others', async () => {
    const store = await loadedStore([char('c1'), char('c2')])
    store.setActive('c2')

    expect(localStorage.getItem('char_active_me_s1')).toBe('c2')
    expect(store.memberSelections.find(m => m.user_id === 'me').active_character_id).toBe('c2')
    expect(kit.channels[0].send).toHaveBeenCalledWith(expect.objectContaining({
      event: 'active_character_changed',
      payload: { userId: 'me', characterId: 'c2' },
    }))
    expect(kit.apiClient.post).toHaveBeenCalledWith(
      '/session-members/active',
      { session_id: 's1', active_character_id: 'c2' },
      'set_active_character',
    )
  })

  test('updateField debounces the save (800ms) and the broadcast (100ms)', async () => {
    kit.api['patch /characters/c1'] = {}
    const store = await loadedStore()

    store.updateField('name', 'A')
    store.updateField('name', 'AB')
    store.updateField('name', 'ABC')

    expect(store.character.name).toBe('ABC')
    expect(kit.apiClient.patch).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(100)
    const broadcasts = kit.channels[0].send.mock.calls.filter(([m]) => m.event === 'character_updated')
    expect(broadcasts).toHaveLength(1)

    await vi.advanceTimersByTimeAsync(800)
    expect(kit.apiClient.patch).toHaveBeenCalledTimes(1)
    expect(kit.apiClient.patch).toHaveBeenCalledWith('/characters/c1', { data: expect.objectContaining({ name: 'ABC' }) }, 'save_character')
  })

  test('adjustHp clamps between 0 and max', async () => {
    const store = await loadedStore()

    store.adjustHp(-15)
    expect(store.character.currentHp).toBe(0)

    store.adjustHp(99)
    expect(store.character.currentHp).toBe(10)
  })

  test('adjustMaxHp drags currentHp down when the max drops below it', async () => {
    const store = await loadedStore()

    store.adjustMaxHp(-5)

    expect(store.character.maxHitPoints).toBe(5)
    expect(store.character.currentHp).toBe(5)
  })

  test('adjustMoney never goes negative', async () => {
    const store = await loadedStore([char('c1', { data: { gold: 3 } })])

    store.adjustMoney('gold', -10)

    expect(store.character.gold).toBe(0)
  })

  test('adding a weapon also creates a linked attack entry', async () => {
    const store = await loadedStore()

    store.addGearItem({ name: 'Warhammer', slots: 2, quantity: 1, type: 'weapon', damageDie: '1d10' })

    const gearItem = store.character.gear[0]
    expect(gearItem).toMatchObject({ name: 'Warhammer', slots: 2, type: 'weapon' })
    expect(store.character.attacks[0]).toMatchObject({
      raw: 'Warhammer: +0 to hit',
      damageDie: '1d10',
      gearInstanceId: gearItem.instanceId,
    })
  })

  test('spendLuckToken decrements, broadcasts, and stops at zero', async () => {
    const store = await loadedStore([char('c1', { data: { luckTokens: { current: 1, max: 3 } } })])

    store.spendLuckToken()
    expect(store.character.luckTokens.current).toBe(0)
    expect(store.luckEvents).toHaveLength(1)
    expect(kit.channels[0].send).toHaveBeenCalledWith(expect.objectContaining({ event: 'luck_spent' }))

    store.spendLuckToken()
    expect(store.character.luckTokens.current).toBe(0)
    expect(store.luckEvents).toHaveLength(1)
  })

  test('a character_updated broadcast from another client updates that character', async () => {
    const store = await loadedStore([char('c1'), char('c2', { user_id: 'them' })])

    kit.channels[0].emitBroadcast('character_updated', {
      characterId: 'c2',
      data: { name: 'Renamed', maxHitPoints: 8 },
      sourceClient: 'other-client',
    })

    expect(store.characters.find(c => c.id === 'c2').data.name).toBe('Renamed')
  })

  test('an UPDATE for your own active character never stomps local edits', async () => {
    const store = await loadedStore([char('c1')])
    store.updateField('name', 'Local Edit')

    kit.channels[0].emitPostgres('characters', 'UPDATE', char('c1', { data: { name: 'Server Version' } }))

    expect(store.character.name).toBe('Local Edit')
  })

  test('refresh keeps local versions of the active and dirty characters', async () => {
    const store = await loadedStore([char('c1'), char('c2', { user_id: 'them' })])
    store.updateField('name', 'Dirty Local')

    kit.responses.characters = {
      data: [char('c1', { data: { name: 'Server c1' } }), char('c2', { user_id: 'them', data: { name: 'Server c2' } })],
      error: null,
    }
    await store.refresh()

    expect(store.characters.find(c => c.id === 'c1').data.name).toBe('Dirty Local')
    expect(store.characters.find(c => c.id === 'c2').data.name).toBe('Server c2')
  })

  test('member selections referencing unknown characters trigger a targeted fetch', async () => {
    kit.responses.characters = (calls) => {
      const isInQuery = calls.some(([method]) => method === 'in')
      if (isInQuery) return { data: [char('gm-char', { user_id: 'gm' })], error: null }
      return { data: [char('c1')], error: null }
    }
    kit.responses.session_members = {
      data: [{ user_id: 'gm', active_character_id: 'gm-char', display_name: 'GM' }],
      error: null,
    }
    const store = useCharacterStore()
    await store.loadAll('s1')

    expect(store.characters.map(c => c.id)).toContain('gm-char')
  })

  test('initiative broadcasts clear and set across clients', async () => {
    const store = await loadedStore([char('c1', { data: { initiative: 12 } })])

    kit.channels[0].emitBroadcast('gm_initiative_set', { score: 15 })
    expect(store.gmInitiative).toBe(15)

    kit.channels[0].emitBroadcast('initiative_cleared', {})
    expect(store.gmInitiative).toBeNull()
    expect(store.character.initiative).toBeNull()
  })

  test('importCharacter augments missing hp/luck and makes it active', async () => {
    kit.api['post /characters'] = body => ({ id: 'imported', session_id: 's1', user_id: 'me', data: body.data })
    const store = await loadedStore([])

    const result = await store.importCharacter({ name: 'Fresh', maxHitPoints: 7 })

    expect(result.data).toMatchObject({ currentHp: 7, luckTokens: { current: 1, max: 3 } })
    expect(store.activeId).toBe('imported')
  })

  test('deleteCharacter falls back to your remaining character', async () => {
    kit.api['delete /characters/c1'] = null
    const store = await loadedStore([char('c1'), char('c2')])
    store.setActive('c1')

    await store.deleteCharacter('c1')

    expect(store.characters.map(c => c.id)).toEqual(['c2'])
    expect(store.activeId).toBe('c2')
  })

  test('cleanup cancels pending debounced saves', async () => {
    const store = await loadedStore()
    store.updateField('name', 'Never Saved')
    store.cleanup()

    await vi.advanceTimersByTimeAsync(2000)

    expect(kit.apiClient.patch).not.toHaveBeenCalled()
    expect(store.characters).toEqual([])
  })
})
