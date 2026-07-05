import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { supabase } from '@/lib/supabase'
import { realtime } from '@/lib/realtime.js'
import { apiClient, ApiError } from '@/lib/apiClient.js'
import { useAuthStore } from '@/stores/authStore.js'
import { useActivityStore } from '@/stores/activityStore.js'

const CLIENT_ID = crypto.randomUUID()
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_IMAGE_BYTES = 50 * 1024 * 1024
const URL_EXPIRY_SECONDS = 86400

export const useD = defineStore('dungeon', () => {
  const dungeon = ref(null)
  const rooms = ref(new Map())
  const corridors = ref(new Map())
  const loading = ref(true)
  const loadError = ref(null)
  const drawMode = ref('select')
  const selectedElement = ref(null)
  const viewers = ref([])
  const undoStack = ref([])
  const _editingRoom = ref(null)

  const dungeonImageUrl = ref(null)
  const fogCells = ref(new Set())
  const _localOverrides = {}

  const fogMode = computed(() => dungeon.value?.fog_mode ?? false)
  const fogRevealAll = computed(() => dungeon.value?.fog_reveal_all ?? false)

  let roomChannel = null
  let corridorChannel = null
  let dungeonChannel = null
  let presenceChannel = null
  let fogChannel = null
  let undoChannel = null
  let changesChannel = null
  let _stopAuthWatch = null
  let _undoing = false
  let _urlTimer = null
  let _urlRenewal = null
  let _dungeonId = null
  let _initGeneration = 0

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
        _broadcastChange('room_delete', { roomId: action.roomId })
        break
      }
      case 'insert_room': {
        rooms.value.set(action.data.id, { ...action.data })
        await apiClient.post('/dungeon-rooms', { ...action.data, source_client: CLIENT_ID }, 'undo_insert_room').catch(_logUndoError('insert_room'))
        _broadcastChange('room_upsert', { room: action.data })
        break
      }
      case 'update_room': {
        const r = rooms.value.get(action.roomId)
        if (r) rooms.value.set(action.roomId, { ...r, ...action.patch })
        await apiClient.patch(`/dungeon-rooms/${action.roomId}`, { ...action.patch, source_client: CLIENT_ID }, 'undo_update_room').catch(_logUndoError('update_room'))
        _broadcastChange('room_upsert', { room: rooms.value.get(action.roomId) })
        break
      }
      case 'delete_corridor': {
        corridors.value.delete(action.corridorId)
        if (selectedElement.value?.id === action.corridorId) selectedElement.value = null
        await apiClient.delete(`/dungeon-corridors/${action.corridorId}`, 'undo_delete_corridor').catch(_logUndoError('delete_corridor'))
        _broadcastChange('corridor_delete', { corridorId: action.corridorId })
        break
      }
      case 'insert_corridor': {
        corridors.value.set(action.data.id, { ...action.data })
        await apiClient.post('/dungeon-corridors', { ...action.data, source_client: CLIENT_ID }, 'undo_insert_corridor').catch(_logUndoError('insert_corridor'))
        _broadcastChange('corridor_upsert', { corridor: action.data })
        break
      }
      case 'update_corridor': {
        const c = corridors.value.get(action.corridorId)
        if (c) corridors.value.set(action.corridorId, { ...c, ...action.patch })
        await apiClient.patch(`/dungeon-corridors/${action.corridorId}`, { ...action.patch, source_client: CLIENT_ID }, 'undo_update_corridor').catch(_logUndoError('update_corridor'))
        _broadcastChange('corridor_upsert', { corridor: corridors.value.get(action.corridorId) })
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

  function _subscribeChangesChannel(sessionId, dungeonId) {
    if (changesChannel) realtime.removeChannel(changesChannel)
    changesChannel = realtime
      .channel(`dungeon:${dungeonId}:changes`, { sessionId })
      .on('broadcast', { event: 'room_upsert' }, ({ payload }) => {
        if (payload._src === CLIENT_ID) return
        const editing = _editingRoom.value
        if (editing && editing.id === payload.room.id) {
          const current = rooms.value.get(payload.room.id)
          const merged = { ...payload.room }
          if (current) { for (const f of editing.fields) merged[f] = current[f] }
          rooms.value.set(payload.room.id, merged)
        } else {
          rooms.value.set(payload.room.id, payload.room)
        }
      })
      .on('broadcast', { event: 'room_delete' }, ({ payload }) => {
        if (payload._src === CLIENT_ID) return
        rooms.value.delete(payload.roomId)
        if (selectedElement.value?.id === payload.roomId) selectedElement.value = null
      })
      .on('broadcast', { event: 'corridor_upsert' }, ({ payload }) => {
        if (payload._src === CLIENT_ID) return
        corridors.value.set(payload.corridor.id, payload.corridor)
      })
      .on('broadcast', { event: 'corridor_delete' }, ({ payload }) => {
        if (payload._src === CLIENT_ID) return
        corridors.value.delete(payload.corridorId)
        if (selectedElement.value?.id === payload.corridorId) selectedElement.value = null
      })
      .subscribe()
  }

  function _broadcastChange(event, payload) {
    changesChannel?.send({ type: 'broadcast', event, payload: { ...payload, _src: CLIENT_ID } })
  }

  async function _refreshImageUrl(path) {
    if (_urlTimer) { clearTimeout(_urlTimer); _urlTimer = null }
    _urlRenewal = null
    if (!path) { dungeonImageUrl.value = null; return }
    const { data, error } = await supabase.storage
      .from('session-maps')
      .createSignedUrl(path, URL_EXPIRY_SECONDS)
    if (error) {
      if (error.message !== 'Object not found') console.error('dungeonStore refreshImageUrl:', error.message)
      dungeonImageUrl.value = null
      return
    }
    dungeonImageUrl.value = data.signedUrl
    const renewalMs = URL_EXPIRY_SECONDS * 0.9 * 1000
    _urlRenewal = { path, at: Date.now() + renewalMs }
    _urlTimer = setTimeout(() => _refreshImageUrl(path), renewalMs)
  }

  // Background tabs throttle timers, so a long-hidden tab can outlive its signed
  // URL; renew an overdue one as soon as the tab is visible again.
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return
      if (_urlRenewal && Date.now() >= _urlRenewal.at) _refreshImageUrl(_urlRenewal.path)
    })
  }

  watch(() => dungeon.value?.map_image_path, p => _refreshImageUrl(p ?? null), { immediate: false })

  async function uploadDungeonImage(sessionId, file) {
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) throw new Error('Only JPEG, PNG, and WebP images are allowed.')
    if (file.size > MAX_IMAGE_BYTES) throw new Error('Image must be under 50 MB.')
    await new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file)
      const img = new Image()
      img.onload  = () => { URL.revokeObjectURL(url); resolve() }
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('File could not be decoded as an image.')) }
      img.src = url
    })
    const extMap = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }
    const path = `${sessionId}/dungeon-${crypto.randomUUID()}.${extMap[file.type]}`
    const { error } = await supabase.storage
      .from('session-maps')
      .upload(path, file, { contentType: file.type, upsert: false })
    if (error) throw new Error(error.message)
    return path
  }

  async function updateDungeon(patch) {
    if (!dungeon.value?.id) return false
    const id = dungeon.value.id
    const dbPatch = {}
    if (patch.fogMode          !== undefined) dbPatch.fog_mode            = patch.fogMode
    if (patch.fogRevealAll     !== undefined) dbPatch.fog_reveal_all      = patch.fogRevealAll
    if (patch.gmInitiative     !== undefined) dbPatch.gm_initiative       = patch.gmInitiative ?? null
    if (patch.mapImagePath     !== undefined) dbPatch.map_image_path      = patch.mapImagePath
    if (patch.mapImageOffsetX  !== undefined) dbPatch.map_image_offset_x  = patch.mapImageOffsetX
    if (patch.mapImageOffsetY  !== undefined) dbPatch.map_image_offset_y  = patch.mapImageOffsetY
    if (patch.mapImageScale    !== undefined) dbPatch.map_image_scale     = patch.mapImageScale
    if (patch.mapImageRotation !== undefined) dbPatch.map_image_rotation  = patch.mapImageRotation
    if (patch.mapOffsetLocked  !== undefined) dbPatch.map_offset_locked   = patch.mapOffsetLocked

    dungeon.value = { ...dungeon.value, ...dbPatch }
    const overrides = _localOverrides[id]
    if (overrides) {
      for (const [k, v] of Object.entries(dbPatch)) {
        if (overrides[k] === v) delete overrides[k]
      }
    }

    try {
      await apiClient.patch(`/dungeons/${id}`, dbPatch, 'update_dungeon_config')
    } catch (err) { console.error('updateDungeon:', err instanceof ApiError ? err.message : err); return false }
    return true
  }

  function applyDungeonLocalPatch(patch) {
    if (!dungeon.value?.id) return
    const id = dungeon.value.id
    const dbPatch = {}
    if (patch.mapImageOffsetX  !== undefined) dbPatch.map_image_offset_x  = patch.mapImageOffsetX
    if (patch.mapImageOffsetY  !== undefined) dbPatch.map_image_offset_y  = patch.mapImageOffsetY
    if (patch.mapImageScale    !== undefined) dbPatch.map_image_scale     = patch.mapImageScale
    if (patch.mapImageRotation !== undefined) dbPatch.map_image_rotation  = patch.mapImageRotation
    _localOverrides[id] = { ...(_localOverrides[id] ?? {}), ...dbPatch }
    dungeon.value = { ...dungeon.value, ...dbPatch }
  }

  function _fogKey(x, y) { return `${x}:${y}` }

  function isCellRevealed(cellX, cellY) {
    return fogCells.value.has(_fogKey(cellX, cellY))
  }

  async function revealFogCell(dungeonId, cellX, cellY) {
    const key = _fogKey(cellX, cellY)
    if (fogCells.value.has(key)) return
    fogCells.value = new Set(fogCells.value).add(key)
    try {
      await apiClient.post('/dungeon-fog/reveal', { dungeon_id: dungeonId, cell_x: cellX, cell_y: cellY, source_client: CLIENT_ID }, 'reveal_fog')
    } catch (err) {
      const next = new Set(fogCells.value); next.delete(key); fogCells.value = next
      console.error('revealFogCell:', err instanceof ApiError ? err.message : err)
    }
  }

  async function hideFogCell(dungeonId, cellX, cellY) {
    const key = _fogKey(cellX, cellY)
    if (!fogCells.value.has(key)) return
    const next = new Set(fogCells.value); next.delete(key); fogCells.value = next
    try {
      await apiClient.post('/dungeon-fog/hide', { dungeon_id: dungeonId, cell_x: cellX, cell_y: cellY }, 'hide_fog')
    } catch (err) {
      fogCells.value = new Set(fogCells.value).add(key)
      console.error('hideFogCell:', err instanceof ApiError ? err.message : err)
    }
  }

  async function revealFogCells(dungeonId, cells) {
    if (!cells.length) return
    const newCells = new Set(fogCells.value)
    const rows = []
    for (const { cellX, cellY } of cells) {
      const key = _fogKey(cellX, cellY)
      if (!newCells.has(key)) { newCells.add(key); rows.push({ cell_x: cellX, cell_y: cellY }) }
    }
    if (!rows.length) return
    fogCells.value = newCells
    try {
      await apiClient.post('/dungeon-fog/reveal-bulk', { dungeon_id: dungeonId, source_client: CLIENT_ID, cells: rows }, 'reveal_fog_bulk')
    } catch (err) { console.error('revealFogCells:', err instanceof ApiError ? err.message : err) }
  }

  async function hideFogCells(dungeonId, cells) {
    if (!cells.length) return
    const newCells = new Set(fogCells.value)
    const toDelete = []
    for (const { cellX, cellY } of cells) {
      const key = _fogKey(cellX, cellY)
      if (newCells.has(key)) { newCells.delete(key); toDelete.push({ cell_x: cellX, cell_y: cellY }) }
    }
    if (!toDelete.length) return
    fogCells.value = newCells
    try {
      await apiClient.post('/dungeon-fog/hide-bulk', { dungeon_id: dungeonId, cells: toDelete }, 'hide_fog_bulk')
    } catch (err) { console.error('hideFogCells:', err instanceof ApiError ? err.message : err) }
  }

  async function revealAllFog(dungeonId) {
    try {
      await apiClient.post('/dungeon-fog/clear', { dungeon_id: dungeonId }, 'reveal_all_fog')
    } catch (err) { console.error('revealAllFog:', err instanceof ApiError ? err.message : err) }
    await updateDungeon({ fogRevealAll: true })
  }

  async function hideAllFog(dungeonId) {
    try {
      await apiClient.post('/dungeon-fog/clear', { dungeon_id: dungeonId }, 'hide_all_fog')
    } catch (err) { console.error('hideAllFog:', err instanceof ApiError ? err.message : err) }
    fogCells.value = new Set()
    await updateDungeon({ fogRevealAll: false })
  }

  async function refresh() {
    const dungeonId = _dungeonId
    if (!dungeonId) return
    try {
      const [{ data: dungeonData, error: e1 }, { data: roomData }, { data: corridorData }, { data: fogData }] = await Promise.all([
        supabase.from('dungeons').select('*').eq('id', dungeonId).single(),
        supabase.from('dungeon_rooms').select('*').eq('dungeon_id', dungeonId),
        supabase.from('dungeon_corridors').select('*').eq('dungeon_id', dungeonId),
        supabase.from('dungeon_fog_cells').select('cell_x, cell_y').eq('dungeon_id', dungeonId),
      ])
      if (e1) throw new Error(e1.message)
      if (_dungeonId !== dungeonId) return

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
      loadError.value = null
    } catch (err) {
      console.error('dungeonStore.refresh error:', err)
    }
  }

  async function init(sessionId, dungeonId) {
    const generation = ++_initGeneration
    _dungeonId = dungeonId
    loading.value = true
    loadError.value = null
    drawMode.value = 'select'
    selectedElement.value = null
    undoStack.value = []

    try {
      const [{ data: dungeonData, error: e1 }, { data: roomData }, { data: corridorData }] = await Promise.all([
        supabase.from('dungeons').select('*').eq('id', dungeonId).single(),
        supabase.from('dungeon_rooms').select('*').eq('dungeon_id', dungeonId),
        supabase.from('dungeon_corridors').select('*').eq('dungeon_id', dungeonId),
      ])

      if (generation !== _initGeneration) return
      if (e1) throw new Error(e1.message)

      dungeon.value = dungeonData
      rooms.value = new Map((roomData ?? []).map(r => [r.id, r]))
      corridors.value = new Map((corridorData ?? []).map(c => [c.id, c]))

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

    if (dungeonChannel) realtime.removeChannel(dungeonChannel)
    if (roomChannel) realtime.removeChannel(roomChannel)
    if (corridorChannel) realtime.removeChannel(corridorChannel)
    if (fogChannel) realtime.removeChannel(fogChannel)
    _subscribeUndoChannel(sessionId, dungeonId)
    _subscribeChangesChannel(sessionId, dungeonId)

    let subscribedRefreshed = false
    dungeonChannel = realtime
      .channel(`dungeon:${dungeonId}:meta`, { sessionId, onReconnect: () => refresh() })
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'dungeons', filter: `id=eq.${dungeonId}` },
        ({ new: row }) => {
          const local = _localOverrides[row.id] ?? {}
          dungeon.value = { ...row, ...local }
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
            if (row.source_client !== CLIENT_ID)
              fogCells.value = new Set(fogCells.value).add(_fogKey(row.cell_x, row.cell_y))
          } else if (eventType === 'DELETE') {
            const next = new Set(fogCells.value)
            next.delete(_fogKey(old.cell_x, old.cell_y))
            fogCells.value = next
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
            if (row.source_client !== CLIENT_ID) {
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
            }
          } else if (eventType === 'DELETE') {
            rooms.value.delete(old.id)
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
            if (row.source_client !== CLIENT_ID) corridors.value.set(row.id, row)
          } else if (eventType === 'DELETE') {
            corridors.value.delete(old.id)
          }
        },
      )
      .subscribe()

    if (_stopAuthWatch) { _stopAuthWatch(); _stopAuthWatch = null }
    if (presenceChannel) realtime.removeChannel(presenceChannel)
    const authStore = useAuthStore()

    const syncViewers = () => {
      const state = presenceChannel.presenceState()
      const latest = Object.values(state).map(entries => entries.at(-1)).filter(Boolean)
      const byUser = new Map()
      for (const p of latest) byUser.set(p.user_id ?? p._clientId, p)
      viewers.value = [...byUser.values()]
    }

    presenceChannel = realtime.channel(`dungeon:${dungeonId}:presence`, {
      sessionId,
      config: { presence: { key: authStore.user?.id ?? CLIENT_ID } },
    })
      .on('presence', { event: 'sync' }, syncViewers)
      .on('presence', { event: 'join' }, syncViewers)
      .on('presence', { event: 'leave' }, syncViewers)
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await presenceChannel.track({
            user_id:      authStore.user?.id ?? null,
            _clientId:    CLIENT_ID,
            display_name: authStore.displayName ?? 'Adventurer',
            avatar_url:   authStore.avatarUrl ?? null,
            editing_id:   selectedElement.value?.id ?? null,
            editing_type: selectedElement.value?.type ?? null,
          })
        }
      })

    _stopAuthWatch = watch(
      () => authStore.user?.id,
      (userId, prev) => {
        if (!userId || userId === prev || !presenceChannel) return
        presenceChannel.track({
          user_id:      userId,
          _clientId:    CLIENT_ID,
          display_name: authStore.displayName ?? 'Adventurer',
          avatar_url:   authStore.avatarUrl ?? null,
          editing_id:   selectedElement.value?.id ?? null,
          editing_type: selectedElement.value?.type ?? null,
        })
      },
    )
  }

  async function addRoom(roomData) {
    const tempId = crypto.randomUUID()
    const optimistic = { id: tempId, ...roomData, source_client: CLIENT_ID }
    rooms.value.set(tempId, optimistic)

    let data
    try {
      data = await apiClient.post('/dungeon-rooms', { ...roomData, source_client: CLIENT_ID }, 'create_room')
    } catch (error) {
      rooms.value.delete(tempId)
      console.error('addRoom error:', error instanceof ApiError ? error.message : error)
      return
    }

    rooms.value.delete(tempId)
    rooms.value.set(data.id, data)
    useActivityStore().record('added room', data.name ?? 'Unnamed Room')
    pushUndo({ type: 'delete_room', roomId: data.id })
    _broadcastChange('room_upsert', { room: data })
  }

  async function updateRoom(id, patch) {
    const existing = rooms.value.get(id)
    if (!existing) return
    rooms.value.set(id, { ...existing, ...patch })

    try {
      await apiClient.patch(`/dungeon-rooms/${id}`, { ...patch, source_client: CLIENT_ID }, 'update_room')
      const revert = Object.fromEntries(Object.keys(patch).map(k => [k, existing[k] ?? null]))
      pushUndo({ type: 'update_room', roomId: id, patch: revert })
      _broadcastChange('room_upsert', { room: rooms.value.get(id) })
    } catch (error) {
      rooms.value.set(id, existing)
      console.error('updateRoom error:', error instanceof ApiError ? error.message : error)
    }
  }

  async function deleteRoom(id) {
    const backup = rooms.value.get(id)
    rooms.value.delete(id)
    if (selectedElement.value?.id === id) selectedElement.value = null

    try {
      await apiClient.delete(`/dungeon-rooms/${id}`, 'delete_room')
      useActivityStore().record('deleted room', backup?.name ?? 'Unnamed Room')
      pushUndo({ type: 'insert_room', data: backup })
      _broadcastChange('room_delete', { roomId: id })
    } catch (error) {
      if (backup) rooms.value.set(id, backup)
      console.error('deleteRoom error:', error instanceof ApiError ? error.message : error)
    }
  }

  async function addCorridor(corridorData) {
    const tempId = crypto.randomUUID()
    const optimistic = { id: tempId, ...corridorData, source_client: CLIENT_ID }
    corridors.value.set(tempId, optimistic)

    let data
    try {
      data = await apiClient.post('/dungeon-corridors', { ...corridorData, source_client: CLIENT_ID }, 'create_corridor')
    } catch (error) {
      corridors.value.delete(tempId)
      console.error('addCorridor error:', error instanceof ApiError ? error.message : error)
      return
    }

    corridors.value.delete(tempId)
    corridors.value.set(data.id, data)
    useActivityStore().record('added corridor', '')
    pushUndo({ type: 'delete_corridor', corridorId: data.id })
    _broadcastChange('corridor_upsert', { corridor: data })
  }

  async function updateCorridor(id, patch) {
    const existing = corridors.value.get(id)
    if (!existing) return
    corridors.value.set(id, { ...existing, ...patch })

    try {
      await apiClient.patch(`/dungeon-corridors/${id}`, { ...patch, source_client: CLIENT_ID }, 'update_corridor')
      const revert = Object.fromEntries(Object.keys(patch).map(k => [k, existing[k] ?? null]))
      pushUndo({ type: 'update_corridor', corridorId: id, patch: revert })
      _broadcastChange('corridor_upsert', { corridor: corridors.value.get(id) })
    } catch (error) {
      corridors.value.set(id, existing)
      console.error('updateCorridor error:', error instanceof ApiError ? error.message : error)
    }
  }

  async function deleteCorridor(id) {
    const backup = corridors.value.get(id)
    corridors.value.delete(id)
    if (selectedElement.value?.id === id) selectedElement.value = null

    try {
      await apiClient.delete(`/dungeon-corridors/${id}`, 'delete_corridor')
      useActivityStore().record('deleted corridor', '')
      pushUndo({ type: 'insert_corridor', data: backup })
      _broadcastChange('corridor_delete', { corridorId: id })
    } catch (error) {
      if (backup) corridors.value.set(id, backup)
      console.error('deleteCorridor error:', error instanceof ApiError ? error.message : error)
    }
  }

  function addDoor(roomId, doorData) {
    const room = rooms.value.get(roomId)
    if (!room) return
    const doors = [...(room.doors ?? []), { id: crypto.randomUUID(), ...doorData }]
    updateRoom(roomId, { doors })
    useActivityStore().record('added door to', room.name ?? 'Unnamed Room')
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

  function selectElement(type, id, extra = {}) {
    selectedElement.value = { type, id, ...extra }
    _trackPresence()
  }

  function deselect() {
    selectedElement.value = null
    _trackPresence()
  }

  function _trackPresence() {
    if (!presenceChannel) return
    const authStore = useAuthStore()
    presenceChannel.track({
      user_id:      authStore.user?.id ?? null,
      _clientId:    CLIENT_ID,
      display_name: authStore.displayName ?? 'Adventurer',
      avatar_url:   authStore.avatarUrl ?? null,
      editing_id:   selectedElement.value?.id ?? null,
      editing_type: selectedElement.value?.type ?? null,
    })
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
    try {
      await apiClient.patch(`/dungeons/${dungeon.value.id}`, patch, 'update_torch')
    } catch (err) { console.error('updateTorch error:', err instanceof ApiError ? err.message : err) }
  }

  async function torchStart() {
    if (!dungeon.value?.id) return
    dungeon.value = { ...dungeon.value, torch_running: true }
    try {
      await apiClient.post(`/dungeons/${dungeon.value.id}/torch`, { action: 'start' }, 'torch_start')
    } catch (err) { console.error('torchStart error:', err instanceof ApiError ? err.message : err) }
  }

  async function torchPause() {
    if (!dungeon.value?.id) return
    try {
      await apiClient.post(`/dungeons/${dungeon.value.id}/torch`, { action: 'pause' }, 'torch_pause')
    } catch (err) { console.error('torchPause error:', err instanceof ApiError ? err.message : err) }
  }

  async function torchReset() {
    if (!dungeon.value?.id) return
    dungeon.value = {
      ...dungeon.value,
      torch_elapsed_ms: 0,
      torch_started_at: dungeon.value.torch_running ? new Date().toISOString() : null,
    }
    try {
      await apiClient.post(`/dungeons/${dungeon.value.id}/torch`, { action: 'reset' }, 'torch_reset')
    } catch (err) { console.error('torchReset error:', err instanceof ApiError ? err.message : err) }
  }

  function cleanup() {
    _initGeneration += 1
    if (_stopAuthWatch) { _stopAuthWatch(); _stopAuthWatch = null }
    if (dungeonChannel)  realtime.removeChannel(dungeonChannel)
    if (roomChannel)     realtime.removeChannel(roomChannel)
    if (corridorChannel) realtime.removeChannel(corridorChannel)
    if (presenceChannel) realtime.removeChannel(presenceChannel)
    if (fogChannel)      realtime.removeChannel(fogChannel)
    if (undoChannel)     realtime.removeChannel(undoChannel)
    if (changesChannel)  realtime.removeChannel(changesChannel)
    if (_urlTimer)       { clearTimeout(_urlTimer); _urlTimer = null }
    _urlRenewal     = null
    _dungeonId      = null
    dungeonChannel  = null
    roomChannel     = null
    corridorChannel = null
    presenceChannel = null
    fogChannel      = null
    undoChannel     = null
    changesChannel  = null
    dungeon.value = null
    rooms.value = new Map()
    corridors.value = new Map()
    viewers.value = []
    selectedElement.value = null
    loadError.value = null
    loading.value = true
    undoStack.value = []
    dungeonImageUrl.value = null
    fogCells.value = new Set()
    Object.keys(_localOverrides).forEach(k => delete _localOverrides[k])
  }

  return {
    dungeon,
    rooms,
    corridors,
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
    applyDungeonLocalPatch,
    isCellRevealed,
    revealFogCell,
    hideFogCell,
    revealFogCells,
    hideFogCells,
    revealAllFog,
    hideAllFog,
  }
})
