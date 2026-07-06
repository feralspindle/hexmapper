import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase } from '@/lib/supabase'
import { realtime } from '@/lib/realtime.js'
import { apiClient, ApiError } from '@/lib/apiClient.js'
import { useAuthStore } from '@/stores/authStore.js'
import { useCharacterStore } from '@/stores/characterStore.js'
import { useLootToast } from '@/composables/useLootToast.js'
import { isGemItem } from '@/lib/gearSlots.js'

const CLIENT_ID = crypto.randomUUID()

function _calcStashSlots(lootItem) {
  if (isGemItem(lootItem)) return Math.ceil((lootItem.quantity ?? 1) / 10)
  if (lootItem.loot_type === 'coins' || lootItem.currency) return Math.ceil((lootItem.quantity ?? 1) / 100)
  return lootItem.quantity ?? 1
}

export const useVaultStore = defineStore('vault', () => {
  const loot       = ref([])
  const items      = ref([])
  const containers = ref([])
  const ledger     = ref([])

  // Realtime can hand us a loot row after it was already deleted here: the
  // INSERT echo of a row this client just claimed, or a refresh snapshot
  // fetched before the delete committed. Deleted ids are tombstoned so those
  // late arrivals can't resurrect the card. Rows are hard-deleted and ids are
  // never reused, so tombstones only need to live until cleanup().
  const _deletedLootIds = new Set()

  let lootChannel       = null
  let itemsChannel      = null
  let containersChannel = null
  let ledgerChannel     = null
  let toastChannel      = null
  let _sessionId        = null

  const bankItems = computed(() => items.value.filter(i => !i.container_id))

  async function init(sessionId) {
    if (_sessionId === sessionId) return
    cleanup()
    _sessionId = sessionId
    await Promise.all([_loadLoot(sessionId), _loadItems(sessionId), _loadContainers(sessionId), _loadLedger(sessionId)])
    if (_sessionId !== sessionId) return
    _subscribeLoot(sessionId)
    _subscribeItems(sessionId)
    _subscribeContainers(sessionId)
    _subscribeLedger(sessionId)
    _subscribeToasts(sessionId)
  }

  async function refresh() {
    const sessionId = _sessionId
    if (!sessionId) return
    await Promise.all([_loadLoot(sessionId), _loadItems(sessionId), _loadContainers(sessionId), _loadLedger(sessionId)])
  }

  function cleanup() {
    if (lootChannel)       { realtime.removeChannel(lootChannel);       lootChannel       = null }
    if (itemsChannel)      { realtime.removeChannel(itemsChannel);      itemsChannel      = null }
    if (containersChannel) { realtime.removeChannel(containersChannel); containersChannel = null }
    if (ledgerChannel)     { realtime.removeChannel(ledgerChannel);     ledgerChannel     = null }
    if (toastChannel)      { realtime.removeChannel(toastChannel);      toastChannel      = null }
    _sessionId       = null
    loot.value       = []
    items.value      = []
    containers.value = []
    ledger.value     = []
    _deletedLootIds.clear()
  }

  async function _loadLoot(sessionId) {
    const { data } = await supabase
      .from('party_vault_loot')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true })
    if (data && _sessionId === sessionId) loot.value = data.filter(l => !_deletedLootIds.has(l.id))
  }

  async function _loadItems(sessionId) {
    const { data } = await supabase
      .from('party_vault_items')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true })
    if (data && _sessionId === sessionId) items.value = data
  }

  async function _loadContainers(sessionId) {
    const { data } = await supabase
      .from('party_vault_containers')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true })
    if (data && _sessionId === sessionId) containers.value = data
  }

  function _subscribeToasts(sessionId) {
    toastChannel = realtime
      .channel(`vault:toasts:${sessionId}`, { sessionId, config: { broadcast: { self: true } } })
      .on('broadcast', { event: 'loot_toast' }, ({ payload }) => {
        useLootToast().push(payload)
      })
      .subscribe()
  }

  function broadcastLootToast(data) {
    toastChannel?.send({ type: 'broadcast', event: 'loot_toast', payload: data })
  }

  function _subscribeLoot(sessionId) {
    let subscribedRefreshed = false
    lootChannel = realtime
      .channel(`vault:loot:${sessionId}:${crypto.randomUUID()}`, { sessionId, onReconnect: () => refresh() })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'party_vault_loot', filter: `session_id=eq.${sessionId}` }, e => {
        if (e.new?.source_client === CLIENT_ID || e.old?.source_client === CLIENT_ID) return
        if (e.eventType === 'INSERT') {
          if (_deletedLootIds.has(e.new.id)) return
          if (!loot.value.find(l => l.id === e.new.id)) loot.value.push(e.new)
        } else if (e.eventType === 'DELETE') {
          _deletedLootIds.add(e.old.id)
          loot.value = loot.value.filter(l => l.id !== e.old.id)
        }
      })
      .subscribe(status => {
        if (status !== 'SUBSCRIBED' || subscribedRefreshed) return
        subscribedRefreshed = true
        void refresh()
      })
  }

  function _subscribeItems(sessionId) {
    itemsChannel = realtime
      .channel(`vault:items:${sessionId}:${crypto.randomUUID()}`, { sessionId })
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
      })
      .subscribe()
  }

  function _subscribeContainers(sessionId) {
    containersChannel = realtime
      .channel(`vault:containers:${sessionId}:${crypto.randomUUID()}`, { sessionId })
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
      })
      .subscribe()
  }

  async function _loadLedger(sessionId) {
    const { data } = await supabase
      .from('party_bank_ledger')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false })
      .limit(100)
    if (data && _sessionId === sessionId) ledger.value = data
  }

  function _subscribeLedger(sessionId) {
    ledgerChannel = realtime
      .channel(`vault:ledger:${sessionId}:${crypto.randomUUID()}`, { sessionId })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'party_bank_ledger', filter: `session_id=eq.${sessionId}` }, e => {
        if (!ledger.value.find(l => l.id === e.new.id)) ledger.value = [e.new, ...ledger.value]
      })
      .subscribe()
  }

  async function _addLedgerEntry({ description, goldChange = 0, silverChange = 0, copperChange = 0 }) {
    const characterStore = useCharacterStore()
    try {
      const data = await apiClient.post('/vault-ledger', {
        session_id:     _sessionId,
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

  async function addLoot(name, quantity = 1, notes = '', lootType = 'item', currency = null) {
    try {
      const data = await apiClient.post('/vault-loot', {
        session_id:    _sessionId,
        name:          name.trim(),
        quantity,
        notes,
        loot_type:     lootType,
        currency:      currency ?? null,
        source_client: CLIENT_ID,
      })
      if (data) loot.value.push(data)
      return data
    } catch (error) {
      console.error('addLoot failed:', error instanceof ApiError ? error.message : error)
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

  async function claimLoot(lootItem) {
    const characterStore = useCharacterStore()
    if (!characterStore.character) return
    const authStore = useAuthStore()
    const userId = authStore.user?.id
    const member = characterStore.memberSelections.find(m => m.user_id === userId)
    const charName = member?.display_name || authStore.displayName || 'Adventurer'
    const currency = lootItem.currency
      ?? (['gold', 'silver', 'copper'].find(c => (lootItem.name ?? '').toLowerCase().includes(c)) ?? null)
    if (lootItem.loot_type === 'coins' && currency) {
      characterStore.adjustMoney(currency, lootItem.quantity)
      broadcastLootToast({ type: 'coins', charName, currency, amount: lootItem.quantity })
    } else {
      characterStore.addGearItem({
        name:     lootItem.name,
        slots:    1,
        quantity: lootItem.quantity,
        type:     'sundry',
      })
      broadcastLootToast({ type: 'item', charName, itemName: lootItem.name, qty: lootItem.quantity })
    }
    await _removeLoot(lootItem.id)
  }

  async function _addVaultItem(containerId, name, quantity, notes = '', slots = 0, itemType = 'sundry', currency = null) {
    try {
      const data = await apiClient.post('/vault-items', {
        session_id:    _sessionId,
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
    await _removeLoot(lootItem.id)
  }

  async function stashLoot(lootItem, containerId) {
    const containerName = containers.value.find(c => c.id === containerId)?.name ?? 'Storage'
    await _addVaultItem(containerId, lootItem.name, lootItem.quantity, lootItem.notes, _calcStashSlots(lootItem), 'sundry')
    broadcastLootToast({ type: 'item', charName: containerName, itemName: lootItem.name, qty: lootItem.quantity })
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
        const amount  = perPerson + (bonusIds.has(char.id) ? 1 : 0)
        const current = char.data?.[inferredCurrency] ?? 0
        characterStore.updateFieldForChar(char.id, inferredCurrency, current + amount)
        broadcastLootToast({ type: 'coins', charName: char.data?.name || 'Player', currency: inferredCurrency, amount })
      }
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
      )
    }
    await _removeLoot(lootItem.id)
  }

  async function assignLoot(lootItem, assignments) {
    const characterStore = useCharacterStore()
    for (const { char, qty } of assignments) {
      characterStore.addGearItemToChar(char.id, { name: lootItem.name, slots: 1, quantity: qty, type: 'sundry' })
    }
    const totalAssigned = assignments.reduce((s, a) => s + a.qty, 0)
    if (totalAssigned < lootItem.quantity) {
      await addLoot(lootItem.name, lootItem.quantity - totalAssigned, lootItem.notes, lootItem.loot_type ?? 'item')
    }
    await _removeLoot(lootItem.id)
  }

  async function discardLoot(lootItem) {
    const type = lootItem.loot_type === 'coins' && lootItem.currency ? 'coins' : 'item'
    if (type === 'coins') {
      broadcastLootToast({ type: 'coins', charName: 'Discarded', currency: lootItem.currency, amount: lootItem.quantity })
    } else {
      broadcastLootToast({ type: 'item', charName: 'Discarded', itemName: lootItem.name, qty: lootItem.quantity })
    }
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
    return _addVaultItem(containerId, name.trim(), quantity, notes, slots, itemType)
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
        session_id:    _sessionId,
        name:          name.trim(),
        gear_slots:    gearSlots,
        source_client: CLIENT_ID,
      })
      if (data) containers.value.push(data)
      return data
    } catch (error) {
      console.error('addContainer:', error instanceof ApiError ? error.message : error)
    }
  }

  async function removeContainer(id) {
    items.value      = items.value.map(i => i.container_id === id ? { ...i, container_id: null } : i)
    containers.value = containers.value.filter(c => c.id !== id)
    try {
      await apiClient.delete(`/vault-containers/${id}`)
    } catch (error) {
      console.error('removeContainer:', error instanceof ApiError ? error.message : error)
    }
  }

  return {
    loot, items, containers, bankItems,
    init, refresh, cleanup,
    ledger,
    addLoot, claimLoot, depositLoot, stashLoot, splitLoot, assignLoot, discardLoot,
    withdrawFromBank, withdrawCoins,
    addToBank, addToContainer, removeVaultItem, updateVaultItem,
    addContainer, removeContainer,
    broadcastLootToast,
  }
})
