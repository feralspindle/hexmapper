import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { supabase } from '@/lib/supabase'
import { realtime } from '@/lib/realtime.js'
import { apiClient, ApiError } from '@/lib/apiClient.js'
import { uploadSessionImage } from '@/lib/sessionImage.js'
import { createSignedMapUrl } from '@/lib/signedMapUrl.js'
import { useSessionStore } from '@/stores/sessionStore.js'

const MAX_IMAGE_BYTES = 10 * 1024 * 1024

export const useMapStore = defineStore('map', () => {
  const maps   = ref([])
  const loading = ref(false)
  const loadError = ref(null)

  let mapChannel = null
  let _currentSessionId = null
  let _initGeneration = 0
  const _localOverrides = {}
  const _overrideAt = {}
  const OVERRIDE_MAX_AGE_MS = 10000

  // Overrides are released when a server row confirms the written value, not on
  // the PATCH ack — a stale realtime echo delivered after the ack would otherwise
  // briefly revert the field. The age cap stops a lost echo from masking another
  // client's later write indefinitely.
  function _mergeLocalOverrides(row) {
    const local = _localOverrides[row.id]
    if (!local) return row
    if (Date.now() - (_overrideAt[row.id] ?? 0) > OVERRIDE_MAX_AGE_MS) {
      delete _localOverrides[row.id]
      delete _overrideAt[row.id]
      return row
    }
    for (const [field, val] of Object.entries(local)) {
      if (row[field] === val) delete local[field]
    }
    if (Object.keys(local).length === 0) {
      delete _localOverrides[row.id]
      delete _overrideAt[row.id]
      return row
    }
    return { ...row, ...local }
  }

  const activeMap = computed(() =>
    maps.value.find(m => m.id === useSessionStore().activeMapId) ?? null
  )

  const parentMap = computed(() => {
    if (!activeMap.value?.parent_map_id) return null
    return maps.value.find(m => m.id === activeMap.value.parent_map_id) ?? null
  })

  const childMapsByHexId = computed(() => {
    const m = new Map()
    for (const map of maps.value) {
      if (!map.parent_hex_id) continue
      const existing = m.get(map.parent_hex_id) ?? []
      m.set(map.parent_hex_id, [...existing, map])
    }
    return m
  })

  function ancestorChain() {
    const chain = []
    let cur = activeMap.value
    while (cur?.parent_map_id) {
      const parent = maps.value.find(m => m.id === cur.parent_map_id)
      if (!parent) break
      chain.unshift(parent)
      cur = parent
    }
    return chain
  }

  const { url: activeMapImageUrl, refresh: _refreshActiveUrl, cleanup: _cleanupUrl } = createSignedMapUrl()

  watch(() => activeMap.value?.map_image_path, p => _refreshActiveUrl(p), { immediate: false })

  const mapType          = computed(() => activeMap.value?.map_type           ?? 'hex')
  const mapHexWidth      = computed(() => activeMap.value?.map_hex_width      ?? 96)
  const mapHexHeight     = computed(() => activeMap.value?.map_hex_height     ?? null)
  const mapImageRotation = computed(() => activeMap.value?.map_image_rotation ?? 0)
  const mapGridRotation  = computed(() => activeMap.value?.map_grid_rotation  ?? 0)
  const mapImageOffsetX  = computed(() => activeMap.value?.map_image_offset_x ?? 0)
  const mapImageOffsetY  = computed(() => activeMap.value?.map_image_offset_y ?? 0)
  const mapGridOffsetX   = computed(() => activeMap.value?.map_grid_offset_x  ?? 0)
  const mapGridOffsetY   = computed(() => activeMap.value?.map_grid_offset_y  ?? 0)
  const mapOffsetLocked  = computed(() => activeMap.value?.map_offset_locked  ?? false)
  const mapFogRevealAll  = computed(() => activeMap.value?.fog_reveal_all     ?? false)
  const mapExplorationMode = computed(() => activeMap.value?.exploration_mode ?? false)
  const mapScale         = computed(() => activeMap.value?.map_scale          ?? null)
  const mapScaleUnit     = computed(() => activeMap.value?.map_scale_unit     ?? 'miles')
  const mapImageScale    = computed(() => activeMap.value?.map_image_scale    ?? 1)
  const mapGridCols      = computed(() => activeMap.value?.map_grid_cols      ?? null)
  const mapGridRows      = computed(() => activeMap.value?.map_grid_rows      ?? null)

  async function refresh() {
    const sessionId = _currentSessionId
    if (!sessionId) return
    const { data: mapRows, error } = await supabase
      .from('maps').select('*').eq('session_id', sessionId).order('created_at', { ascending: true })
    if (error || !mapRows || _currentSessionId !== sessionId) return
    maps.value = mapRows.map(row => _mergeLocalOverrides(row))
  }

  async function init(sessionId) {
    const generation = ++_initGeneration
    _currentSessionId = sessionId
    loading.value = true

    const { data: mapRows, error } = await supabase
      .from('maps').select('*').eq('session_id', sessionId).order('created_at', { ascending: true })

    if (generation !== _initGeneration) return !error

    loadError.value = error ?? null
    if (!error && mapRows) maps.value = mapRows

    loading.value = false

    localStorage.removeItem(`map_view_${sessionId}`)

    const activeImgPath = activeMap.value?.map_image_path
    if (activeImgPath) _refreshActiveUrl(activeImgPath)

    if (mapChannel) realtime.removeChannel(mapChannel)
    let subscribedRefreshed = false
    mapChannel = realtime
      .channel(`session:${sessionId}:maps`, { sessionId, onReconnect: () => refresh() })
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'maps', filter: `session_id=eq.${sessionId}` },
        ({ eventType, new: row, old }) => {
          if (eventType === 'INSERT') {
            if (maps.value.find(m => m.id === row.id)) return
            maps.value = [...maps.value, row].sort(
              (a, b) => new Date(a.created_at) - new Date(b.created_at),
            )
          } else if (eventType === 'UPDATE') {
            maps.value = maps.value.map(m => (m.id === row.id ? _mergeLocalOverrides(row) : m))
          } else if (eventType === 'DELETE') {
            maps.value = maps.value.filter(m => m.id !== old.id)
          }
        },
      )
      .subscribe(status => {
        if (status !== 'SUBSCRIBED' || subscribedRefreshed) return
        subscribedRefreshed = true
        void refresh()
      })

    return !error
  }

  function cleanup() {
    _initGeneration += 1
    if (mapChannel) { realtime.removeChannel(mapChannel); mapChannel = null }
    _cleanupUrl()
    maps.value = []
    _currentSessionId = null
    Object.keys(_localOverrides).forEach(k => delete _localOverrides[k])
    Object.keys(_overrideAt).forEach(k => delete _overrideAt[k])
  }

  async function createChildMap(parentHexCellId, name) {
    let data
    try {
      data = await apiClient.post('/maps', {
        session_id:    _currentSessionId,
        name,
        map_type:      'hex',
        parent_map_id: activeMap.value?.id ?? null,
        parent_hex_id: parentHexCellId,
      }, 'create_child_map')
    } catch (error) { console.error('createChildMap:', error instanceof ApiError ? error.message : error); return null }
    if (!maps.value.find(m => m.id === data.id)) {
      maps.value = [...maps.value, data].sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    }
    await setActiveMap(data.id)
    return data
  }

  async function createMap({ name = 'New Map', mapType = 'hex' } = {}) {
    let data
    try {
      data = await apiClient.post('/maps', { session_id: _currentSessionId, name, map_type: mapType }, 'create_map')
    } catch (error) { console.error('createMap:', error instanceof ApiError ? error.message : error); return null }
    if (!maps.value.find(m => m.id === data.id)) {
      maps.value = [...maps.value, data].sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    }
    return data
  }

  async function setActiveMap(mapId) {
    const sessionStore = useSessionStore()
    await sessionStore.setActiveMapId(mapId)
  }

  async function renameMap(mapId, name) {
    try {
      await apiClient.patch(`/maps/${mapId}`, { name }, 'rename_map')
    } catch (error) { console.error('renameMap:', error instanceof ApiError ? error.message : error); return false }
    maps.value = maps.value.map(m => (m.id === mapId ? { ...m, name } : m))
    return true
  }

  async function deleteMap(mapId) {
    const sessionStore = useSessionStore()
    if (mapId === sessionStore.activeMapId) return false
    try {
      await apiClient.delete(`/maps/${mapId}`, 'delete_map')
    } catch (error) { console.error('deleteMap:', error instanceof ApiError ? error.message : error); return false }
    maps.value = maps.value.filter(m => m.id !== mapId)
    return true
  }

  function applyLocalPatch(patch) {
    const map = activeMap.value
    if (!map) return
    const dbPatch = {}
    if (patch.mapImageRotation !== undefined) dbPatch.map_image_rotation = patch.mapImageRotation
    if (patch.mapGridRotation  !== undefined) dbPatch.map_grid_rotation  = patch.mapGridRotation
    if (patch.mapHexWidth      !== undefined) dbPatch.map_hex_width      = patch.mapHexWidth
    if (patch.mapHexHeight     !== undefined) dbPatch.map_hex_height     = patch.mapHexHeight
    if (patch.mapImageScale    !== undefined) dbPatch.map_image_scale    = patch.mapImageScale
    if (patch.mapGridCols      !== undefined) dbPatch.map_grid_cols      = patch.mapGridCols
    if (patch.mapGridRows      !== undefined) dbPatch.map_grid_rows      = patch.mapGridRows
    _localOverrides[map.id] = { ...(_localOverrides[map.id] ?? {}), ...dbPatch }
    _overrideAt[map.id] = Date.now()
    maps.value = maps.value.map(m => (m.id === map.id ? { ...m, ...dbPatch } : m))
  }

  async function updateActiveMap(patch) {
    const map = activeMap.value
    if (!map) return false

    const dbPatch = {}
    if (patch.mapType          !== undefined) dbPatch.map_type           = patch.mapType
    if (patch.mapImagePath     !== undefined) dbPatch.map_image_path     = patch.mapImagePath
    if (patch.mapHexWidth      !== undefined) dbPatch.map_hex_width      = patch.mapHexWidth
    if (patch.mapHexHeight     !== undefined) dbPatch.map_hex_height     = patch.mapHexHeight
    if (patch.mapImageRotation !== undefined) dbPatch.map_image_rotation = patch.mapImageRotation
    if (patch.mapGridRotation  !== undefined) dbPatch.map_grid_rotation  = patch.mapGridRotation
    if (patch.mapImageOffsetX  !== undefined) dbPatch.map_image_offset_x = patch.mapImageOffsetX
    if (patch.mapImageOffsetY  !== undefined) dbPatch.map_image_offset_y = patch.mapImageOffsetY
    if (patch.mapGridOffsetX   !== undefined) dbPatch.map_grid_offset_x  = patch.mapGridOffsetX
    if (patch.mapGridOffsetY   !== undefined) dbPatch.map_grid_offset_y  = patch.mapGridOffsetY
    if (patch.mapOffsetLocked  !== undefined) dbPatch.map_offset_locked  = patch.mapOffsetLocked
    if (patch.mapScale         !== undefined) dbPatch.map_scale          = patch.mapScale
    if (patch.mapScaleUnit     !== undefined) dbPatch.map_scale_unit     = patch.mapScaleUnit
    if (patch.mapImageScale    !== undefined) dbPatch.map_image_scale    = patch.mapImageScale
    if (patch.mapGridCols      !== undefined) dbPatch.map_grid_cols      = patch.mapGridCols
    if (patch.mapGridRows      !== undefined) dbPatch.map_grid_rows      = patch.mapGridRows

    try {
      await apiClient.patch(`/maps/${map.id}`, dbPatch, 'update_map_settings')
    } catch (error) { console.error('updateActiveMap:', error instanceof ApiError ? error.message : error); return false }

    maps.value = maps.value.map(m => {
      if (m.id !== map.id) return m
      if (m !== map) return m
      const overrides = _localOverrides[map.id] ?? {}
      return { ...m, ...dbPatch, ...overrides }
    })
    return true
  }

  async function setFogRevealAll(value) {
    const map = activeMap.value
    if (!map) return
    maps.value = maps.value.map(m => m.id === map.id ? { ...m, fog_reveal_all: value } : m)
    try {
      await apiClient.patch(`/maps/${map.id}`, { fog_reveal_all: value }, value ? 'reveal_all_fog_map' : 'reset_fog_map')
    } catch (error) {
      console.error('setFogRevealAll:', error instanceof ApiError ? error.message : error)
      maps.value = maps.value.map(m => m.id === map.id ? { ...m, fog_reveal_all: !value } : m)
    }
  }

  async function setExplorationMode(value) {
    const map = activeMap.value
    if (!map) return
    maps.value = maps.value.map(m => m.id === map.id ? { ...m, exploration_mode: value } : m)
    try {
      await apiClient.patch(`/maps/${map.id}`, { exploration_mode: value }, value ? 'enable_exploration_mode' : 'disable_exploration_mode')
    } catch (error) {
      console.error('setExplorationMode:', error instanceof ApiError ? error.message : error)
      maps.value = maps.value.map(m => m.id === map.id ? { ...m, exploration_mode: !value } : m)
    }
  }

  async function uploadMapImage(file) {
    const sessionStore = useSessionStore()
    return uploadSessionImage(file, { sessionId: sessionStore.sessionId, maxBytes: MAX_IMAGE_BYTES })
  }

  return {
    maps,
    loading,
    loadError,
    activeMap,
    parentMap,
    childMapsByHexId,
    ancestorChain,
    activeMapImageUrl,
    mapType,
    mapHexWidth,
    mapHexHeight,
    mapImageRotation,
    mapGridRotation,
    mapImageOffsetX,
    mapImageOffsetY,
    mapGridOffsetX,
    mapGridOffsetY,
    mapOffsetLocked,
    mapFogRevealAll,
    mapExplorationMode,
    mapScale,
    mapScaleUnit,
    mapImageScale,
    mapGridCols,
    mapGridRows,
    init,
    refresh,
    cleanup,
    createMap,
    createChildMap,
    applyLocalPatch,
    setActiveMap,
    renameMap,
    deleteMap,
    updateActiveMap,
    setFogRevealAll,
    setExplorationMode,
    uploadMapImage,
  }
})
