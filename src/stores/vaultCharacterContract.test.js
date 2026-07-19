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

import { useCharacterStore } from './characterStore.js'
import { useVaultStore } from './vaultStore.js'

// both stores run REAL here, only the io edges are mocked. the sheet PATCH is
// owner/gm-only server-side, and the vault's party operations write to
// characters the caller does not own - they must route through the narrow
// member-allowed endpoints. unit tests that mock the character store cannot
// see a vault flow quietly picking the forbidden PATCH (that is exactly how
// loot assignment broke when the PATCH was restricted), so this pins the
// actual requests each flow emits.
describe('vault -> character write-path contract', () => {
  let characterStore
  let vaultStore

  const mine = { id: 'mine', session_id: 's1', user_id: 'me', data: { name: 'Mine', gold: 1, gear: [] } }
  const theirs = { id: 'theirs', session_id: 's1', user_id: 'them', data: { name: 'Theirs', gold: 2, gear: [] } }

  beforeEach(async () => {
    setActivePinia(createPinia())
    resetKit(kit)
    kit.auth = { user: { id: 'me' }, displayName: 'Me' }
    localStorage.clear()
    vi.useFakeTimers()

    kit.api['post /characters/mine/adjust-currency'] = body => ({ ...mine, data: { ...mine.data, gold: mine.data.gold + body.delta } })
    kit.api['post /characters/theirs/adjust-currency'] = body => ({ ...theirs, data: { ...theirs.data, gold: theirs.data.gold + body.delta } })
    kit.api['post /characters/theirs/grant-gear'] = body => ({
      ...theirs,
      data: { ...theirs.data, gear: [{ instanceId: 'srv-1', disabled: false, ...body }] },
    })

    kit.responses.characters = { data: [mine, theirs], error: null }
    kit.responses.session_members = { data: [], error: null }
    characterStore = useCharacterStore()
    await characterStore.loadAll('s1')
    vaultStore = useVaultStore()
    await vaultStore.init('s1')
  })

  afterEach(async () => {
    await vi.runOnlyPendingTimersAsync()
    vi.useRealTimers()
  })

  function sheetPatches() {
    return kit.apiClient.patch.mock.calls.filter(([path]) => path.startsWith('/characters/'))
  }

  test('splitting coins never emits the owner-only sheet PATCH', async () => {
    vaultStore.loot.push({ id: 'loot-1', name: 'gold hoard', loot_type: 'coins', currency: 'gold', quantity: 10 })

    await vaultStore.splitLoot(vaultStore.loot[0], [
      characterStore.characters.find(c => c.id === 'mine'),
      characterStore.characters.find(c => c.id === 'theirs'),
    ])
    await vi.advanceTimersByTimeAsync(2000)

    const currencyPosts = kit.apiClient.post.mock.calls.filter(([path]) => path.includes('/adjust-currency'))
    expect(currencyPosts.map(([path]) => path).sort()).toEqual([
      '/characters/mine/adjust-currency',
      '/characters/theirs/adjust-currency',
    ])
    expect(sheetPatches()).toEqual([])
  })

  test('assigning an item never emits the owner-only sheet PATCH', async () => {
    vaultStore.loot.push({ id: 'loot-2', name: 'rope', loot_type: 'item', quantity: 2 })

    await vaultStore.assignLoot(vaultStore.loot[0], [
      { char: characterStore.characters.find(c => c.id === 'theirs'), qty: 2 },
    ])
    await vi.advanceTimersByTimeAsync(2000)

    expect(kit.apiClient.post).toHaveBeenCalledWith(
      '/characters/theirs/grant-gear',
      expect.objectContaining({ name: 'rope', quantity: 2 }),
      'grant_gear',
    )
    expect(sheetPatches()).toEqual([])
  })

  test('claiming loot to your own sheet still uses the owner PATCH, and only on your own character', async () => {
    vaultStore.loot.push({ id: 'loot-3', name: 'rope', loot_type: 'item', quantity: 1 })

    await vaultStore.claimLoot(vaultStore.loot[0])
    await vi.advanceTimersByTimeAsync(2000)

    const patches = sheetPatches()
    expect(patches.length).toBeGreaterThan(0)
    expect(patches.every(([path]) => path === '/characters/mine')).toBe(true)
  })
})
