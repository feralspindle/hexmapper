import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase } from '@/lib/supabase'
import { createSessionChannel } from '@/lib/sessionChannel.js'
import { apiClient, ApiError } from '@/lib/apiClient.js'
import { useAuthStore } from '@/stores/authStore.js'
import { useCharacterStore } from '@/stores/characterStore.js'
import { useLootToast } from '@/composables/useLootToast.js'
import { isGemItem } from '@/lib/gearSlots.js'

const CLIENT_ID = crypto.randomUUID()

// slots is stored per item, not per stack - container usage and gear both
// multiply by quantity (gems and coins are slotted by name/currency instead,
// so their value here is display-only)
function _calcStashSlots(lootItem) {
  if (isGemItem(lootItem)) return Math.ceil((lootItem.quantity ?? 1) / 10)
  if (lootItem.loot_type === 'coins' || lootItem.currency) return Math.ceil((lootItem.quantity ?? 1) / 100)
  return 1
}

function _itemLabel(name, qty = 1) {
  return qty > 1 ? `${name} ×${qty}` : name
}

export const useVaultStore = defineStore('vault', () => {
  const loot       = ref([])
  const items      = ref([])
  const containers = ref([])
  const ledger     = ref([])
  const activity   = ref([])

  // Realtime can hand us a loot row after it was already deleted here: the
  // INSERT echo of a row this client just claimed, or a refresh snapshot
  // fetched before the delete committed. Deleted ids are tombstoned so those
  // late arrivals can't resurrect the card. Rows are hard-deleted and ids are
  // never reused, so tombstones only need to live until cleanup().
  const _deletedLootIds = new Set()

  const session = createSessionChannel()
  let toastChannel = null

  const bankItems = computed(() => items.value.filter(i => !i.container_id))

  async function init(sessionId) {
    if (session.key === sessionId) return
    cleanup()
    const generation = session.begin(sessionId)
    await Promise.all([
      _loadLoot(sessionId, generation),
      _loadItems(sessionId, generation),
      _loadContainers(sessionId, generation),
      _loadLedger(sessionId, generation),
      _loadActivity(sessionId, generation),
    ])
    if (!session.isCurrent(generation)) return
    _subscribeLoot(sessionId)
    _subscribeItems(sessionId)
    _subscribeContainers(sessionId)
    _subscribeLedger(sessionId)
    _subscribeActivity(sessionId)
    _subscribeToasts(sessionId)
  }

  async function refresh(generation = session.generation) {
    const sessionId = session.key
    if (!sessionId) return
    await Promise.all([
      _loadLoot(sessionId, generation),
      _loadItems(sessionId, generation),
      _loadContainers(sessionId, generation),
      _loadLedger(sessionId, generation),
      _loadActivity(sessionId, generation),
    ])
  }

  function cleanup() {
    session.close()
    toastChannel     = null
    loot.value       = []
    items.value      = []
    containers.value = []
    ledger.value     = []
    activity.value   = []
    _deletedLootIds.clear()
  }

  async function _loadLoot(sessionId, generation = session.generation) {
    const { data } = await supabase
      .from('party_vault_loot')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true })
    if (data && session.isCurrent(generation)) loot.value = data.filter(l => !_deletedLootIds.has(l.id))
  }

  async function _loadItems(sessionId, generation = session.generation) {
    const { data } = await supabase
      .from('party_vault_items')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true })
    if (data && session.isCurrent(generation)) items.value = data
  }

  async function _loadContainers(sessionId, generation = session.generation) {
    const { data } = await supabase
      .from('party_vault_containers')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true })
    if (data && session.isCurrent(generation)) containers.value = data
  }

  function _subscribeToasts(sessionId) {
    toastChannel = session.open(
      `vault:toasts:${sessionId}`,
      { sessionId, config: { broadcast: { self: true } } },
      ch => ch.on('broadcast', { event: 'loot_toast' }, ({ payload }) => {
        useLootToast().push(payload)
      }),
    )
  }

  function broadcastLootToast(data) {
    toastChannel?.send({ type: 'broadcast', event: 'loot_toast', payload: data })
  }

  function _subscribeLoot(sessionId) {
    session.open(`vault:loot:${sessionId}:${crypto.randomUUID()}`, { sessionId, refresh }, ch => ch
      .on('postgres_changes', { event: '*', schema: 'public', table: 'party_vault_loot', filter: `session_id=eq.${sessionId}` }, e => {
        if (e.new?.source_client === CLIENT_ID || e.old?.source_client === CLIENT_ID) return
        if (e.eventType === 'INSERT') {
          if (_deletedLootIds.has(e.new.id)) return
          if (!loot.value.find(l => l.id === e.new.id)) loot.value.push(e.new)
        } else if (e.eventType === 'UPDATE') {
          if (_deletedLootIds.has(e.new.id)) return
          const idx = loot.value.findIndex(l => l.id === e.new.id)
          if (idx !== -1) loot.value[idx] = e.new
        } else if (e.eventType === 'DELETE') {
          _deletedLootIds.add(e.old.id)
          loot.value = loot.value.filter(l => l.id !== e.old.id)
        }
      }))
  }

  function _subscribeItems(sessionId) {
    session.open(`vault:items:${sessionId}:${crypto.randomUUID()}`, { sessionId }, ch => ch
      .on('postgres_changes', { event: '*', schema: 'public', table: 'party_vault_items', filter: `session_id=eq.${sessionId}` }, e => {
        if (e.new?.source_client === CLIENT_ID || e.old?.source_client === CLIENT_ID) return
        if (e.eventType === 'INSERT') {
          if (!items.value.find(i => i.id === e.new.id)) items.value.push(e.new)
        } else if (e.eventType === 'UPDATE') {
          const idx = items.value.findIndex(i => i.id === e.new.id)
          if (idx !== -1) items.value[idx] = e.new
        } else if (e.eventType === 'DELETE') {
          items.value = items.value.filter(i => i.id !== e.old.id)
        }
      }))
  }

  function _subscribeContainers(sessionId) {
    session.open(`vault:containers:${sessionId}:${crypto.randomUUID()}`, { sessionId }, ch => ch
      .on('postgres_changes', { event: '*', schema: 'public', table: 'party_vault_containers', filter: `session_id=eq.${sessionId}` }, e => {
        if (e.new?.source_client === CLIENT_ID || e.old?.source_client === CLIENT_ID) return
        if (e.eventType === 'INSERT') {
          if (!containers.value.find(c => c.id === e.new.id)) containers.value.push(e.new)
        } else if (e.eventType === 'UPDATE') {
          const idx = containers.value.findIndex(c => c.id === e.new.id)
          if (idx !== -1) containers.value[idx] = e.new
        } else if (e.eventType === 'DELETE') {
          containers.value = containers.value.filter(c => c.id !== e.old.id)
          items.value = items.value.map(i => i.container_id === e.old.id ? { ...i, container_id: null } : i)
        }
      }))
  }

  async function _loadLedger(sessionId, generation = session.generation) {
    const { data } = await supabase
      .from('party_bank_ledger')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false })
      .limit(100)
    if (data && session.isCurrent(generation)) ledger.value = data
  }

  function _subscribeLedger(sessionId) {
    session.open(`vault:ledger:${sessionId}:${crypto.randomUUID()}`, { sessionId }, ch => ch
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'party_bank_ledger', filter: `session_id=eq.${sessionId}` }, e => {
        if (!ledger.value.find(l => l.id === e.new.id)) ledger.value = [e.new, ...ledger.value]
      }))
  }

  async function _addLedgerEntry({ description, goldChange = 0, silverChange = 0, copperChange = 0 }) {
    const characterStore = useCharacterStore()
    try {
      const data = await apiClient.post('/vault-ledger', {
        session_id:     session.key,
        description,
        character_name: characterStore.character?.name ?? null,
        gold_change:    goldChange,
        silver_change:  silverChange,
        copper_change:  copperChange,
      })
      if (data && !ledger.value.find(l => l.id === data.id)) ledger.value = [data, ...ledger.value]
    } catch (error) {
      console.error('_addLedgerEntry:', error instanceof ApiError ? error.message : error)
    }
  }

  async function _loadActivity(sessionId, generation = session.generation) {
    const { data } = await supabase
      .from('party_vault_activity')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false })
      .limit(100)
    if (data && session.isCurrent(generation)) activity.value = data
  }

  function _subscribeActivity(sessionId) {
    session.open(`vault:activity:${sessionId}:${crypto.randomUUID()}`, { sessionId }, ch => ch
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'party_vault_activity', filter: `session_id=eq.${sessionId}` }, e => {
        if (!activity.value.find(a => a.id === e.new.id)) activity.value = [e.new, ...activity.value]
      }))
  }

  function _logActivity(verb, what) {
    const characterStore = useCharacterStore()
    apiClient.post('/vault-activity', {
      session_id:     session.key,
      verb,
      what,
      character_name: characterStore.character?.name ?? null,
    }).then(data => {
      if (data && !activity.value.find(a => a.id === data.id)) activity.value = [data, ...activity.value]
    }).catch(error => {
      console.error('_logActivity:', error instanceof ApiError ? error.message : error)
    })
  }

  async function withdrawFromBank(item) {
    if (item.currency) {
      await _addLedgerEntry({ description: 'withdrew', [`${item.currency}Change`]: -item.quantity })
      useCharacterStore().adjustMoney(item.currency, item.quantity)
    }
    await removeVaultItem(item.id)
  }

  async function withdrawCoins(currency, amount) {
    let remaining = amount
    const coinItems = [...items.value]
      .filter(i => !i.container_id && (i.currency === currency || (i.name ?? '').toLowerCase().includes(currency)))
      .sort((a, b) => a.quantity - b.quantity)
    for (const item of coinItems) {
      if (remaining <= 0) break
      if (item.quantity <= remaining) {
        remaining -= item.quantity
        await removeVaultItem(item.id)
      } else {
        const newQty = item.quantity - remaining
        remaining = 0
        await updateVaultItem(item.id, { quantity: newQty })
      }
    }
    await _addLedgerEntry({ description: 'withdrew', [`${currency}Change`]: -amount })
    useCharacterStore().adjustMoney(currency, amount)
  }

  async function addLoot(name, quantity = 1, notes = '', lootType = 'item', currency = null, log = true) {
    try {
      const data = await apiClient.post('/vault-loot', {
        session_id:    session.key,
        name:          name.trim(),
        quantity,
        notes,
        loot_type:     lootType,
        currency:      currency ?? null,
        source_client: CLIENT_ID,
      })
      if (data) loot.value.push(data)
      if (data && log) _logActivity('added', `${_itemLabel(data.name, quantity)} to loot`)
      return data
    } catch (error) {
      console.error('addLoot failed:', error instanceof ApiError ? error.message : error)
    }
  }

  async function _patchLoot(id, patch) {
    const idx = loot.value.findIndex(l => l.id === id)
    if (idx !== -1) loot.value[idx] = { ...loot.value[idx], ...patch }
    try {
      await apiClient.patch(`/vault-loot/${id}`, { ...patch, source_client: CLIENT_ID })
    } catch (error) {
      console.error('_patchLoot:', error instanceof ApiError ? error.message : error)
    }
  }

  async function _removeLoot(id) {
    _deletedLootIds.add(id)
    loot.value = loot.value.filter(l => l.id !== id)
    try {
      await apiClient.delete(`/vault-loot/${id}`)
    } catch (error) {
      _deletedLootIds.delete(id)
      console.error('_removeLoot:', error instanceof ApiError ? error.message : error)
    }
  }

  async function claimLoot(lootItem, qty = lootItem.quantity) {
    const characterStore = useCharacterStore()
    if (!characterStore.character) return
    qty = Math.min(Math.max(Math.floor(qty), 1), lootItem.quantity)
    const authStore = useAuthStore()
    const userId = authStore.user?.id
    const member = characterStore.memberSelections.find(m => m.user_id === userId)
    const charName = member?.display_name || authStore.displayName || 'Adventurer'
    const currency = lootItem.currency
      ?? (['gold', 'silver', 'copper'].find(c => (lootItem.name ?? '').toLowerCase().includes(c)) ?? null)
    if (lootItem.loot_type === 'coins' && currency) {
      characterStore.adjustMoney(currency, qty)
      broadcastLootToast({ type: 'coins', charName, currency, amount: qty })
      _logActivity('claimed', `${qty} ${currency} from loot`)
    } else {
      characterStore.addGearItem({
        name:     lootItem.name,
        slots:    1,
        quantity: qty,
        type:     'sundry',
      })
      broadcastLootToast({ type: 'item', charName, itemName: lootItem.name, qty })
      _logActivity('claimed', `${_itemLabel(lootItem.name, qty)} from loot`)
    }
    if (qty < lootItem.quantity) {
      // a partial claim shrinks the pile in place - one update event instead of
      // a delete + re-add pair, so a dropped realtime frame can't leave other
      // clients holding a ghost card
      await _patchLoot(lootItem.id, { quantity: lootItem.quantity - qty })
    } else {
      await _removeLoot(lootItem.id)
    }
  }

  async function _addVaultItem(containerId, name, quantity, notes = '', slots = 0, itemType = 'sundry', currency = null) {
    try {
      const data = await apiClient.post('/vault-items', {
        session_id:    session.key,
        container_id:  containerId || null,
        name,
        quantity,
        notes,
        slots:         slots ?? 0,
        item_type:     itemType ?? 'sundry',
        currency:      currency ?? null,
        source_client: CLIENT_ID,
      })
      if (data) items.value.push(data)
      return data
    } catch (error) {
      console.error('_addVaultItem failed:', error instanceof ApiError ? error.message : error)
    }
  }

  async function depositLoot(lootItem) {
    await _addVaultItem(null, lootItem.name, lootItem.quantity, lootItem.notes, 0, 'sundry', lootItem.currency ?? null)
    if (lootItem.currency) {
      await _addLedgerEntry({ description: 'deposited from loot', [`${lootItem.currency}Change`]: lootItem.quantity })
      broadcastLootToast({ type: 'coins', charName: 'Party Bank', currency: lootItem.currency, amount: lootItem.quantity })
    } else {
      broadcastLootToast({ type: 'item', charName: 'Party Bank', itemName: lootItem.name, qty: lootItem.quantity })
    }
    _logActivity('deposited', `${_itemLabel(lootItem.name, lootItem.quantity)} to the bank`)
    await _removeLoot(lootItem.id)
  }

  async function stashLoot(lootItem, containerId) {
    const containerName = containers.value.find(c => c.id === containerId)?.name ?? 'Storage'
    await _addVaultItem(containerId, lootItem.name, lootItem.quantity, lootItem.notes, _calcStashSlots(lootItem), 'sundry')
    broadcastLootToast({ type: 'item', charName: containerName, itemName: lootItem.name, qty: lootItem.quantity })
    _logActivity('stored', `${_itemLabel(lootItem.name, lootItem.quantity)} in ${containerName}`)
    await _removeLoot(lootItem.id)
  }

  async function splitLoot(lootItem, activeChars) {
    const n = activeChars.length
    if (!n) return
    const perPerson = Math.floor(lootItem.quantity / n)
    if (perPerson < 1) return
    const remainder = lootItem.quantity % n
    const bonusIds = new Set(
      [...activeChars].sort(() => Math.random() - 0.5).slice(0, remainder).map(c => c.id)
    )

    const nameLower = (lootItem.name ?? '').toLowerCase()
    const inferredCurrency = lootItem.currency
      ?? (['gold', 'silver', 'copper'].find(c => nameLower.includes(c)) ?? null)

    if (lootItem.loot_type === 'coins' && inferredCurrency) {
      const characterStore = useCharacterStore()
      for (const char of activeChars) {
        const amount = perPerson + (bonusIds.has(char.id) ? 1 : 0)
        characterStore.adjustCurrencyForChar(char.id, inferredCurrency, amount)
        broadcastLootToast({ type: 'coins', charName: char.data?.name || 'Player', currency: inferredCurrency, amount })
      }
      _logActivity('split', `${lootItem.quantity} ${inferredCurrency} between ${n} players`)
      await _removeLoot(lootItem.id)
      return
    }

    for (const char of activeChars) {
      const charName = char.data?.name || 'Unknown'
      await addLoot(
        lootItem.name,
        perPerson + (bonusIds.has(char.id) ? 1 : 0),
        `${charName}'s share`,
        lootItem.loot_type ?? 'item',
        null,
        false,
      )
    }
    _logActivity('split', `${_itemLabel(lootItem.name, lootItem.quantity)} between ${n} players`)
    await _removeLoot(lootItem.id)
  }

  async function assignLoot(lootItem, assignments) {
    const characterStore = useCharacterStore()
    for (const { char, qty } of assignments) {
      characterStore.grantGearItemToChar(char.id, { name: lootItem.name, slots: 1, quantity: qty, type: 'sundry' })
    }
    const shares = assignments.map(({ char, qty }) => `${char.data?.name || 'Player'} ×${qty}`).join(', ')
    _logActivity('assigned', `${lootItem.name} to ${shares}`)
    const totalAssigned = assignments.reduce((s, a) => s + a.qty, 0)
    if (totalAssigned < lootItem.quantity) {
      await _patchLoot(lootItem.id, { quantity: lootItem.quantity - totalAssigned })
    } else {
      await _removeLoot(lootItem.id)
    }
  }

  async function discardLoot(lootItem) {
    const type = lootItem.loot_type === 'coins' && lootItem.currency ? 'coins' : 'item'
    if (type === 'coins') {
      broadcastLootToast({ type: 'coins', charName: 'Discarded', currency: lootItem.currency, amount: lootItem.quantity })
    } else {
      broadcastLootToast({ type: 'item', charName: 'Discarded', itemName: lootItem.name, qty: lootItem.quantity })
    }
    _logActivity('discarded', _itemLabel(lootItem.name, lootItem.quantity))
    await _removeLoot(lootItem.id)
  }

  async function addToBank(name, quantity = 1, notes = '', currency = null) {
    const result = await _addVaultItem(null, name.trim(), quantity, notes, 0, 'sundry', currency)
    if (currency && quantity > 0) {
      await _addLedgerEntry({ description: 'deposited', [`${currency}Change`]: quantity })
    }
    return result
  }

  async function addToContainer(containerId, name, quantity = 1, slots = 0, itemType = 'sundry', notes = '') {
    const data = await _addVaultItem(containerId, name.trim(), quantity, notes, slots, itemType)
    if (data) _logActivity('added', `${_itemLabel(data.name, quantity)} to ${_containerName(containerId)}`)
    return data
  }

  function _containerName(containerId) {
    if (!containerId) return 'the bank'
    return containers.value.find(c => c.id === containerId)?.name ?? 'storage'
  }

  async function takeVaultItem(item, qty = item.quantity) {
    const characterStore = useCharacterStore()
    if (!characterStore.character) return
    qty = Math.min(Math.max(Math.floor(qty), 1), item.quantity)
    const from = _containerName(item.container_id)
    const authStore = useAuthStore()
    const member = characterStore.memberSelections.find(m => m.user_id === authStore.user?.id)
    const charName = member?.display_name || authStore.displayName || 'Adventurer'
    if (item.currency) {
      characterStore.adjustMoney(item.currency, qty)
      broadcastLootToast({ type: 'coins', charName, currency: item.currency, amount: qty })
      _logActivity('took', `${qty} ${item.currency} from ${from}`)
    } else {
      characterStore.addGearItem({
        name:     item.name,
        slots:    item.slots ?? 0,
        quantity: qty,
        type:     item.item_type ?? 'sundry',
      })
      broadcastLootToast({ type: 'item', charName, itemName: item.name, qty })
      _logActivity('took', `${_itemLabel(item.name, qty)} from ${from}`)
    }
    if (qty < item.quantity) {
      await updateVaultItem(item.id, { quantity: item.quantity - qty })
    } else {
      await removeVaultItem(item.id)
    }
  }

  async function stashGearItem(gearItem, containerId) {
    const characterStore = useCharacterStore()
    const data = await _addVaultItem(
      containerId,
      gearItem.name,
      gearItem.quantity ?? 1,
      '',
      gearItem.slots ?? 0,
      gearItem.type ?? 'sundry',
    )
    if (!data) return
    characterStore.deleteGearItem(gearItem.instanceId)
    const containerName = _containerName(containerId)
    broadcastLootToast({ type: 'item', charName: containerName, itemName: gearItem.name, qty: gearItem.quantity ?? 1 })
    _logActivity('stored', `${_itemLabel(gearItem.name, gearItem.quantity ?? 1)} in ${containerName}`)
  }

  async function moveVaultItem(item, containerId) {
    if (item.container_id === containerId) return
    const from = _containerName(item.container_id)
    await updateVaultItem(item.id, { container_id: containerId })
    _logActivity('moved', `${_itemLabel(item.name, item.quantity)} from ${from} to ${_containerName(containerId)}`)
  }

  async function removeStoredItem(item) {
    _logActivity('removed', `${_itemLabel(item.name, item.quantity)} from ${_containerName(item.container_id)}`)
    await removeVaultItem(item.id)
  }

  async function editVaultItem(item, patch) {
    await updateVaultItem(item.id, patch)
    _logActivity('edited', `${patch.name ?? item.name} in ${_containerName(item.container_id)}`)
  }

  async function removeVaultItem(id) {
    items.value = items.value.filter(i => i.id !== id)
    try {
      await apiClient.delete(`/vault-items/${id}`)
    } catch (error) {
      console.error('removeVaultItem:', error instanceof ApiError ? error.message : error)
    }
  }

  async function updateVaultItem(id, patch) {
    const idx = items.value.findIndex(i => i.id === id)
    if (idx !== -1) Object.assign(items.value[idx], patch)
    try {
      await apiClient.patch(`/vault-items/${id}`, { ...patch, source_client: CLIENT_ID })
    } catch (error) {
      console.error('updateVaultItem:', error instanceof ApiError ? error.message : error)
    }
  }

  async function addContainer(name, gearSlots) {
    try {
      const data = await apiClient.post('/vault-containers', {
        session_id:    session.key,
        name:          name.trim(),
        gear_slots:    gearSlots,
        source_client: CLIENT_ID,
      })
      if (data) {
        containers.value.push(data)
        _logActivity('added storage', data.name)
      }
      return data
    } catch (error) {
      console.error('addContainer:', error instanceof ApiError ? error.message : error)
    }
  }

  async function removeContainer(id) {
    const name = containers.value.find(c => c.id === id)?.name
    items.value      = items.value.map(i => i.container_id === id ? { ...i, container_id: null } : i)
    containers.value = containers.value.filter(c => c.id !== id)
    try {
      await apiClient.delete(`/vault-containers/${id}`)
      if (name) _logActivity('removed storage', name)
    } catch (error) {
      console.error('removeContainer:', error instanceof ApiError ? error.message : error)
    }
  }

  return {
    loot, items, containers, bankItems,
    init, refresh, cleanup,
    ledger, activity,
    addLoot, claimLoot, depositLoot, stashLoot, splitLoot, assignLoot, discardLoot,
    withdrawFromBank, withdrawCoins,
    addToBank, addToContainer, removeVaultItem, updateVaultItem,
    takeVaultItem, stashGearItem, moveVaultItem, removeStoredItem, editVaultItem,
    addContainer, removeContainer,
    broadcastLootToast,
  }
})
