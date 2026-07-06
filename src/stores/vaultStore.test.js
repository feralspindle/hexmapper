import { describe, test, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { resetKit } from '../../test/helpers/storeTestKit.js'

const kit = vi.hoisted(() => ({ character: {}, lootToasts: [] }))

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
vi.mock('@/stores/characterStore.js', () => ({
  useCharacterStore: () => kit.character,
}))
vi.mock('@/composables/useLootToast.js', () => ({
  useLootToast: () => ({ push: toast => kit.lootToasts.push(toast) }),
}))

import { useVaultStore } from './vaultStore.js'

const lootItem = (overrides = {}) => ({
  id: 'loot-1',
  session_id: 's1',
  name: 'Longsword',
  quantity: 1,
  loot_type: 'item',
  currency: null,
  ...overrides,
})

describe('vaultStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    resetKit(kit)
    kit.lootToasts = []
    kit.character = {
      character: { name: 'Hero' },
      memberSelections: [{ user_id: 'me', display_name: 'Hero' }],
      adjustMoney: vi.fn(),
      addGearItem: vi.fn(),
      addGearItemToChar: vi.fn(),
      updateFieldForChar: vi.fn(),
    }
  })

  test('init loads loot, items, containers, and ledger, and opens five channels', async () => {
    kit.responses.party_vault_loot = { data: [lootItem()], error: null }
    kit.responses.party_vault_items = { data: [{ id: 'i1', container_id: null }], error: null }
    kit.responses.party_vault_containers = { data: [{ id: 'c1', name: 'Mule' }], error: null }
    kit.responses.party_bank_ledger = { data: [{ id: 'led1' }], error: null }
    const store = useVaultStore()
    await store.init('s1')

    expect(store.loot).toHaveLength(1)
    expect(store.items).toHaveLength(1)
    expect(store.containers).toHaveLength(1)
    expect(store.ledger).toHaveLength(1)
    expect(kit.channels).toHaveLength(5)
  })

  test('bankItems only includes items outside containers', async () => {
    kit.responses.party_vault_items = {
      data: [{ id: 'bank', container_id: null }, { id: 'stashed', container_id: 'c1' }],
      error: null,
    }
    const store = useVaultStore()
    await store.init('s1')

    expect(store.bankItems.map(i => i.id)).toEqual(['bank'])
  })

  test('claiming coin loot pays the character and broadcasts a coins toast', async () => {
    const store = useVaultStore()
    await store.init('s1')
    store.loot.push(lootItem({ loot_type: 'coins', currency: 'gold', quantity: 50 }))

    await store.claimLoot(store.loot[0])

    expect(kit.character.adjustMoney).toHaveBeenCalledWith('gold', 50)
    const toastChannel = kit.channels.find(c => c.name === 'vault:toasts:s1')
    expect(toastChannel.send).toHaveBeenCalledWith(expect.objectContaining({
      event: 'loot_toast',
      payload: expect.objectContaining({ type: 'coins', currency: 'gold', amount: 50, charName: 'Hero' }),
    }))
    expect(store.loot).toEqual([])
  })

  test('claiming coin loot infers the currency from the name', async () => {
    const store = useVaultStore()
    await store.init('s1')
    store.loot.push(lootItem({ name: 'Pouch of silver pieces', loot_type: 'coins', quantity: 30 }))

    await store.claimLoot(store.loot[0])

    expect(kit.character.adjustMoney).toHaveBeenCalledWith('silver', 30)
  })

  test('claiming item loot adds gear instead of money', async () => {
    const store = useVaultStore()
    await store.init('s1')
    store.loot.push(lootItem({ quantity: 2 }))

    await store.claimLoot(store.loot[0])

    expect(kit.character.addGearItem).toHaveBeenCalledWith({ name: 'Longsword', slots: 1, quantity: 2, type: 'sundry' })
    expect(kit.character.adjustMoney).not.toHaveBeenCalled()
  })

  test('claiming without an active character is a no-op that preserves the loot', async () => {
    kit.character.character = null
    const store = useVaultStore()
    await store.init('s1')
    store.loot.push(lootItem())

    await store.claimLoot(store.loot[0])

    expect(store.loot).toHaveLength(1)
    expect(kit.character.addGearItem).not.toHaveBeenCalled()
    expect(kit.apiClient.delete).not.toHaveBeenCalled()
  })

  describe('stash slot calculation', () => {
    test.each([
      ['a Ruby gem stack', { name: 'Ruby', quantity: 25 }, 3],
      ['coins', { name: 'Gold coins', loot_type: 'coins', currency: 'gold', quantity: 250 }, 3],
      ['ordinary items', { name: 'Arrows', quantity: 20 }, 20],
    ])('%s take the right number of slots', async (_label, item, expectedSlots) => {
      kit.api['post /vault-items'] = body => ({ id: 'vi1', ...body })
      const store = useVaultStore()
      await store.init('s1')
      store.loot.push(lootItem(item))

      await store.stashLoot(store.loot[0], 'c1')

      expect(kit.apiClient.post).toHaveBeenCalledWith('/vault-items', expect.objectContaining({ slots: expectedSlots }))
    })
  })

  test('splitLoot divides coins with the remainder going to lucky characters', async () => {
    const store = useVaultStore()
    await store.init('s1')
    store.loot.push(lootItem({ name: 'gold hoard', loot_type: 'coins', currency: 'gold', quantity: 10 }))
    const chars = [
      { id: 'c1', data: { name: 'A', gold: 5 } },
      { id: 'c2', data: { name: 'B', gold: 0 } },
      { id: 'c3', data: { name: 'C' } },
    ]

    await store.splitLoot(store.loot[0], chars)

    expect(kit.character.updateFieldForChar).toHaveBeenCalledTimes(3)
    const amounts = kit.character.updateFieldForChar.mock.calls.map(([id, field, value]) => {
      const char = chars.find(c => c.id === id)
      expect(field).toBe('gold')
      return value - (char.data.gold ?? 0)
    })
    expect(amounts.reduce((a, b) => a + b, 0)).toBe(10)
    expect(Math.min(...amounts)).toBe(3)
    expect(Math.max(...amounts)).toBe(4)
    expect(store.loot).toEqual([])
  })

  test('splitLoot with fewer items than characters does nothing', async () => {
    const store = useVaultStore()
    await store.init('s1')
    store.loot.push(lootItem({ quantity: 1 }))

    await store.splitLoot(store.loot[0], [{ id: 'c1', data: {} }, { id: 'c2', data: {} }])

    expect(store.loot).toHaveLength(1)
  })

  test('assignLoot gives gear per assignment and returns the leftover to the pile', async () => {
    kit.api['post /vault-loot'] = body => lootItem({ id: 'loot-rest', ...body })
    const store = useVaultStore()
    await store.init('s1')
    store.loot.push(lootItem({ quantity: 5 }))

    await store.assignLoot(store.loot[0], [
      { char: { id: 'c1' }, qty: 2 },
      { char: { id: 'c2' }, qty: 1 },
    ])

    expect(kit.character.addGearItemToChar).toHaveBeenCalledTimes(2)
    expect(kit.apiClient.post).toHaveBeenCalledWith('/vault-loot', expect.objectContaining({ quantity: 2 }))
    expect(store.loot.map(l => l.id)).toEqual(['loot-rest'])
  })

  test('withdrawCoins drains smallest stacks first and splits the last one', async () => {
    kit.api['post /vault-ledger'] = body => ({ id: 'led-new', ...body })
    const store = useVaultStore()
    await store.init('s1')
    store.items.push(
      { id: 'big', container_id: null, currency: 'gold', quantity: 100 },
      { id: 'small', container_id: null, currency: 'gold', quantity: 10 },
    )

    await store.withdrawCoins('gold', 30)

    expect(store.items.map(i => i.id)).toEqual(['big'])
    expect(store.items[0].quantity).toBe(80)
    expect(kit.character.adjustMoney).toHaveBeenCalledWith('gold', 30)
    expect(kit.apiClient.post).toHaveBeenCalledWith('/vault-ledger', expect.objectContaining({ gold_change: -30 }))
  })

  test('realtime loot events from other clients apply; own echoes are suppressed', async () => {
    kit.api['post /vault-loot'] = body => lootItem({ id: 'mine', ...body })
    const store = useVaultStore()
    await store.init('s1')
    const mine = await store.addLoot('Gem')
    const lootChannel = kit.channels.find(c => c.name.startsWith('vault:loot:'))

    lootChannel.emitPostgres('party_vault_loot', 'INSERT', lootItem({ id: 'mine', source_client: mine.source_client }))
    expect(store.loot.filter(l => l.id === 'mine')).toHaveLength(1)

    lootChannel.emitPostgres('party_vault_loot', 'INSERT', lootItem({ id: 'theirs', source_client: 'other' }))
    expect(store.loot.map(l => l.id)).toEqual(['mine', 'theirs'])
  })

  test('deleting a container (locally or via realtime) moves its items to the bank', async () => {
    kit.responses.party_vault_containers = { data: [{ id: 'c1' }, { id: 'c2' }], error: null }
    kit.responses.party_vault_items = {
      data: [{ id: 'i1', container_id: 'c1' }, { id: 'i2', container_id: 'c2' }],
      error: null,
    }
    const store = useVaultStore()
    await store.init('s1')

    await store.removeContainer('c1')
    expect(store.items.find(i => i.id === 'i1').container_id).toBeNull()

    const containersChannel = kit.channels.find(c => c.name.startsWith('vault:containers:'))
    containersChannel.emitPostgres('party_vault_containers', 'DELETE', {}, { id: 'c2' })
    expect(store.items.find(i => i.id === 'i2').container_id).toBeNull()
    expect(store.containers).toEqual([])
  })

  test('loot toast broadcasts loop back to the local toast queue (self-receive)', async () => {
    const store = useVaultStore()
    await store.init('s1')
    const toastChannel = kit.channels.find(c => c.name === 'vault:toasts:s1')
    expect(toastChannel.options.config.broadcast.self).toBe(true)

    toastChannel.emitBroadcast('loot_toast', { type: 'item', itemName: 'Gem' })

    expect(kit.lootToasts).toEqual([{ type: 'item', itemName: 'Gem' }])
  })

  test('a stale init never subscribes channels for the abandoned session', async () => {
    let resolveFirst
    let lootCalls = 0
    kit.responses.party_vault_loot = () => {
      lootCalls += 1
      if (lootCalls === 1) return new Promise(resolve => (resolveFirst = () => resolve({ data: [], error: null })))
      return { data: [], error: null }
    }
    const store = useVaultStore()
    const first = store.init('s1')

    await store.init('s2')
    resolveFirst()
    await first

    const liveChannels = kit.channels.filter(c => !c.removed)
    expect(liveChannels).toHaveLength(5)
    expect(liveChannels.every(c => c.name.includes(':s2'))).toBe(true)
  })

  test('cleanup removes all channels and clears vault state', async () => {
    kit.responses.party_vault_loot = { data: [lootItem()], error: null }
    const store = useVaultStore()
    await store.init('s1')
    store.cleanup()

    expect(kit.channels.every(c => c.removed)).toBe(true)
    expect(store.loot).toEqual([])
    expect(store.items).toEqual([])
  })
})
