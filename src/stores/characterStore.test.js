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

  test('adjustHp spends temp HP before real HP on damage', async () => {
    const store = await loadedStore([char('c1', { data: { maxHitPoints: 10, currentHp: 10, tempHp: 5 } })])

    store.adjustHp(-3)
    expect(store.character.tempHp).toBe(2)
    expect(store.character.currentHp).toBe(10)

    store.adjustHp(-4)
    expect(store.character.tempHp).toBe(0)
    expect(store.character.currentHp).toBe(8)
  })

  test('adjustHp healing never restores temp HP and clamps to max', async () => {
    const store = await loadedStore([char('c1', { data: { maxHitPoints: 10, currentHp: 4, tempHp: 3 } })])

    store.adjustHp(99)
    expect(store.character.currentHp).toBe(10)
    expect(store.character.tempHp).toBe(3)
  })

  test('adjustHpForChar matches adjustHp semantics for a non-active character', async () => {
    const store = await loadedStore([
      char('c1'),
      char('other', { user_id: 'them', data: { maxHitPoints: 10, currentHp: 10, tempHp: 3 } }),
    ])

    store.adjustHpForChar('other', -5)
    const other = store.characters.find(c => c.id === 'other')
    expect(other.data.tempHp).toBe(0)
    expect(other.data.currentHp).toBe(8)

    store.adjustHpForChar('other', 99)
    expect(store.characters.find(c => c.id === 'other').data.currentHp).toBe(10)
  })

  test('adjustCurrencyForChar posts to the narrow endpoint instead of the sheet PATCH', async () => {
    const store = await loadedStore([
      char('c1'),
      char('other', { user_id: 'them', data: { gold: 5 } }),
    ])

    await store.adjustCurrencyForChar('other', 'gold', 3)

    expect(store.characters.find(c => c.id === 'other').data.gold).toBe(8)
    expect(kit.apiClient.post).toHaveBeenCalledWith(
      '/characters/other/adjust-currency',
      { currency: 'gold', delta: 3 },
      'adjust_currency',
    )
    await vi.advanceTimersByTimeAsync(800)
    expect(kit.apiClient.patch).not.toHaveBeenCalled()
  })

  test('a realtime echo of a stale save cannot revert edits made while the save was in flight', async () => {
    let resolvePatch
    kit.api['patch /characters/c1'] = () => new Promise(resolve => { resolvePatch = resolve })
    const store = await loadedStore([char('c1', { data: { maxHitPoints: 10, currentHp: 10, tempHp: 2 } })])

    store.adjustHp(-3) // temp 2 -> 0, hp 10 -> 9
    await vi.advanceTimersByTimeAsync(800) // debounce elapses, patch now in flight
    expect(kit.apiClient.patch).toHaveBeenCalledTimes(1)

    store.adjustHp(-2) // hp 9 -> 7 while the patch is still in flight
    resolvePatch({})
    await vi.advanceTimersByTimeAsync(0)

    // the postgres echo of the first save arrives carrying the stale hp
    kit.channels[0].emitPostgres('characters', 'UPDATE', { id: 'c1', session_id: 's1', data: { maxHitPoints: 10, currentHp: 9, tempHp: 0 } })
    expect(store.character.currentHp).toBe(7)

    // and the newer edit still gets saved
    await vi.advanceTimersByTimeAsync(800)
    expect(kit.apiClient.patch).toHaveBeenCalledTimes(2)
    expect(kit.apiClient.patch).toHaveBeenLastCalledWith('/characters/c1', { data: expect.objectContaining({ currentHp: 7, tempHp: 0 }) }, 'save_character')
  })

  test('adjustTempHp and setTempHp never go below zero', async () => {
    const store = await loadedStore([char('c1', { data: { maxHitPoints: 10, currentHp: 10, tempHp: 2 } })])

    store.adjustTempHp(-5)
    expect(store.character.tempHp).toBe(0)

    store.setTempHp(8)
    expect(store.character.tempHp).toBe(8)

    store.setTempHp(-4)
    expect(store.character.tempHp).toBe(0)
  })

  test('renown defaults to the DEX modifier until it is set', async () => {
    const store = await loadedStore([char('c1', { data: { stats: { DEX: 16 } } })])

    expect(store.renownValue()).toBe(3)
    expect(store.character.renown).toBeUndefined()
  })

  test('adjustRenown seeds from the DEX modifier, then increments and logs', async () => {
    const store = await loadedStore([char('c1', { data: { stats: { DEX: 14 } } })])

    store.adjustRenown(1, 'carousing')
    expect(store.character.renown).toBe(3)
    expect(store.renownValue()).toBe(3)

    store.adjustRenown(-1, 'fighting in public')
    expect(store.character.renown).toBe(2)

    expect(store.character.renownLog).toHaveLength(2)
    expect(store.character.renownLog[0]).toMatchObject({ delta: 1, reason: 'carousing' })
    expect(store.character.renownLog[1]).toMatchObject({ delta: -1, reason: 'fighting in public' })
    expect(store.character.renownLog[0].at).toBeTruthy()
  })

  test('adjustRenown ignores a zero delta and stores an empty reason as null', async () => {
    const store = await loadedStore([char('c1', { data: { stats: { DEX: 10 }, renown: 4 } })])

    store.adjustRenown(0, 'nothing happens')
    expect(store.character.renown).toBe(4)
    expect(store.character.renownLog ?? []).toHaveLength(0)

    store.adjustRenown(2, '   ')
    expect(store.character.renown).toBe(6)
    expect(store.character.renownLog[0].reason).toBeNull()
  })

  test('setRenown logs only the net delta from the current value', async () => {
    const store = await loadedStore([char('c1', { data: { stats: { DEX: 12 }, renown: 5 } })])

    store.setRenown(8, 'legendary deed')
    expect(store.character.renown).toBe(8)
    expect(store.character.renownLog[0]).toMatchObject({ delta: 3, reason: 'legendary deed' })

    store.setRenown(8)
    expect(store.character.renownLog).toHaveLength(1)
  })

  test('setRenown with an unchanged value writes and logs nothing', async () => {
    const store = await loadedStore([char('c1', { data: { stats: { DEX: 14 } } })])
    kit.apiClient.post.mockClear()

    store.setRenown(2)

    expect(store.character.renown).toBeUndefined()
    expect(store.character.renownLog).toHaveLength(0)
    expect(kit.apiClient.post).not.toHaveBeenCalled()
  })

  test('renown changes put the reason in the session sheet log', async () => {
    const store = await loadedStore([char('c1', { data: { stats: { DEX: 10 }, renown: 2 } })])

    store.adjustRenown(1, 'carousing')

    expect(kit.apiClient.post).toHaveBeenCalledWith(
      '/character-sheet-log',
      expect.objectContaining({ what: expect.stringContaining('renown: 2 → 3 (carousing)') }),
      'log_sheet_change',
    )
  })

  test('renownLog is capped at 50 entries', async () => {
    const store = await loadedStore([char('c1', { data: { stats: { DEX: 10 }, renown: 0 } })])

    for (let i = 0; i < 55; i++) store.adjustRenown(1, `event ${i}`)

    expect(store.character.renown).toBe(55)
    expect(store.character.renownLog).toHaveLength(50)
    expect(store.character.renownLog[0].reason).toBe('event 5')
    expect(store.character.renownLog[49].reason).toBe('event 54')
  })

  test('deleteRenownEntry records the removal in the session sheet log', async () => {
    const store = await loadedStore([char('c1', { data: { stats: { DEX: 10 } } })])

    store.adjustRenown(-1, 'fighting in public')
    store.deleteRenownEntry(store.character.renownLog[0].id)

    expect(kit.apiClient.post).toHaveBeenCalledWith(
      '/character-sheet-log',
      expect.objectContaining({ what: expect.stringContaining('removed renown entry: -1 (fighting in public)') }),
      'log_sheet_change',
    )
  })

  test('loadAll augments rows so renownLog is always an array', async () => {
    const store = await loadedStore([char('c1', { data: { maxHitPoints: 10 } })])

    expect(store.character.renownLog).toEqual([])
    expect(store.character.tempHp).toBe(0)
  })

  test('deleteRenownEntry removes a single log entry by id', async () => {
    const store = await loadedStore([char('c1', { data: { stats: { DEX: 10 } } })])

    store.adjustRenown(1, 'a')
    store.adjustRenown(1, 'b')
    const targetId = store.character.renownLog[0].id
    store.deleteRenownEntry(targetId)

    expect(store.character.renownLog).toHaveLength(1)
    expect(store.character.renownLog[0].reason).toBe('b')
  })

  test('deleting weapon gear removes its linked attack but keeps others', async () => {
    const store = await loadedStore()

    store.addGearItem({ name: 'Longsword', slots: 1, quantity: 1, type: 'weapon', damageDie: '1d8' })
    store.addAttack('Bite: +2 to hit')
    const weapon = store.character.gear.find(g => g.name === 'Longsword')
    expect(store.character.attacks).toHaveLength(2)

    store.deleteGearItem(weapon.instanceId)

    expect(store.character.gear).toHaveLength(0)
    expect(store.character.attacks).toHaveLength(1)
    expect(store.character.attacks[0].raw).toBe('Bite: +2 to hit')
  })

  test('disabling weapon gear disables its linked attack and re-enabling restores it', async () => {
    const store = await loadedStore()

    store.addGearItem({ name: 'Longsword', slots: 1, quantity: 1, type: 'weapon', damageDie: '1d8' })
    const weapon = store.character.gear.find(g => g.name === 'Longsword')

    store.updateGearItem(weapon.instanceId, { disabled: true })
    expect(store.character.attacks[0].disabled).toBe(true)

    store.updateGearItem(weapon.instanceId, { disabled: false })
    expect(store.character.attacks[0].disabled).toBe(false)
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

  test('adjustLuck clamps at max and stops at zero', async () => {
    const store = await loadedStore([char('c1', { data: { luckTokens: { current: 2, max: 3 } } })])

    store.adjustLuck(1)
    expect(store.character.luckTokens.current).toBe(3)

    store.adjustLuck(3)
    expect(store.character.luckTokens.current).toBe(3)

    store.adjustLuck(-10)
    expect(store.character.luckTokens.current).toBe(0)
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

  test('cleanup flushes a pending debounced save exactly once so edits are not lost', async () => {
    kit.api['patch /characters/c1'] = {}
    const store = await loadedStore()
    store.updateField('name', 'Saved On Exit')
    store.cleanup()

    expect(kit.apiClient.patch).toHaveBeenCalledWith(
      '/characters/c1',
      { data: expect.objectContaining({ name: 'Saved On Exit' }) },
      'save_character',
    )

    await vi.advanceTimersByTimeAsync(2000)
    expect(kit.apiClient.patch).toHaveBeenCalledTimes(1)
    expect(store.characters).toEqual([])
  })
})

describe('shadowdark sheet support', () => {
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

  async function loadedStore(chars) {
    kit.responses.characters = { data: chars, error: null }
    kit.responses.session_members = { data: [], error: null }
    const store = useCharacterStore()
    await store.loadAll('s1')
    return store
  }

  test('gear slots default to STR with a floor of 10', async () => {
    const store = await loadedStore([
      char('strong', { data: { name: 'Ox', stats: { STR: 16 } } }),
      char('weak', { data: { name: 'Wisp', stats: { STR: 6 } } }),
      char('set', { data: { name: 'Custom', stats: { STR: 16 }, gearSlotsTotal: 12 } }),
    ])

    const by = id => store.characters.find(c => c.id === id).data
    expect(by('strong').gearSlotsTotal).toBe(16)
    expect(by('weak').gearSlotsTotal).toBe(10)
    expect(by('set').gearSlotsTotal).toBe(12)
  })

  test('awardHaul books the treasure, the xp, and one log entry together', async () => {
    const store = await loadedStore([char('c1', { data: { name: 'Ranna', XP: 3, treasures: [] } })])

    store.awardHaul('pearl necklace', 5)

    const data = store.characters[0].data
    expect(data.XP).toBe(8)
    expect(data.treasures).toEqual(['pearl necklace (+5 xp)'])
    expect(data.xpLog).toHaveLength(1)
    expect(data.xpLog[0].description).toBe('pearl necklace')
    expect(data.xpLog[0].xp).toBe(5)
  })

  test('a zero-xp haul is just loot', async () => {
    const store = await loadedStore([char('c1', { data: { name: 'Ranna', XP: 3, treasures: [] } })])

    store.awardHaul('worthless but pretty stone')

    const data = store.characters[0].data
    expect(data.XP).toBe(3)
    expect(data.treasures).toEqual(['worthless but pretty stone'])
    expect(data.xpLog[0].xp).toBe(0)
  })
})
