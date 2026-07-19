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
      grantGearItemToChar: vi.fn(),
      updateFieldForChar: vi.fn(),
      adjustCurrencyForChar: vi.fn(),
      deleteGearItem: vi.fn(),
    }
  })

  test('init loads loot, items, containers, and ledger, and opens six channels', async () => {
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
    expect(kit.channels).toHaveLength(6)
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

  test('claiming part of an item stack shrinks the pile in place', async () => {
    const store = useVaultStore()
    await store.init('s1')
    store.loot.push(lootItem({ quantity: 5 }))

    await store.claimLoot(store.loot[0], 2)

    expect(kit.character.addGearItem).toHaveBeenCalledWith({ name: 'Longsword', slots: 1, quantity: 2, type: 'sundry' })
    expect(kit.apiClient.patch).toHaveBeenCalledWith('/vault-loot/loot-1', expect.objectContaining({ quantity: 3 }))
    expect(kit.apiClient.delete).not.toHaveBeenCalled()
    expect(store.loot).toHaveLength(1)
    expect(store.loot[0]).toMatchObject({ id: 'loot-1', quantity: 3 })
  })

  test('claiming part of a coin stack pays only that amount and keeps the row', async () => {
    const store = useVaultStore()
    await store.init('s1')
    store.loot.push(lootItem({ loot_type: 'coins', currency: 'gold', quantity: 50 }))

    await store.claimLoot(store.loot[0], 10)

    expect(kit.character.adjustMoney).toHaveBeenCalledWith('gold', 10)
    expect(kit.apiClient.patch).toHaveBeenCalledWith('/vault-loot/loot-1', expect.objectContaining({ quantity: 40 }))
    expect(store.loot[0]).toMatchObject({ id: 'loot-1', quantity: 40, currency: 'gold' })
  })

  test('a claim qty above the stack size claims the whole stack once', async () => {
    const store = useVaultStore()
    await store.init('s1')
    store.loot.push(lootItem({ quantity: 3 }))

    await store.claimLoot(store.loot[0], 99)

    expect(kit.character.addGearItem).toHaveBeenCalledWith({ name: 'Longsword', slots: 1, quantity: 3, type: 'sundry' })
    expect(kit.apiClient.patch).not.toHaveBeenCalled()
    expect(store.loot).toEqual([])
  })

  test('realtime loot updates from other clients apply; own echoes are suppressed', async () => {
    kit.responses.party_vault_loot = { data: [lootItem({ quantity: 5 })], error: null }
    const store = useVaultStore()
    await store.init('s1')
    const lootChannel = kit.channels.find(c => c.name.startsWith('vault:loot:'))

    lootChannel.emitPostgres('party_vault_loot', 'UPDATE', lootItem({ quantity: 3, source_client: 'other' }))
    expect(store.loot[0].quantity).toBe(3)

    await store.claimLoot(store.loot[0], 1)
    const ownClientId = kit.apiClient.patch.mock.calls.at(-1)[1].source_client
    lootChannel.emitPostgres('party_vault_loot', 'UPDATE', lootItem({ quantity: 3, source_client: ownClientId }))
    expect(store.loot[0].quantity).toBe(2)
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
      ['ordinary items', { name: 'Arrows', quantity: 20 }, 1],
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

    expect(kit.character.adjustCurrencyForChar).toHaveBeenCalledTimes(3)
    const amounts = kit.character.adjustCurrencyForChar.mock.calls.map(([, field, amount]) => {
      expect(field).toBe('gold')
      return amount
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

  test('assignLoot gives gear per assignment and shrinks the pile by the leftover', async () => {
    const store = useVaultStore()
    await store.init('s1')
    store.loot.push(lootItem({ quantity: 5 }))

    await store.assignLoot(store.loot[0], [
      { char: { id: 'c1' }, qty: 2 },
      { char: { id: 'c2' }, qty: 1 },
    ])

    expect(kit.character.grantGearItemToChar).toHaveBeenCalledTimes(2)
    expect(kit.character.grantGearItemToChar).toHaveBeenCalledWith('c1', expect.objectContaining({ quantity: 2 }))
    expect(kit.apiClient.patch).toHaveBeenCalledWith('/vault-loot/loot-1', expect.objectContaining({ quantity: 2 }))
    expect(store.loot[0]).toMatchObject({ id: 'loot-1', quantity: 2 })
  })

  test('assigning the whole pile deletes the row', async () => {
    const store = useVaultStore()
    await store.init('s1')
    store.loot.push(lootItem({ quantity: 2 }))

    await store.assignLoot(store.loot[0], [{ char: { id: 'c1' }, qty: 2 }])

    expect(kit.apiClient.delete).toHaveBeenCalledWith('/vault-loot/loot-1')
    expect(store.loot).toEqual([])
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

  test('a late INSERT echo cannot resurrect loot this client already removed', async () => {
    kit.responses.party_vault_loot = { data: [lootItem()], error: null }
    const store = useVaultStore()
    await store.init('s1')

    await store.claimLoot(store.loot[0])
    expect(store.loot).toEqual([])

    const lootChannel = kit.channels.find(c => c.name.startsWith('vault:loot:'))
    lootChannel.emitPostgres('party_vault_loot', 'INSERT', lootItem({ source_client: 'other' }))
    expect(store.loot).toEqual([])
  })

  test('a stale refresh snapshot cannot resurrect loot this client already removed', async () => {
    kit.responses.party_vault_loot = { data: [lootItem()], error: null }
    const store = useVaultStore()
    await store.init('s1')

    await store.claimLoot(store.loot[0])

    await store.refresh()
    expect(store.loot).toEqual([])
  })

  test('a stale refresh snapshot cannot resurrect loot another client deleted', async () => {
    kit.responses.party_vault_loot = { data: [lootItem()], error: null }
    const store = useVaultStore()
    await store.init('s1')

    const lootChannel = kit.channels.find(c => c.name.startsWith('vault:loot:'))
    lootChannel.emitPostgres('party_vault_loot', 'DELETE', {}, { id: 'loot-1' })
    expect(store.loot).toEqual([])

    await store.refresh()
    expect(store.loot).toEqual([])
  })

  test('a failed delete releases the tombstone so refresh restores the row', async () => {
    kit.responses.party_vault_loot = { data: [lootItem()], error: null }
    kit.api['delete /vault-loot/loot-1'] = new Error('boom')
    const store = useVaultStore()
    await store.init('s1')

    await store.claimLoot(store.loot[0])
    expect(store.loot).toEqual([])

    await store.refresh()
    expect(store.loot.map(l => l.id)).toEqual(['loot-1'])
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

  describe('vault ↔ gear transfers', () => {
    const storedItem = (overrides = {}) => ({
      id: 'i1',
      session_id: 's1',
      container_id: 'c1',
      name: 'Rope',
      quantity: 1,
      slots: 1,
      item_type: 'sundry',
      currency: null,
      ...overrides,
    })

    test('taking a stored item adds it to gear and deletes the row', async () => {
      kit.responses.party_vault_containers = { data: [{ id: 'c1', name: 'Mule' }], error: null }
      const store = useVaultStore()
      await store.init('s1')
      store.items.push(storedItem())

      await store.takeVaultItem(store.items[0])

      expect(kit.character.addGearItem).toHaveBeenCalledWith({ name: 'Rope', slots: 1, quantity: 1, type: 'sundry' })
      expect(kit.apiClient.delete).toHaveBeenCalledWith('/vault-items/i1')
      expect(store.items).toEqual([])
      expect(kit.apiClient.post).toHaveBeenCalledWith('/vault-activity', expect.objectContaining({
        verb: 'took',
        what: 'Rope from Mule',
        character_name: 'Hero',
      }))
    })

    test('taking part of a stack shrinks it in place', async () => {
      const store = useVaultStore()
      await store.init('s1')
      store.items.push(storedItem({ quantity: 5 }))

      await store.takeVaultItem(store.items[0], 2)

      expect(kit.character.addGearItem).toHaveBeenCalledWith({ name: 'Rope', slots: 1, quantity: 2, type: 'sundry' })
      expect(kit.apiClient.patch).toHaveBeenCalledWith('/vault-items/i1', expect.objectContaining({ quantity: 3 }))
      expect(kit.apiClient.delete).not.toHaveBeenCalled()
      expect(store.items[0]).toMatchObject({ id: 'i1', quantity: 3 })
    })

    test('taking a currency item pays coins instead of gear', async () => {
      const store = useVaultStore()
      await store.init('s1')
      store.items.push(storedItem({ name: 'Gold Coins', currency: 'gold', quantity: 40 }))

      await store.takeVaultItem(store.items[0], 40)

      expect(kit.character.adjustMoney).toHaveBeenCalledWith('gold', 40)
      expect(kit.character.addGearItem).not.toHaveBeenCalled()
    })

    test('taking without an active character is a no-op', async () => {
      kit.character.character = null
      const store = useVaultStore()
      await store.init('s1')
      store.items.push(storedItem())

      await store.takeVaultItem(store.items[0])

      expect(kit.character.addGearItem).not.toHaveBeenCalled()
      expect(store.items).toHaveLength(1)
    })

    test('stashing gear creates a vault item then removes the gear', async () => {
      kit.api['post /vault-items'] = body => ({ id: 'vi9', ...body })
      kit.responses.party_vault_containers = { data: [{ id: 'c1', name: 'Mule' }], error: null }
      const store = useVaultStore()
      await store.init('s1')

      await store.stashGearItem({ instanceId: 'g1', name: 'Rope', quantity: 2, slots: 1, type: 'sundry' }, 'c1')

      expect(kit.apiClient.post).toHaveBeenCalledWith('/vault-items', expect.objectContaining({
        container_id: 'c1',
        name: 'Rope',
        quantity: 2,
        slots: 1,
        item_type: 'sundry',
      }))
      expect(kit.character.deleteGearItem).toHaveBeenCalledWith('g1')
      expect(kit.apiClient.post).toHaveBeenCalledWith('/vault-activity', expect.objectContaining({
        verb: 'stored',
        what: 'Rope ×2 in Mule',
      }))
    })

    test('stashing gear keeps the gear when the vault write fails', async () => {
      kit.api['post /vault-items'] = new Error('boom')
      const store = useVaultStore()
      await store.init('s1')

      await store.stashGearItem({ instanceId: 'g1', name: 'Rope', quantity: 1, slots: 1, type: 'sundry' }, 'c1')

      expect(kit.character.deleteGearItem).not.toHaveBeenCalled()
    })

    test('moving a stored item patches its container and logs the move', async () => {
      kit.responses.party_vault_containers = { data: [{ id: 'c1', name: 'Mule' }, { id: 'c2', name: 'Cart' }], error: null }
      const store = useVaultStore()
      await store.init('s1')
      store.items.push(storedItem())

      await store.moveVaultItem(store.items[0], 'c2')

      expect(kit.apiClient.patch).toHaveBeenCalledWith('/vault-items/i1', expect.objectContaining({ container_id: 'c2' }))
      expect(kit.apiClient.post).toHaveBeenCalledWith('/vault-activity', expect.objectContaining({
        verb: 'moved',
        what: 'Rope from Mule to Cart',
      }))
    })
  })

  describe('activity log', () => {
    test('claiming loot records an activity entry', async () => {
      const store = useVaultStore()
      await store.init('s1')
      store.loot.push(lootItem({ quantity: 2 }))

      await store.claimLoot(store.loot[0])

      expect(kit.apiClient.post).toHaveBeenCalledWith('/vault-activity', expect.objectContaining({
        session_id: 's1',
        verb: 'claimed',
        what: 'Longsword ×2 from loot',
        character_name: 'Hero',
      }))
    })

    test('splitting item loot logs one split entry, not one per share', async () => {
      kit.api['post /vault-loot'] = body => lootItem({ id: `share-${body.notes}`, ...body })
      const store = useVaultStore()
      await store.init('s1')
      store.loot.push(lootItem({ name: 'Arrows', quantity: 4 }))

      await store.splitLoot(store.loot[0], [{ id: 'c1', data: { name: 'A' } }, { id: 'c2', data: { name: 'B' } }])

      const activityCalls = kit.apiClient.post.mock.calls.filter(([path]) => path === '/vault-activity')
      expect(activityCalls).toHaveLength(1)
      expect(activityCalls[0][1]).toMatchObject({ verb: 'split', what: 'Arrows ×4 between 2 players' })
    })

    test('realtime activity inserts prepend to the feed', async () => {
      const store = useVaultStore()
      await store.init('s1')
      store.activity.push({ id: 'a1' })

      const activityChannel = kit.channels.find(c => c.name.startsWith('vault:activity:'))
      activityChannel.emitPostgres('party_vault_activity', 'INSERT', { id: 'a2', verb: 'took', what: 'Rope from Mule' })

      expect(store.activity.map(a => a.id)).toEqual(['a2', 'a1'])
    })
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
    expect(liveChannels).toHaveLength(6)
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
