import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase } from '@/lib/supabase'
import router from '@/router/index.js'
import { useMapStore } from '@/stores/mapStore.js'

const CLIENT_ID = crypto.randomUUID()

export const MARKER_COLORS = [
  { id: 'red',    color: '#ef4444', label: 'Red'    },
  { id: 'orange', color: '#f97316', label: 'Orange' },
  { id: 'yellow', color: '#eab308', label: 'Yellow' },
  { id: 'green',  color: '#22c55e', label: 'Green'  },
  { id: 'teal',   color: '#14b8a6', label: 'Teal'   },
  { id: 'blue',   color: '#3b82f6', label: 'Blue'   },
  { id: 'purple', color: '#a855f7', label: 'Purple' },
  { id: 'pink',   color: '#ec4899', label: 'Pink'   },
]

export const TERRAIN_TYPES = [
  { id: 'plains',   label: 'Plains',   color: '#c8d98a' },
  { id: 'forest',   label: 'Forest',   color: '#4a7c59' },
  { id: 'mountain', label: 'Mountain', color: '#8a7568' },
  { id: 'water',    label: 'Water',    color: '#4a90b8' },
  { id: 'desert',   label: 'Desert',   color: '#d4b483' },
  { id: 'swamp',    label: 'Swamp',    color: '#5e7a5e' },
  { id: 'city',     label: 'City',     color: '#c0a060' },
  { id: 'dungeon',  label: 'Dungeon',  color: '#6b5b73' },
  { id: 'snow',     label: 'Snow',     color: '#e8eef2' },
  { id: 'volcanic', label: 'Volcanic', color: '#8b2222' },
]

function cellKey(q, r) {
  return `${q}:${r}`
}

export const useHexStore = defineStore('hex', () => {
  const hexCells = ref(new Map())
  const selectedHex = ref(null)
  const hexDungeons = ref([])
  const dungeonsLoading = ref(false)
  const loading = ref(false)
  const currentSessionId = ref(null)
  const currentMapId = ref(null)
  let channel = null

  const selectedCell = computed(() => {
    if (!selectedHex.value) return null
    return hexCells.value.get(cellKey(selectedHex.value.q, selectedHex.value.r)) ?? null
  })

  async function init(sessionId, mapId) {
    loading.value = true
    currentSessionId.value = sessionId
    currentMapId.value = mapId
    hexCells.value = new Map()
    selectedHex.value = null

    const { data, error } = await supabase
      .from('hex_cells')
      .select('*')
      .eq('map_id', mapId)

    if (!error && data) {
      const map = new Map()
      for (const row of data) map.set(cellKey(row.q, row.r), row)
      hexCells.value = map
    }
    loading.value = false

    if (channel) supabase.removeChannel(channel)
    channel = supabase
      .channel(`map:${mapId}:hex`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'hex_cells', filter: `map_id=eq.${mapId}` },
        handleRealtimeEvent,
      )
      .subscribe()
  }

  function handleRealtimeEvent({ eventType, new: row, old }) {
    if (eventType === 'INSERT' || eventType === 'UPDATE') {
      if (row.source_client === CLIENT_ID) return
      hexCells.value.set(cellKey(row.q, row.r), row)
    } else if (eventType === 'DELETE') {
      hexCells.value.delete(cellKey(old.q, old.r))
    }
  }

  function selectHex(q, r) {
    if (selectedHex.value?.q === q && selectedHex.value?.r === r) {
      selectedHex.value = null
    } else {
      selectedHex.value = { q, r }
    }
  }

  function deselectHex() {
    selectedHex.value = null
  }

  async function upsertHex(q, r, patch) {
    const key = cellKey(q, r)
    const existing = hexCells.value.get(key)
    const merged = {
      session_id: currentSessionId.value,
      map_id: currentMapId.value,
      q,
      r,
      label: '',
      notes: '',
      terrain_type: null,
      color: null,
      has_dungeon: false,
      revealed: false,
      ...existing,
      ...patch,
      source_client: CLIENT_ID,
    }
    hexCells.value.set(key, merged)

    const { data, error } = await supabase
      .from('hex_cells')
      .upsert(merged, { onConflict: 'map_id,q,r' })
      .select()
      .single()

    if (error) {
      if (existing) hexCells.value.set(key, existing)
      else hexCells.value.delete(key)
      console.error('upsertHex error:', error.message)
    } else if (data) {
      hexCells.value.set(key, data)
    }
  }

  async function deleteHex(q, r) {
    const key = cellKey(q, r)
    const backup = hexCells.value.get(key)
    hexCells.value.delete(key)
    selectedHex.value = null

    const { error } = await supabase
      .from('hex_cells')
      .delete()
      .eq('map_id', currentMapId.value)
      .eq('q', q)
      .eq('r', r)

    if (error) {
      if (backup) hexCells.value.set(key, backup)
      console.error('deleteHex error:', error.message)
    }
  }

  async function fetchDungeonsForHex(hexId) {
    if (!hexId) { hexDungeons.value = []; return }
    dungeonsLoading.value = true
    const { data, error } = await supabase
      .from('dungeons')
      .select('id, name, created_at')
      .eq('hex_id', hexId)
      .order('created_at', { ascending: true })
    dungeonsLoading.value = false
    if (!error) hexDungeons.value = data ?? []
  }

  async function createDungeon(q, r, name = 'Unnamed Dungeon') {
    const key = cellKey(q, r)
    const cell = hexCells.value.get(key)

    let hexId = cell?.id
    if (!hexId) {
      const { data, error } = await supabase
        .from('hex_cells')
        .upsert(
          { session_id: currentSessionId.value, map_id: currentMapId.value, q, r, has_dungeon: true, source_client: CLIENT_ID },
          { onConflict: 'map_id,q,r' },
        )
        .select()
        .single()
      if (error) { console.error('createDungeon upsert hex error:', error.message); return }
      hexId = data.id
      hexCells.value.set(key, data)
    } else if (!cell.has_dungeon) {
      await upsertHex(q, r, { has_dungeon: true })
    }

    const { data, error } = await supabase
      .from('dungeons')
      .insert({ session_id: currentSessionId.value, hex_id: hexId, name })
      .select()
      .single()
    if (error) { console.error('createDungeon insert error:', error.message); return }

    hexDungeons.value = [...hexDungeons.value, data]
    router.push({ name: 'dungeon', params: { sessionId: currentSessionId.value, dungeonId: data.id } })
  }

  async function ensureCellExists(q, r) {
    const key = cellKey(q, r)
    const existing = hexCells.value.get(key)
    if (existing?.id) return existing.id

    const { data, error } = await supabase
      .from('hex_cells')
      .upsert(
        { session_id: currentSessionId.value, map_id: currentMapId.value, q, r, source_client: CLIENT_ID },
        { onConflict: 'map_id,q,r' },
      )
      .select()
      .single()

    if (error || !data) { console.error('ensureCellExists error:', error?.message); return null }
    hexCells.value.set(key, data)
    return data.id
  }

  async function toggleRevealed(q, r) {
    const current = hexCells.value.get(cellKey(q, r))?.revealed ?? false
    await upsertHex(q, r, { revealed: !current })
  }

  async function revealAll() {
    const updates = []
    for (const cell of hexCells.value.values()) {
      if (!cell.revealed) {
        hexCells.value.set(cellKey(cell.q, cell.r), { ...cell, revealed: true })
        const row = { ...cell, revealed: true, source_client: CLIENT_ID }
        if (!row.id) delete row.id
        updates.push(row)
      }
    }
    await useMapStore().setFogRevealAll(true)
    if (!updates.length) return
    const { error } = await supabase.from('hex_cells').upsert(updates, { onConflict: 'map_id,q,r' })
    if (error) { console.error('revealAll error:', error.message); await init(currentSessionId.value, currentMapId.value) }
  }

  async function hideAll() {
    const updates = []
    for (const cell of hexCells.value.values()) {
      if (cell.revealed) {
        hexCells.value.set(cellKey(cell.q, cell.r), { ...cell, revealed: false })
        const row = { ...cell, revealed: false, source_client: CLIENT_ID }
        if (!row.id) delete row.id
        updates.push(row)
      }
    }
    await useMapStore().setFogRevealAll(false)
    if (!updates.length) return
    const { error } = await supabase.from('hex_cells').upsert(updates, { onConflict: 'map_id,q,r' })
    if (error) { console.error('hideAll error:', error.message); await init(currentSessionId.value, currentMapId.value) }
  }

  function navigateToDungeon(dungeonId) {
    router.push({ name: 'dungeon', params: { sessionId: currentSessionId.value, dungeonId } })
  }

  async function clearAll() {
    const { error } = await supabase
      .from('hex_cells')
      .delete()
      .eq('map_id', currentMapId.value)
    if (error) { console.error('clearAll:', error.message); return false }
    hexCells.value = new Map()
    selectedHex.value = null
    return true
  }

  function cleanup() {
    if (channel) supabase.removeChannel(channel)
    channel = null
  }

  return {
    hexCells,
    selectedHex,
    selectedCell,
    hexDungeons,
    dungeonsLoading,
    loading,
    init,
    selectHex,
    deselectHex,
    upsertHex,
    deleteHex,
    ensureCellExists,
    fetchDungeonsForHex,
    createDungeon,
    navigateToDungeon,
    toggleRevealed,
    revealAll,
    hideAll,
    clearAll,
    cleanup,
  }
})
