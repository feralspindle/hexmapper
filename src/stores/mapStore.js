import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { supabase } from '@/lib/supabase'
import { realtime } from '@/lib/realtime.js'
import { apiClient, ApiError } from '@/lib/apiClient.js'
import { useSessionStore } from '@/stores/sessionStore.js'

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_IMAGE_BYTES = 10 * 1024 * 1024
const URL_EXPIRY_SECONDS = 86400

export const useMapStore = defineStore('map', () => {
  const maps   = ref([])
  const loading = ref(false)
  const loadError = ref(null)

  let mapChannel = null
  let _currentSessionId = null
  let _initGeneration = 0
  const _localOverrides = {}

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

  const activeMapImageUrl = ref(null)
  const _urlTimers = {}
  const _urlRenewals = {}

  async function _refreshUrl(path, targetRef, key) {
    if (_urlTimers[key]) { clearTimeout(_urlTimers[key]); delete _urlTimers[key] }
    delete _urlRenewals[key]
    if (!path) { targetRef.value = null; return }
    const { data, error } = await supabase.storage
      .from('session-maps')
      .createSignedUrl(path, URL_EXPIRY_SECONDS)
    if (error) {
      if (error.message === 'Object not found') {
        targetRef.value = null
      } else {
        console.error('refreshSignedUrl:', error.message)
      }
      return
    }
    targetRef.value = data.signedUrl
    const renewalMs = URL_EXPIRY_SECONDS * 0.9 * 1000
    _urlRenewals[key] = { path, targetRef, at: Date.now() + renewalMs }
    _urlTimers[key] = setTimeout(() => _refreshUrl(path, targetRef, key), renewalMs)
  }

  // Background tabs throttle timers, so a long-hidden tab can outlive its signed
  // URLs; renew any overdue ones as soon as the tab is visible again.
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return
      for (const [key, renewal] of Object.entries(_urlRenewals)) {
        if (Date.now() >= renewal.at) _refreshUrl(renewal.path, renewal.targetRef, key)
      }
    })
  }

  watch(() => activeMap.value?.map_image_path, p => _refreshUrl(p, activeMapImageUrl, 'active'), { immediate: false })

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
  const mapScale         = computed(() => activeMap.value?.map_scale          ?? null)
  const mapScaleUnit     = computed(() => activeMap.value?.map_scale_unit     ?? 'miles')
  const mapImageScale    = computed(() => activeMap.value?.map_image_scale    ?? 1)

  async function refresh() {
    const sessionId = _currentSessionId
    if (!sessionId) return
    const { data: mapRows, error } = await supabase
      .from('maps').select('*').eq('session_id', sessionId).order('created_at', { ascending: true })
    if (error || !mapRows || _currentSessionId !== sessionId) return
    maps.value = mapRows.map(row => ({ ...row, ...(_localOverrides[row.id] ?? {}) }))
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
    if (activeImgPath) _refreshUrl(activeImgPath, activeMapImageUrl, 'active')

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
            maps.value = maps.value.map(m => {
              if (m.id !== row.id) return m
              const local = _localOverrides[row.id] ?? {}
              return { ...row, ...local }
            })
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
    Object.values(_urlTimers).forEach(clearTimeout)
    Object.keys(_urlTimers).forEach(k => delete _urlTimers[k])
    Object.keys(_urlRenewals).forEach(k => delete _urlRenewals[k])
    activeMapImageUrl.value = null
    maps.value = []
    _currentSessionId = null
    Object.keys(_localOverrides).forEach(k => delete _localOverrides[k])
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

  function applyLocalPatch(patch) {
    const map = activeMap.value
    if (!map) return
    const dbPatch = {}
    if (patch.mapImageRotation !== undefined) dbPatch.map_image_rotation = patch.mapImageRotation
    if (patch.mapGridRotation  !== undefined) dbPatch.map_grid_rotation  = patch.mapGridRotation
    if (patch.mapHexWidth      !== undefined) dbPatch.map_hex_width      = patch.mapHexWidth
    if (patch.mapHexHeight     !== undefined) dbPatch.map_hex_height     = patch.mapHexHeight
    if (patch.mapImageScale    !== undefined) dbPatch.map_image_scale    = patch.mapImageScale
    _localOverrides[map.id] = { ...(_localOverrides[map.id] ?? {}), ...dbPatch }
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

    try {
      await apiClient.patch(`/maps/${map.id}`, dbPatch, 'update_map_settings')
    } catch (error) { console.error('updateActiveMap:', error instanceof ApiError ? error.message : error); return false }

    const overrides = _localOverrides[map.id]
    if (overrides) {
      for (const [field, val] of Object.entries(dbPatch)) {
        if (overrides[field] === val) delete overrides[field]
      }
      if (Object.keys(overrides).length === 0) delete _localOverrides[map.id]
    }

    maps.value = maps.value.map(m => {
      if (m.id !== map.id) return m
      if (m !== map) return m
      const remaining = _localOverrides[map.id] ?? {}
      return { ...m, ...dbPatch, ...remaining }
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

  async function uploadMapImage(file) {
    const sessionStore = useSessionStore()
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) throw new Error('Only JPEG, PNG, and WebP images are allowed.')
    if (file.size > MAX_IMAGE_BYTES) throw new Error('Image must be under 10 MB.')
    await new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file)
      const img = new Image()
      img.onload  = () => { URL.revokeObjectURL(url); resolve() }
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('File could not be decoded as an image.')) }
      img.src = url
    })
    const extMap = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }
    const path = `${sessionStore.sessionId}/${crypto.randomUUID()}.${extMap[file.type]}`
    const { error } = await supabase.storage
      .from('session-maps')
      .upload(path, file, { contentType: file.type, upsert: false })
    if (error) throw new Error(error.message)
    return path
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
    mapScale,
    mapScaleUnit,
    mapImageScale,
    init,
    refresh,
    cleanup,
    createMap,
    createChildMap,
    applyLocalPatch,
    setActiveMap,
    updateActiveMap,
    setFogRevealAll,
    uploadMapImage,
  }
})
