import { defineStore } from 'pinia'
import { ref, computed, watch, toRaw } from 'vue'
import { supabase } from '@/lib/supabase'
import { realtime } from '@/lib/realtime.js'
import { pendingKeys } from '@/lib/realtimeProtocol.js'
import { apiClient, ApiError } from '@/lib/apiClient.js'
import { uploadSessionImage } from '@/lib/sessionImage.js'
import { createSignedMapUrl } from '@/lib/signedMapUrl.js'
import { createPresenceChannel } from '@/lib/presenceChannel.js'
import { createTorchControls } from '@/lib/torchControls.js'
import { MAP_IMAGE_FIELD_MAP, assignDbFields } from '@/lib/mapImageFields.js'
import { useActivityStore } from '@/stores/activityStore.js'
import { useOracleStore } from '@/stores/oracleStore.js'
import { generateRoomPlan, weightedPick, STOCKING_FALLBACK } from '@/lib/dungeonGenerator.js'

const CLIENT_ID = crypto.randomUUID()
const MAX_IMAGE_BYTES = 50 * 1024 * 1024

export const useD = defineStore('dungeon', () => {
  const dungeon = ref(null)
  const rooms = ref(new Map())
  const corridors = ref(new Map())
  const tokens = ref(new Map())
  const icons = ref(new Map())
  const loading = ref(true)
  const loadError = ref(null)
  const drawMode = ref('select')
  const selectedElement = ref(null)
  // the character sheet's "drop token" button lives far from the canvas, and
  // only the canvas knows the viewport - it watches this and places the token
  // in view
  const tokenDropRequest = ref(null)
  const viewers = ref([])
  const undoStack = ref([])
  const _editingRoom = ref(null)

  const { url: dungeonImageUrl, refresh: _refreshImageUrl, cleanup: _cleanupImageUrl } = createSignedMapUrl()
  const fogCells = ref(new Set())
  const _localOverrides = {}

  const fogMode = computed(() => dungeon.value?.fog_mode ?? false)
  const fogRevealAll = computed(() => dungeon.value?.fog_reveal_all ?? false)

  let roomChannel = null
  let corridorChannel = null
  let tokenChannel = null
  let iconChannel = null
  let dungeonChannel = null
  let presenceChannel = null
  let fogChannel = null
  let undoChannel = null
  let _stopAuthWatch = null
  let _trackPresence = null
  let _undoing = false
  let _dungeonId = null
  let _initGeneration = 0

  const _pendingWrites = pendingKeys()
  const _pendingDungeonFields = pendingKeys()
  const _pendingFogOps = new Map()

  const _logUndoError = (label) => (err) =>
    console.error(`undo ${label}:`, err instanceof ApiError ? err.message : err)

  function pushUndo(action) {
    if (_undoing) return
    undoStack.value.push(action)
    if (undoStack.value.length > 50) undoStack.value.shift()
    undoChannel?.send({ type: 'broadcast', event: 'undo_push', payload: { ...action, _src: CLIENT_ID } })
  }

  async function undo() {
    const action = undoStack.value.pop()
    if (!action) return
    _undoing = true
    try { await _executeUndo(action) }
    finally { _undoing = false }
  }

  async function _executeUndo(action) {
    switch (action.type) {
      case 'delete_room': {
        rooms.value.delete(action.roomId)
        if (selectedElement.value?.id === action.roomId) selectedElement.value = null
        await apiClient.delete(`/dungeon-rooms/${action.roomId}`, 'undo_delete_room').catch(_logUndoError('delete_room'))
        break
      }
      case 'insert_room': {
        rooms.value.set(action.data.id, { ...action.data })
        await apiClient.post('/dungeon-rooms', { ...action.data, source_client: CLIENT_ID }, 'undo_insert_room').catch(_logUndoError('insert_room'))
        break
      }
      case 'update_room': {
        const r = rooms.value.get(action.roomId)
        if (r) rooms.value.set(action.roomId, { ...r, ...action.patch })
        _pendingWrites.begin([`room:${action.roomId}`])
        await apiClient.patch(`/dungeon-rooms/${action.roomId}`, { ...action.patch, source_client: CLIENT_ID }, 'undo_update_room')
          .catch(_logUndoError('update_room'))
          .finally(() => _pendingWrites.end([`room:${action.roomId}`]))
        break
      }
      case 'delete_corridor': {
        corridors.value.delete(action.corridorId)
        if (selectedElement.value?.id === action.corridorId) selectedElement.value = null
        await apiClient.delete(`/dungeon-corridors/${action.corridorId}`, 'undo_delete_corridor').catch(_logUndoError('delete_corridor'))
        break
      }
      case 'insert_corridor': {
        corridors.value.set(action.data.id, { ...action.data })
        await apiClient.post('/dungeon-corridors', { ...action.data, source_client: CLIENT_ID }, 'undo_insert_corridor').catch(_logUndoError('insert_corridor'))
        break
      }
      case 'update_corridor': {
        const c = corridors.value.get(action.corridorId)
        if (c) corridors.value.set(action.corridorId, { ...c, ...action.patch })
        _pendingWrites.begin([`corridor:${action.corridorId}`])
        await apiClient.patch(`/dungeon-corridors/${action.corridorId}`, { ...action.patch, source_client: CLIENT_ID }, 'undo_update_corridor')
          .catch(_logUndoError('update_corridor'))
          .finally(() => _pendingWrites.end([`corridor:${action.corridorId}`]))
        break
      }
    }
  }

  function _subscribeUndoChannel(sessionId, dungeonId) {
    if (undoChannel) realtime.removeChannel(undoChannel)
    undoChannel = realtime
      .channel(`dungeon:${dungeonId}:undo`, { sessionId })
      .on('broadcast', { event: 'undo_push' }, ({ payload }) => {
        if (payload._src === CLIENT_ID) return
        const { _src, ...action } = payload
        undoStack.value.push(action)
        if (undoStack.value.length > 50) undoStack.value.shift()
      })
      .subscribe()
  }

  watch(() => dungeon.value?.map_image_path, p => _refreshImageUrl(p ?? null), { immediate: false })

  async function uploadDungeonImage(sessionId, file) {
    return uploadSessionImage(file, { sessionId, maxBytes: MAX_IMAGE_BYTES, prefix: 'dungeon-' })
  }

  async function updateDungeon(patch) {
    if (!dungeon.value?.id) return false
    const id = dungeon.value.id
    const dbPatch = assignDbFields({}, patch, MAP_IMAGE_FIELD_MAP)
    if (patch.fogMode      !== undefined) dbPatch.fog_mode       = patch.fogMode
    if (patch.fogRevealAll !== undefined) dbPatch.fog_reveal_all = patch.fogRevealAll
    if (patch.gmInitiative !== undefined) dbPatch.gm_initiative  = patch.gmInitiative ?? null

    dungeon.value = { ...dungeon.value, ...dbPatch }
    const overrides = _localOverrides[id]
    if (overrides) {
      for (const [k, v] of Object.entries(dbPatch)) {
        if (overrides[k] === v) delete overrides[k]
      }
    }

    const fields = Object.keys(dbPatch)
    _pendingDungeonFields.begin(fields)
    try {
      await apiClient.patch(`/dungeons/${id}`, dbPatch, 'update_dungeon_config')
    } catch (err) { console.error('updateDungeon:', err instanceof ApiError ? err.message : err); return false }
    finally { _pendingDungeonFields.end(fields) }
    return true
  }

  // the alignment fields belong to the image being cleared, so they reset to
  // their column defaults along with it. extraPatch lets callers fold in other
  // changes (eg fogMode) so it all lands as one event
  function clearMapImage(extraPatch = {}) {
    return updateDungeon({
      ...extraPatch,
      mapImagePath: null,
      mapImageOffsetX: 0,
      mapImageOffsetY: 0,
      mapImageScale: 1,
      mapImageRotation: 0,
      mapOffsetLocked: false,
    })
  }

  function applyDungeonLocalPatch(patch) {
    if (!dungeon.value?.id) return
    const id = dungeon.value.id
    const dbPatch = assignDbFields({}, patch, {
      mapImageOffsetX:  'map_image_offset_x',
      mapImageOffsetY:  'map_image_offset_y',
      mapImageScale:    'map_image_scale',
      mapImageRotation: 'map_image_rotation',
    })
    _localOverrides[id] = { ...(_localOverrides[id] ?? {}), ...dbPatch }
    dungeon.value = { ...dungeon.value, ...dbPatch }
  }

  function _fogKey(x, y) { return `${x}:${y}` }

  function isCellRevealed(cellX, cellY) {
    return fogCells.value.has(_fogKey(cellX, cellY))
  }

  function _beginFogOps(keys) {
    const ops = new Map(keys.map(key => [key, { confirmed: false }]))
    for (const [key, op] of ops) _pendingFogOps.set(key, op)
    return ops
  }

  function _endFogOps(ops) {
    for (const [key, op] of ops) {
      if (_pendingFogOps.get(key) === op) _pendingFogOps.delete(key)
    }
  }

  function _rollbackFogOps(ops, revealed) {
    const next = new Set(fogCells.value)
    for (const [key, op] of ops) {
      if (op.confirmed) continue
      if (revealed) next.delete(key)
      else next.add(key)
    }
    fogCells.value = next
  }

  async function revealFogCell(dungeonId, cellX, cellY) {
    const key = _fogKey(cellX, cellY)
    if (fogCells.value.has(key)) return
    const ops = _beginFogOps([key])
    fogCells.value = new Set(fogCells.value).add(key)
    try {
      await apiClient.post('/dungeon-fog/reveal', { dungeon_id: dungeonId, cell_x: cellX, cell_y: cellY, source_client: CLIENT_ID }, 'reveal_fog')
    } catch (err) {
      _rollbackFogOps(ops, true)
      console.error('revealFogCell:', err instanceof ApiError ? err.message : err)
    } finally { _endFogOps(ops) }
  }

  async function hideFogCell(dungeonId, cellX, cellY) {
    const key = _fogKey(cellX, cellY)
    if (!fogCells.value.has(key)) return
    const ops = _beginFogOps([key])
    const next = new Set(fogCells.value); next.delete(key); fogCells.value = next
    try {
      await apiClient.post('/dungeon-fog/hide', { dungeon_id: dungeonId, cell_x: cellX, cell_y: cellY }, 'hide_fog')
    } catch (err) {
      _rollbackFogOps(ops, false)
      console.error('hideFogCell:', err instanceof ApiError ? err.message : err)
    } finally { _endFogOps(ops) }
  }

  async function revealFogCells(dungeonId, cells) {
    if (!cells.length) return
    const newCells = new Set(fogCells.value)
    const rows = []
    const keys = []
    for (const { cellX, cellY } of cells) {
      const key = _fogKey(cellX, cellY)
      if (!newCells.has(key)) { newCells.add(key); keys.push(key); rows.push({ cell_x: cellX, cell_y: cellY }) }
    }
    if (!rows.length) return
    const ops = _beginFogOps(keys)
    fogCells.value = newCells
    try {
      await apiClient.post('/dungeon-fog/reveal-bulk', { dungeon_id: dungeonId, source_client: CLIENT_ID, cells: rows }, 'reveal_fog_bulk')
    } catch (err) {
      _rollbackFogOps(ops, true)
      console.error('revealFogCells:', err instanceof ApiError ? err.message : err)
    } finally { _endFogOps(ops) }
  }

  async function hideFogCells(dungeonId, cells) {
    if (!cells.length) return
    const newCells = new Set(fogCells.value)
    const toDelete = []
    const keys = []
    for (const { cellX, cellY } of cells) {
      const key = _fogKey(cellX, cellY)
      if (newCells.has(key)) { newCells.delete(key); keys.push(key); toDelete.push({ cell_x: cellX, cell_y: cellY }) }
    }
    if (!toDelete.length) return
    const ops = _beginFogOps(keys)
    fogCells.value = newCells
    try {
      await apiClient.post('/dungeon-fog/hide-bulk', { dungeon_id: dungeonId, cells: toDelete }, 'hide_fog_bulk')
    } catch (err) {
      _rollbackFogOps(ops, false)
      console.error('hideFogCells:', err instanceof ApiError ? err.message : err)
    } finally { _endFogOps(ops) }
  }

  async function revealAllFog(dungeonId) {
    try {
      await apiClient.post('/dungeon-fog/clear', { dungeon_id: dungeonId }, 'reveal_all_fog')
    } catch (err) {
      console.error('revealAllFog:', err instanceof ApiError ? err.message : err)
      return false
    }
    return updateDungeon({ fogRevealAll: true })
  }

  async function hideAllFog(dungeonId) {
    try {
      await apiClient.post('/dungeon-fog/clear', { dungeon_id: dungeonId }, 'hide_all_fog')
    } catch (err) {
      console.error('hideAllFog:', err instanceof ApiError ? err.message : err)
      return false
    }
    fogCells.value = new Set()
    return updateDungeon({ fogRevealAll: false })
  }

  // fog changes flip which token/icon rows RLS lets a player read (#153) -
  // hidden rows never arrive at all, so a reveal has to refetch them.
  // debounced because the fog brush lands as a burst of cell events.
  let _fogRefetchTimer = null

  function _scheduleFogRefetch() {
    if (_fogRefetchTimer) clearTimeout(_fogRefetchTimer)
    _fogRefetchTimer = setTimeout(() => {
      _fogRefetchTimer = null
      void _refetchFogGated('dungeon_tokens', tokens, 'token')
      void _refetchFogGated('dungeon_icons', icons, 'icon')
    }, 250)
  }

  async function _refetchFogGated(table, collection, entity) {
    const dungeonId = _dungeonId
    const generation = _initGeneration
    if (!dungeonId) return
    const { data, error } = await supabase.from(table).select('*').eq('dungeon_id', dungeonId)
    if (error || _dungeonId !== dungeonId || generation !== _initGeneration) return
    const next = new Map((data ?? []).map(r => [r.id, r]))
    // keep optimistic rows whose write hasn't settled yet
    for (const key of _pendingWrites.keys()) {
      if (!key.startsWith(`${entity}:`)) continue
      const id = key.slice(entity.length + 1)
      const current = collection.value.get(id)
      if (current) next.set(id, current)
    }
    collection.value = next
  }

  async function refresh() {
    const dungeonId = _dungeonId
    const generation = _initGeneration
    if (!dungeonId) return
    try {
      const [{ data: dungeonData, error: e1 }, { data: roomData }, { data: corridorData }, { data: fogData }, { data: tokenData }, { data: iconData }] = await Promise.all([
        supabase.from('dungeons').select('*').eq('id', dungeonId).single(),
        supabase.from('dungeon_rooms').select('*').eq('dungeon_id', dungeonId),
        supabase.from('dungeon_corridors').select('*').eq('dungeon_id', dungeonId),
        supabase.from('dungeon_fog_cells').select('cell_x, cell_y').eq('dungeon_id', dungeonId),
        supabase.from('dungeon_tokens').select('*').eq('dungeon_id', dungeonId),
        supabase.from('dungeon_icons').select('*').eq('dungeon_id', dungeonId),
      ])
      if (e1) throw new Error(e1.message)
      if (_dungeonId !== dungeonId || generation !== _initGeneration) return

      dungeon.value = { ...dungeonData, ...(_localOverrides[dungeonData.id] ?? {}) }

      const editing = _editingRoom.value
      const nextRooms = new Map((roomData ?? []).map(r => [r.id, r]))
      if (editing && nextRooms.has(editing.id)) {
        const current = rooms.value.get(editing.id)
        if (current) {
          const merged = { ...nextRooms.get(editing.id) }
          for (const field of editing.fields) merged[field] = current[field]
          nextRooms.set(editing.id, merged)
        }
      }
      rooms.value = nextRooms
      corridors.value = new Map((corridorData ?? []).map(c => [c.id, c]))
      fogCells.value = new Set((fogData ?? []).map(r => _fogKey(r.cell_x, r.cell_y)))
      tokens.value = new Map((tokenData ?? []).map(t => [t.id, t]))
      icons.value = new Map((iconData ?? []).map(i => [i.id, i]))
      loadError.value = null
    } catch (err) {
      console.error('dungeonStore.refresh error:', err)
    }
  }

  function _removeChannels() {
    if (_stopAuthWatch) { _stopAuthWatch(); _stopAuthWatch = null }
    _trackPresence = null
    if (dungeonChannel)  { realtime.removeChannel(dungeonChannel); dungeonChannel = null }
    if (roomChannel)     { realtime.removeChannel(roomChannel); roomChannel = null }
    if (corridorChannel) { realtime.removeChannel(corridorChannel); corridorChannel = null }
    if (tokenChannel)    { realtime.removeChannel(tokenChannel); tokenChannel = null }
    if (iconChannel)     { realtime.removeChannel(iconChannel); iconChannel = null }
    if (presenceChannel) { realtime.removeChannel(presenceChannel); presenceChannel = null }
    if (fogChannel)      { realtime.removeChannel(fogChannel); fogChannel = null }
    if (undoChannel)     { realtime.removeChannel(undoChannel); undoChannel = null }
  }

  async function init(sessionId, dungeonId) {
    const generation = ++_initGeneration
    _dungeonId = dungeonId
    loading.value = true
    loadError.value = null
    drawMode.value = 'select'
    selectedElement.value = null
    undoStack.value = []
    _removeChannels()

    try {
      const [{ data: dungeonData, error: e1 }, { data: roomData, error: e2 }, { data: corridorData, error: e3 }, { data: tokenData, error: e4 }, { data: iconData, error: e5 }] = await Promise.all([
        supabase.from('dungeons').select('*').eq('id', dungeonId).single(),
        supabase.from('dungeon_rooms').select('*').eq('dungeon_id', dungeonId),
        supabase.from('dungeon_corridors').select('*').eq('dungeon_id', dungeonId),
        supabase.from('dungeon_tokens').select('*').eq('dungeon_id', dungeonId),
        supabase.from('dungeon_icons').select('*').eq('dungeon_id', dungeonId),
      ])

      if (generation !== _initGeneration) return
      if (e1) throw new Error(e1.message)
      if (e2) throw new Error(e2.message)
      if (e3) throw new Error(e3.message)
      if (e4) throw new Error(e4.message)
      if (e5) throw new Error(e5.message)

      dungeon.value = dungeonData
      rooms.value = new Map((roomData ?? []).map(r => [r.id, r]))
      corridors.value = new Map((corridorData ?? []).map(c => [c.id, c]))
      tokens.value = new Map((tokenData ?? []).map(t => [t.id, t]))
      icons.value = new Map((iconData ?? []).map(i => [i.id, i]))

      const { data: fogData } = await supabase
        .from('dungeon_fog_cells')
        .select('cell_x, cell_y')
        .eq('dungeon_id', dungeonId)
      if (generation !== _initGeneration) return
      fogCells.value = new Set((fogData ?? []).map(r => _fogKey(r.cell_x, r.cell_y)))

      if (dungeonData?.map_image_path) _refreshImageUrl(dungeonData.map_image_path)
    } catch (err) {
      if (generation !== _initGeneration) return
      loadError.value = err.message ?? 'Failed to load dungeon'
      console.error('dungeonStore.init error:', err)
    } finally {
      if (generation === _initGeneration) loading.value = false
    }
    if (generation !== _initGeneration) return

    _subscribeUndoChannel(sessionId, dungeonId)

    let subscribedRefreshed = false
    dungeonChannel = realtime
      .channel(`dungeon:${dungeonId}:meta`, { sessionId, onReconnect: () => refresh() })
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'dungeons', filter: `id=eq.${dungeonId}` },
        ({ new: row }) => {
          const prev = dungeon.value
          const local = _localOverrides[row.id] ?? {}
          const merged = { ...row, ...local }
          if (dungeon.value?.id === row.id) {
            for (const field of _pendingDungeonFields.keys()) {
              if (field in dungeon.value) merged[field] = dungeon.value[field]
            }
          }
          dungeon.value = merged
          if (prev && (prev.fog_mode !== merged.fog_mode || prev.fog_reveal_all !== merged.fog_reveal_all))
            _scheduleFogRefetch()
        },
      )
      .subscribe(status => {
        if (status !== 'SUBSCRIBED' || subscribedRefreshed) return
        subscribedRefreshed = true
        void refresh()
      })

    fogChannel = realtime
      .channel(`dungeon:${dungeonId}:fog`, { sessionId })
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'dungeon_fog_cells', filter: `dungeon_id=eq.${dungeonId}` },
        ({ eventType, new: row, old }) => {
          if (eventType === 'INSERT') {
            const key = _fogKey(row.cell_x, row.cell_y)
            const pending = _pendingFogOps.get(key)
            if (pending) pending.confirmed = true
            if (row.source_client !== CLIENT_ID)
              fogCells.value = new Set(fogCells.value).add(key)
            _scheduleFogRefetch()
          } else if (eventType === 'DELETE') {
            const key = _fogKey(old.cell_x, old.cell_y)
            const pending = _pendingFogOps.get(key)
            if (pending) pending.confirmed = true
            const next = new Set(fogCells.value)
            next.delete(key)
            fogCells.value = next
            _scheduleFogRefetch()
          }
        },
      )
      .subscribe()

    roomChannel = realtime
      .channel(`session:${sessionId}:dungeon:${dungeonId}:rooms`, { sessionId })
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'dungeon_rooms', filter: `dungeon_id=eq.${dungeonId}` },
        ({ eventType, new: row, old }) => {
          if (eventType === 'INSERT' || eventType === 'UPDATE') {
            if (row.source_client === CLIENT_ID &&
                (eventType === 'INSERT' || _pendingWrites.has(`room:${row.id}`))) return
            const editing = _editingRoom.value
            if (editing && editing.id === row.id) {
              const current = rooms.value.get(row.id)
              const merged = { ...row }
              if (current) {
                for (const field of editing.fields) {
                  merged[field] = current[field]
                }
              }
              rooms.value.set(row.id, merged)
            } else {
              rooms.value.set(row.id, row)
            }
          } else if (eventType === 'DELETE') {
            rooms.value.delete(old.id)
            if (selectedElement.value?.id === old.id) selectedElement.value = null
          }
        },
      )
      .subscribe()

    corridorChannel = realtime
      .channel(`session:${sessionId}:dungeon:${dungeonId}:corridors`, { sessionId })
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'dungeon_corridors', filter: `dungeon_id=eq.${dungeonId}` },
        ({ eventType, new: row, old }) => {
          if (eventType === 'INSERT' || eventType === 'UPDATE') {
            if (row.source_client === CLIENT_ID &&
                (eventType === 'INSERT' || _pendingWrites.has(`corridor:${row.id}`))) return
            corridors.value.set(row.id, row)
          } else if (eventType === 'DELETE') {
            corridors.value.delete(old.id)
            if (selectedElement.value?.id === old.id) selectedElement.value = null
          }
        },
      )
      .subscribe()

    tokenChannel = realtime
      .channel(`session:${sessionId}:dungeon:${dungeonId}:tokens`, { sessionId })
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'dungeon_tokens', filter: `dungeon_id=eq.${dungeonId}` },
        ({ eventType, new: row, old }) => {
          if (eventType === 'INSERT' || eventType === 'UPDATE') {
            if (row.source_client === CLIENT_ID &&
                (eventType === 'INSERT' || _pendingWrites.has(`token:${row.id}`))) return
            tokens.value.set(row.id, row)
          } else if (eventType === 'DELETE') {
            tokens.value.delete(old.id)
            if (selectedElement.value?.id === old.id) selectedElement.value = null
          }
        },
      )
      .subscribe()

    iconChannel = realtime
      .channel(`session:${sessionId}:dungeon:${dungeonId}:icons`, { sessionId })
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'dungeon_icons', filter: `dungeon_id=eq.${dungeonId}` },
        ({ eventType, new: row, old }) => {
          if (eventType === 'INSERT' || eventType === 'UPDATE') {
            if (row.source_client === CLIENT_ID &&
                (eventType === 'INSERT' || _pendingWrites.has(`icon:${row.id}`))) return
            icons.value.set(row.id, row)
          } else if (eventType === 'DELETE') {
            icons.value.delete(old.id)
            if (selectedElement.value?.id === old.id) selectedElement.value = null
          }
        },
      )
      .subscribe()

    const presence = createPresenceChannel({
      channelName: `dungeon:${dungeonId}:presence`,
      sessionId,
      clientId: CLIENT_ID,
      members: viewers,
      extraFields: () => ({
        editing_id:   selectedElement.value?.id ?? null,
        editing_type: selectedElement.value?.type ?? null,
      }),
    })
    presenceChannel = presence.channel
    _trackPresence = presence.track
    _stopAuthWatch = presence.stopAuthWatch
  }

  // temp ids of creates still in flight - the generator must not anchor a
  // plan on a room whose id is about to change
  const _pendingCreates = new Set()

  // rooms and corridors are the same optimistic collection: temp-id insert then
  // reconcile, toRaw-guarded rollback on a failed patch, backup-restore on a
  // failed delete, each step mirrored into the undo stack. they differ only in
  // endpoint, undo id field, and the activity label. rooms pass no addLabel
  // because their create path is the standalone addRoom below.
  function _elementOps({ collection, path, entity, idKey, addLabel, deleteLabel, nameOf }) {
    const Entity = entity[0].toUpperCase() + entity.slice(1)

    async function update(id, patch) {
      const existing = collection.value.get(id)
      if (!existing) return
      const optimistic = { ...existing, ...patch }
      collection.value.set(id, optimistic)

      _pendingWrites.begin([`${entity}:${id}`])
      try {
        await apiClient.patch(`${path}/${id}`, { ...patch, source_client: CLIENT_ID }, `update_${entity}`)
        const revert = Object.fromEntries(Object.keys(patch).map(k => [k, existing[k] ?? null]))
        pushUndo({ type: `update_${entity}`, [idKey]: id, patch: revert })
      } catch (error) {
        if (toRaw(collection.value.get(id)) === optimistic) collection.value.set(id, existing)
        console.error(`update${Entity} error:`, error instanceof ApiError ? error.message : error)
      } finally {
        _pendingWrites.end([`${entity}:${id}`])
      }
    }

    async function remove(id) {
      const backup = collection.value.get(id)
      collection.value.delete(id)
      if (selectedElement.value?.id === id) selectedElement.value = null

      try {
        await apiClient.delete(`${path}/${id}`, `delete_${entity}`)
        useActivityStore().record(deleteLabel, nameOf(backup))
        pushUndo({ type: `insert_${entity}`, data: backup })
      } catch (error) {
        if (backup && !collection.value.has(id)) collection.value.set(id, backup)
        console.error(`delete${Entity} error:`, error instanceof ApiError ? error.message : error)
      }
    }

    const ops = { update, remove }

    if (addLabel) {
      ops.add = async function add(elementData) {
        const tempId = crypto.randomUUID()
        const optimistic = { id: tempId, ...elementData, source_client: CLIENT_ID }
        collection.value.set(tempId, optimistic)

        let data
        try {
          data = await apiClient.post(path, { ...elementData, source_client: CLIENT_ID }, `create_${entity}`)
        } catch (error) {
          collection.value.delete(tempId)
          console.error(`add${Entity} error:`, error instanceof ApiError ? error.message : error)
          return
        }

        collection.value.delete(tempId)
        if (!collection.value.has(data.id)) collection.value.set(data.id, data)
        useActivityStore().record(addLabel, nameOf(data))
        pushUndo({ type: `delete_${entity}`, [idKey]: data.id })
      }
    }

    return ops
  }

  const _roomOps = _elementOps({
    collection: rooms, path: '/dungeon-rooms', entity: 'room', idKey: 'roomId',
    deleteLabel: 'deleted room',
    nameOf: (el) => el?.name ?? 'Unnamed Room',
  })
  const _corridorOps = _elementOps({
    collection: corridors, path: '/dungeon-corridors', entity: 'corridor', idKey: 'corridorId',
    addLabel: 'added corridor', deleteLabel: 'deleted corridor',
    nameOf: () => '',
  })

  // room's add is standalone: the generator needs the created row returned, a
  // silent mode, a 409 rethrow, and the temp id tracked in _pendingCreates so a
  // plan never anchors on a room whose id is about to change
  async function addRoom(roomData, { silent = false, rethrowConflict = false } = {}) {
    const tempId = crypto.randomUUID()
    const optimistic = { id: tempId, ...roomData, source_client: CLIENT_ID }
    rooms.value.set(tempId, optimistic)
    _pendingCreates.add(tempId)

    let data
    try {
      data = await apiClient.post('/dungeon-rooms', { ...roomData, source_client: CLIENT_ID }, 'create_room')
    } catch (error) {
      rooms.value.delete(tempId)
      _pendingCreates.delete(tempId)
      if (rethrowConflict && error instanceof ApiError && error.status === 409) throw error
      console.error('addRoom error:', error instanceof ApiError ? error.message : error)
      return
    }

    rooms.value.delete(tempId)
    _pendingCreates.delete(tempId)
    if (!rooms.value.has(data.id)) rooms.value.set(data.id, data)
    if (!silent) useActivityStore().record('added room', data.label ?? data.name ?? 'Unnamed Room')
    pushUndo({ type: 'delete_room', roomId: data.id })
    return data
  }
  const updateRoom = _roomOps.update
  const deleteRoom = _roomOps.remove
  const addCorridor = _corridorOps.add
  const updateCorridor = _corridorOps.update
  const deleteCorridor = _corridorOps.remove

  function addDoor(roomId, doorData, { silent = false } = {}) {
    const room = rooms.value.get(roomId)
    if (!room) return
    const doors = [...(room.doors ?? []), { id: crypto.randomUUID(), ...doorData }]
    const write = updateRoom(roomId, { doors })
    if (!silent) useActivityStore().record('added door to', room.label ?? room.name ?? 'Unnamed Room')
    return write
  }

  // generator mode (#50): one click rolls the next room - size, placement
  // flush against an existing room, exits in the create payload, contents from
  // the session table tagged dungeon.stocking (built-in fallback when there's
  // no table). the server rejects overlapping generated rooms with a 409 under
  // an advisory lock, so concurrent generators replan instead of stacking
  // rooms - generation is canonical (#55). generated geometry stays ordinary
  // room data, editable like anything hand-drawn.
  const generating = ref(false)

  async function generateRoom() {
    if (generating.value) return null
    if (!dungeon.value?.id) return null
    generating.value = true
    try {
      const stocking = await _rollStocking()

      for (let attempt = 0; attempt < 3; attempt += 1) {
        // fresh snapshot each attempt, excluding creates still in flight so a
        // plan never anchors on a temp id
        const snapshot = [...rooms.value.values()].filter(r => !_pendingCreates.has(r.id))
        const plan = generateRoomPlan(snapshot)

        let created
        try {
          created = await addRoom({
            dungeon_id: dungeon.value.id,
            session_id: dungeon.value.session_id,
            ...plan.room,
            doors: plan.roomDoors.map(door => ({ id: crypto.randomUUID(), ...door })),
            label: _nextRoomLabel(),
            notes: stocking,
            reject_overlapping: true,
          }, { silent: true, rethrowConflict: true })
        } catch {
          // someone generated into the same spot first - replan on fresh state
          continue
        }
        if (!created) return null

        if (plan.sourceDoor && rooms.value.has(plan.sourceDoor.roomId)) {
          await addDoor(plan.sourceDoor.roomId, plan.sourceDoor.door, { silent: true })
        }
        useActivityStore().record('explored into', `${created.label ?? 'a room'} - ${stocking}`)
        return { room: created, stocking }
      }
      console.error('generateRoom: no free placement after 3 attempts')
      return null
    } finally {
      generating.value = false
    }
  }

  // highest existing "Room N" + 1, stable across deletions and gaps
  function _nextRoomLabel() {
    let highest = 0
    for (const room of rooms.value.values()) {
      const match = /^Room (\d+)$/.exec(room.label ?? '')
      if (match) highest = Math.max(highest, Number(match[1]))
    }
    return `Room ${highest + 1}`
  }

  async function _rollStocking() {
    const table = useOracleStore().tables.find(t => t.tag === 'dungeon.stocking')
    if (table) {
      // straight to the api - no shared rolling-flag coupling with the oracle
      // panel, and the roll still lands in oracle history
      try {
        const roll = await apiClient.post('/oracle-rolls', {
          session_id: dungeon.value?.session_id,
          kind: 'table',
          table_id: table.id,
        }, 'dungeon_stocking_roll')
        const text = roll?.result?.result
        if (text) return text
        console.error('_rollStocking: empty roll from tagged table, using fallback')
      } catch (error) {
        console.error('_rollStocking failed, using fallback:', error instanceof ApiError ? error.message : error)
      }
    }
    return weightedPick(STOCKING_FALLBACK, Math.random).result
  }

  function moveDoor(fromRoomId, doorId, toRoomId, newDoorData) {
    if (fromRoomId === toRoomId) {
      const room = rooms.value.get(fromRoomId)
      if (!room) return
      updateRoom(fromRoomId, { doors: (room.doors ?? []).map(d => d.id === doorId ? { ...newDoorData } : d) })
    } else {
      const from = rooms.value.get(fromRoomId)
      if (from) updateRoom(fromRoomId, { doors: (from.doors ?? []).filter(d => d.id !== doorId) })
      const to = rooms.value.get(toRoomId)
      if (to) updateRoom(toRoomId, { doors: [...(to.doors ?? []), { ...newDoorData }] })
    }
  }

  function removeDoor(roomId, doorId) {
    const room = rooms.value.get(roomId)
    if (!room) return
    const doors = (room.doors ?? []).filter(d => d.id !== doorId)
    updateRoom(roomId, { doors })
    useActivityStore().record('removed door from', room.name ?? 'Unnamed Room')
  }

  function addRoomItem(roomId, type, x, y) {
    const room = rooms.value.get(roomId)
    if (!room) return
    const cx = x ?? room.origin_x + room.width / 2
    const cy = y ?? room.origin_y + room.height / 2
    const items = [...(room.items ?? []), { id: crypto.randomUUID(), type, x: cx, y: cy, notes: '' }]
    updateRoom(roomId, { items })
  }

  function removeRoomItem(roomId, itemId) {
    const room = rooms.value.get(roomId)
    if (!room) return
    const items = (room.items ?? []).filter(i => i.id !== itemId)
    updateRoom(roomId, { items })
  }

  function updateRoomItem(roomId, itemId, patch) {
    const room = rooms.value.get(roomId)
    if (!room) return
    const items = (room.items ?? []).map(i => i.id === itemId ? { ...i, ...patch } : i)
    updateRoom(roomId, { items })
  }

  // tokens stay off the shared undo stack - popping someone else's token move
  // as part of undoing your own drawing would be surprising
  function tokenForCharacter(characterId) {
    for (const token of tokens.value.values()) {
      if (token.character_id === characterId) return token
    }
    return null
  }

  // fog verdict only - the GM exemption is the caller's call (sessionStore.isGM)
  function isCellPlaceable(cellX, cellY) {
    if (!fogMode.value || fogRevealAll.value) return true
    return isCellRevealed(cellX, cellY)
  }

  function requestTokenDrop(characterId) {
    tokenDropRequest.value = { characterId, requestId: crypto.randomUUID() }
  }

  async function placeToken(characterId, x, y) {
    if (!dungeon.value?.id) return
    const existing = tokenForCharacter(characterId)
    if (existing) return moveToken(existing.id, { x, y })

    const tempId = crypto.randomUUID()
    const optimistic = {
      id: tempId,
      dungeon_id: dungeon.value.id,
      session_id: dungeon.value.session_id,
      character_id: characterId,
      x, y,
      source_client: CLIENT_ID,
    }
    tokens.value.set(tempId, optimistic)
    try {
      const data = await apiClient.post('/dungeon-tokens', {
        dungeon_id: dungeon.value.id,
        character_id: characterId,
        x, y,
        source_client: CLIENT_ID,
      }, 'place_token')
      tokens.value.delete(tempId)
      if (!tokens.value.has(data.id)) tokens.value.set(data.id, data)
      useActivityStore().record('placed token', '')
    } catch (error) {
      tokens.value.delete(tempId)
      console.error('placeToken error:', error instanceof ApiError ? error.message : error)
    }
  }

  async function moveToken(id, patch) {
    const existing = tokens.value.get(id)
    if (!existing) return
    const optimistic = { ...existing, ...patch }
    tokens.value.set(id, optimistic)

    _pendingWrites.begin([`token:${id}`])
    try {
      await apiClient.patch(`/dungeon-tokens/${id}`, { ...patch, source_client: CLIENT_ID }, 'move_token')
    } catch (error) {
      if (toRaw(tokens.value.get(id)) === optimistic) tokens.value.set(id, existing)
      console.error('moveToken error:', error instanceof ApiError ? error.message : error)
    } finally {
      _pendingWrites.end([`token:${id}`])
    }
  }

  async function removeToken(id) {
    const backup = tokens.value.get(id)
    tokens.value.delete(id)
    if (selectedElement.value?.id === id) selectedElement.value = null
    try {
      await apiClient.delete(`/dungeon-tokens/${id}`, 'remove_token')
      useActivityStore().record('removed token', '')
    } catch (error) {
      if (backup && !tokens.value.has(id)) tokens.value.set(id, backup)
      console.error('removeToken error:', error instanceof ApiError ? error.message : error)
    }
  }

  // free-placed grid icons (fog-mode annotation layer). like tokens they stay
  // off the shared undo stack and mirror the fog placement rule client-side.
  function iconsAtCell(cellX, cellY) {
    const result = []
    for (const icon of icons.value.values()) {
      if (icon.x === cellX && icon.y === cellY) result.push(icon)
    }
    return result
  }

  async function addIcon(type, x, y) {
    if (!dungeon.value?.id) return
    const tempId = crypto.randomUUID()
    const optimistic = {
      id: tempId,
      dungeon_id: dungeon.value.id,
      session_id: dungeon.value.session_id,
      type, x, y,
      label: null,
      notes: null,
      source_client: CLIENT_ID,
    }
    icons.value.set(tempId, optimistic)
    try {
      const data = await apiClient.post('/dungeon-icons', {
        dungeon_id: dungeon.value.id,
        type, x, y,
        source_client: CLIENT_ID,
      }, 'place_icon')
      icons.value.delete(tempId)
      if (!icons.value.has(data.id)) icons.value.set(data.id, data)
      useActivityStore().record('placed icon', type)
    } catch (error) {
      icons.value.delete(tempId)
      console.error('addIcon error:', error instanceof ApiError ? error.message : error)
    }
  }

  async function updateIcon(id, patch) {
    const existing = icons.value.get(id)
    if (!existing) return
    const optimistic = { ...existing, ...patch }
    icons.value.set(id, optimistic)

    _pendingWrites.begin([`icon:${id}`])
    try {
      await apiClient.patch(`/dungeon-icons/${id}`, { ...patch, source_client: CLIENT_ID }, 'update_icon')
    } catch (error) {
      if (toRaw(icons.value.get(id)) === optimistic) icons.value.set(id, existing)
      console.error('updateIcon error:', error instanceof ApiError ? error.message : error)
    } finally {
      _pendingWrites.end([`icon:${id}`])
    }
  }

  async function removeIcon(id) {
    const backup = icons.value.get(id)
    icons.value.delete(id)
    if (selectedElement.value?.id === id) selectedElement.value = null
    try {
      await apiClient.delete(`/dungeon-icons/${id}`, 'remove_icon')
      useActivityStore().record('removed icon', backup?.type ?? '')
    } catch (error) {
      if (backup && !icons.value.has(id)) icons.value.set(id, backup)
      console.error('removeIcon error:', error instanceof ApiError ? error.message : error)
    }
  }

  function selectElement(type, id, extra = {}) {
    selectedElement.value = { type, id, ...extra }
    _trackPresence?.()
  }

  function deselect() {
    selectedElement.value = null
    _trackPresence?.()
  }

  function beginRoomEdit(id, fields) {
    _editingRoom.value = { id, fields }
  }

  function endRoomEdit() {
    _editingRoom.value = null
  }

  async function updateTorch(patch) {
    if (!dungeon.value?.id) return
    dungeon.value = { ...dungeon.value, ...patch }
    const fields = Object.keys(patch)
    _pendingDungeonFields.begin(fields)
    try {
      await apiClient.patch(`/dungeons/${dungeon.value.id}`, patch, 'update_torch')
    } catch (err) { console.error('updateTorch error:', err instanceof ApiError ? err.message : err) }
    finally { _pendingDungeonFields.end(fields) }
  }

  const { torchStart, torchPause, torchReset } = createTorchControls({
    base: () => dungeon.value?.id ? `/dungeons/${dungeon.value.id}` : null,
    intent: (action) => `torch_${action}`,
    apply: (action) => {
      if (action === 'start') {
        dungeon.value = { ...dungeon.value, torch_running: true, torch_started_at: new Date().toISOString() }
      } else if (action === 'reset') {
        dungeon.value = {
          ...dungeon.value,
          torch_elapsed_ms: 0,
          torch_started_at: dungeon.value.torch_running ? new Date().toISOString() : null,
        }
      }
    },
  })

  function cleanup() {
    _initGeneration += 1
    if (_fogRefetchTimer) { clearTimeout(_fogRefetchTimer); _fogRefetchTimer = null }
    _removeChannels()
    _cleanupImageUrl()
    _dungeonId  = null
    _pendingWrites.clear()
    _pendingDungeonFields.clear()
    _pendingFogOps.clear()
    dungeon.value = null
    rooms.value = new Map()
    corridors.value = new Map()
    tokens.value = new Map()
    icons.value = new Map()
    viewers.value = []
    selectedElement.value = null
    tokenDropRequest.value = null
    loadError.value = null
    loading.value = true
    undoStack.value = []
    fogCells.value = new Set()
    Object.keys(_localOverrides).forEach(k => delete _localOverrides[k])
  }

  return {
    dungeon,
    rooms,
    corridors,
    tokens,
    icons,
    loading,
    loadError,
    drawMode,
    selectedElement,
    viewers,
    undoStack,
    dungeonImageUrl,
    fogCells,
    fogMode,
    fogRevealAll,
    init,
    refresh,
    undo,
    addRoom,
    generateRoom,
    generating,
    updateRoom,
    deleteRoom,
    addCorridor,
    updateCorridor,
    deleteCorridor,
    addDoor,
    moveDoor,
    removeDoor,
    addRoomItem,
    removeRoomItem,
    updateRoomItem,
    selectElement,
    deselect,
    beginRoomEdit,
    endRoomEdit,
    updateTorch,
    torchStart,
    torchPause,
    torchReset,
    cleanup,
    uploadDungeonImage,
    updateDungeon,
    clearMapImage,
    applyDungeonLocalPatch,
    isCellRevealed,
    isCellPlaceable,
    tokenForCharacter,
    tokenDropRequest,
    requestTokenDrop,
    placeToken,
    moveToken,
    removeToken,
    iconsAtCell,
    addIcon,
    updateIcon,
    removeIcon,
    revealFogCell,
    hideFogCell,
    revealFogCells,
    hideFogCells,
    revealAllFog,
    hideAllFog,
  }
})
