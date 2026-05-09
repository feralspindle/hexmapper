import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { supabase } from '@/lib/supabase'
import { useSessionStore } from '@/stores/sessionStore.js'

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_IMAGE_BYTES = 10 * 1024 * 1024
const URL_EXPIRY_SECONDS = 86400

export const useMapStore = defineStore('map', () => {
  const maps   = ref([])
  const loading = ref(false)

  const newMapModalOpen = ref(false)

  let mapChannel = null
  let _currentSessionId = null
  const _localOverrides = {}

  const activeMap = computed(() => {
    const sessionStore = useSessionStore()
    return maps.value.find(m => m.id === sessionStore.activeMapId) ?? null
  })

  const activeMapImageUrl = ref(null)
  const _urlTimers = {}

  async function _refreshUrl(path, targetRef, key) {
    if (_urlTimers[key]) { clearTimeout(_urlTimers[key]); delete _urlTimers[key] }
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
    _urlTimers[key] = setTimeout(
      () => _refreshUrl(path, targetRef, key),
      URL_EXPIRY_SECONDS * 0.9 * 1000,
    )
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

  async function init(sessionId) {
    _currentSessionId = sessionId
    loading.value = true

    const { data: mapRows, error } = await supabase
      .from('maps').select('*').eq('session_id', sessionId).order('created_at', { ascending: true })

    if (!error && mapRows) maps.value = mapRows

    loading.value = false

    const activeImgPath = activeMap.value?.map_image_path
    if (activeImgPath) _refreshUrl(activeImgPath, activeMapImageUrl, 'active')

    if (mapChannel) supabase.removeChannel(mapChannel)
    mapChannel = supabase
      .channel(`session:${sessionId}:maps`)
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
      .subscribe()
  }

  function cleanup() {
    if (mapChannel) { supabase.removeChannel(mapChannel); mapChannel = null }
    Object.values(_urlTimers).forEach(clearTimeout)
    Object.keys(_urlTimers).forEach(k => delete _urlTimers[k])
    activeMapImageUrl.value = null
    maps.value = []
    _currentSessionId = null
    Object.keys(_localOverrides).forEach(k => delete _localOverrides[k])
  }

  async function createMap({ name = 'New Map', mapType = 'hex' } = {}) {
    const { data, error } = await supabase
      .from('maps')
      .insert({ session_id: _currentSessionId, name, map_type: mapType })
      .select()
      .single()
    if (error) { console.error('createMap:', error.message); return null }
    if (!maps.value.find(m => m.id === data.id)) {
      maps.value = [...maps.value, data].sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    }
    return data
  }

  async function renameMap(mapId, name) {
    const { error } = await supabase.from('maps').update({ name }).eq('id', mapId)
    if (error) { console.error('renameMap:', error.message) }
    else maps.value = maps.value.map(m => (m.id === mapId ? { ...m, name } : m))
  }

  async function deleteMap(mapId) {
    if (maps.value.length <= 1) return
    const { error } = await supabase.from('maps').delete().eq('id', mapId)
    if (error) { console.error('deleteMap:', error.message) }
  }

  async function setActiveMap(mapId) {
    const sessionStore = useSessionStore()
    await sessionStore.setActiveMapId(mapId)
  }

  async function cloneMap(sourceMapId) {
    const source = maps.value.find(m => m.id === sourceMapId)
    if (!source) return null

    const { data, error } = await supabase
      .from('maps')
      .insert({
        session_id:         _currentSessionId,
        name:               `${source.name} (copy)`,
        map_type:           source.map_type,
        map_image_path:     source.map_image_path,
        map_hex_width:      source.map_hex_width,
        map_hex_height:     source.map_hex_height,
        map_image_rotation: source.map_image_rotation,
        map_grid_rotation:  source.map_grid_rotation,
        map_image_offset_x: source.map_image_offset_x,
        map_image_offset_y: source.map_image_offset_y,
        map_grid_offset_x:  source.map_grid_offset_x,
        map_grid_offset_y:  source.map_grid_offset_y,
        map_offset_locked:  false,
        map_image_scale:    source.map_image_scale ?? 1,
      })
      .select()
      .single()

    if (error) { console.error('cloneMap:', error.message); return null }
    await setActiveMap(data.id)
    return data
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

    const { error } = await supabase.from('maps').update(dbPatch).eq('id', map.id)
    if (error) { console.error('updateActiveMap:', error.message); return false }

    const overrides = _localOverrides[map.id]
    if (overrides) {
      for (const [field, val] of Object.entries(dbPatch)) {
        if (overrides[field] === val) delete overrides[field]
      }
      if (Object.keys(overrides).length === 0) delete _localOverrides[map.id]
    }

    maps.value = maps.value.map(m => {
      if (m.id !== map.id) return m
      const remaining = _localOverrides[map.id] ?? {}
      return { ...m, ...dbPatch, ...remaining }
    })
    return true
  }

  async function setFogRevealAll(value) {
    const map = activeMap.value
    if (!map) return
    maps.value = maps.value.map(m => m.id === map.id ? { ...m, fog_reveal_all: value } : m)
    const { error } = await supabase.from('maps').update({ fog_reveal_all: value }).eq('id', map.id)
    if (error) {
      console.error('setFogRevealAll:', error.message)
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
    newMapModalOpen,
    activeMap,
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
    cleanup,
    createMap,
    applyLocalPatch,
    renameMap,
    deleteMap,
    setActiveMap,
    cloneMap,
    updateActiveMap,
    setFogRevealAll,
    uploadMapImage,
  }
})
