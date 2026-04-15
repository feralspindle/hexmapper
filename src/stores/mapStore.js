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

  const gmMapId = ref(null)
  const gmMode  = ref('edit')

  const newMapModalOpen = ref(false)

  const _draftsByMapId = ref({})
  const gmDraft        = computed(() => _draftsByMapId.value[gmMapId.value] ?? {})
  const hasDraft       = computed(() => Object.keys(gmDraft.value).length > 0)

  let mapChannel = null
  let _currentSessionId = null

  const activeMap = computed(() => {
    const sessionStore = useSessionStore()
    return maps.value.find(m => m.id === sessionStore.activeMapId) ?? null
  })

  const gmMap = computed(() =>
    maps.value.find(m => m.id === gmMapId.value) ?? activeMap.value
  )

  const activeMapImageUrl = ref(null)
  const gmMapImageUrl     = ref(null)
  const _urlTimers = {}

  async function _refreshUrl(path, targetRef, key) {
    if (_urlTimers[key]) { clearTimeout(_urlTimers[key]); delete _urlTimers[key] }
    if (!path) { targetRef.value = null; return }
    const { data, error } = await supabase.storage
      .from('session-maps')
      .createSignedUrl(path, URL_EXPIRY_SECONDS)
    if (error) { console.error('refreshSignedUrl:', error.message); return }
    targetRef.value = data.signedUrl
    _urlTimers[key] = setTimeout(
      () => _refreshUrl(path, targetRef, key),
      URL_EXPIRY_SECONDS * 0.9 * 1000,
    )
  }

  watch(() => activeMap.value?.map_image_path, p => _refreshUrl(p, activeMapImageUrl, 'active'), { immediate: false })
  watch(() => gmMap.value?.map_image_path,     p => _refreshUrl(p, gmMapImageUrl, 'gm'),         { immediate: false })

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

  const gmMapType          = computed(() => gmMap.value?.map_type           ?? 'hex')
  const gmMapHexWidth      = computed(() => gmMap.value?.map_hex_width      ?? 96)
  const gmMapHexHeight     = computed(() => gmMap.value?.map_hex_height     ?? null)
  const gmMapImageRotation = computed(() => gmMap.value?.map_image_rotation ?? 0)
  const gmMapGridRotation  = computed(() => gmMap.value?.map_grid_rotation  ?? 0)
  const gmMapImageOffsetX  = computed(() => gmMap.value?.map_image_offset_x ?? 0)
  const gmMapImageOffsetY  = computed(() => gmMap.value?.map_image_offset_y ?? 0)
  const gmMapGridOffsetX   = computed(() => gmMap.value?.map_grid_offset_x  ?? 0)
  const gmMapGridOffsetY   = computed(() => gmMap.value?.map_grid_offset_y  ?? 0)
  const gmMapOffsetLocked  = computed(() => gmMap.value?.map_offset_locked  ?? false)

  async function init(sessionId) {
    _currentSessionId = sessionId
    loading.value = true

    const [{ data: mapRows, error }, { data: draftRows }] = await Promise.all([
      supabase.from('maps').select('*').eq('session_id', sessionId).order('created_at', { ascending: true }),
      supabase.from('map_drafts').select('map_id, draft_data').eq('session_id', sessionId),
    ])

    if (!error && mapRows) {
      const byId = {}
      draftRows?.forEach(d => { byId[d.map_id] = d.draft_data })
      _draftsByMapId.value = byId

      maps.value = mapRows.map(m => byId[m.id] ? { ...m, ...byId[m.id] } : m)
    }

    loading.value = false

    const sessionStore = useSessionStore()
    if (!gmMapId.value) gmMapId.value = sessionStore.activeMapId

    const activeImgPath = activeMap.value?.map_image_path
    const gmImgPath     = gmMap.value?.map_image_path
    if (activeImgPath) _refreshUrl(activeImgPath, activeMapImageUrl, 'active')
    if (gmImgPath && gmImgPath !== activeImgPath) _refreshUrl(gmImgPath, gmMapImageUrl, 'gm')

    if (mapChannel) supabase.removeChannel(mapChannel)
    mapChannel = supabase
      .channel(`session:${sessionId}:maps`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'maps', filter: `session_id=eq.${sessionId}` },
        ({ eventType, new: row, old }) => {
          if (eventType === 'INSERT') {
            maps.value = [...maps.value, row].sort(
              (a, b) => new Date(a.created_at) - new Date(b.created_at),
            )
          } else if (eventType === 'UPDATE') {
            maps.value = maps.value.map(m => {
              if (m.id !== row.id) return m
              const draft = _draftsByMapId.value[row.id] ?? {}
              return { ...row, ...draft }
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
    gmMapImageUrl.value     = null
    maps.value = []
    gmMapId.value = null
    gmMode.value  = 'edit'
    _draftsByMapId.value = {}
    _currentSessionId = null
  }

  async function createMap({ name = 'New Map', mapType = 'hex' } = {}) {
    const { data, error } = await supabase
      .from('maps')
      .insert({ session_id: _currentSessionId, name, map_type: mapType })
      .select()
      .single()
    if (error) { console.error('createMap:', error.message); return null }
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
    if (error) { console.error('deleteMap:', error.message); return }
    const { [mapId]: _, ...rest } = _draftsByMapId.value
    _draftsByMapId.value = rest
  }

  async function setActiveMap(mapId) {
    const sessionStore = useSessionStore()
    gmMapId.value = mapId
    await sessionStore.setActiveMapId(mapId)
  }

  function selectGmMap(mapId) {
    gmMapId.value = mapId
    gmMode.value  = 'edit'
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
      })
      .select()
      .single()

    if (error) { console.error('cloneMap:', error.message); return null }
    selectGmMap(data.id)
    return data
  }

  async function updateActiveMap(patch) {
    const map = gmMap.value
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

    const sessionStore = useSessionStore()
    const editingLiveMap = map.id === sessionStore.activeMapId

    if (editingLiveMap) {
      const merged = { ...(_draftsByMapId.value[map.id] ?? {}), ...dbPatch }
      _draftsByMapId.value = { ..._draftsByMapId.value, [map.id]: merged }

      supabase.from('map_drafts').upsert(
        { map_id: map.id, session_id: _currentSessionId, draft_data: merged, updated_at: new Date().toISOString() },
        { onConflict: 'map_id' },
      ).then(({ error }) => { if (error) console.error('saveDraft:', error.message) })

      maps.value = maps.value.map(m => (m.id === map.id ? { ...m, ...dbPatch } : m))
      return true
    }

    const { error } = await supabase.from('maps').update(dbPatch).eq('id', map.id)
    if (error) { console.error('updateActiveMap:', error.message); return false }

    maps.value = maps.value.map(m => (m.id === map.id ? { ...m, ...dbPatch } : m))
    return true
  }

  async function pushLiveDraft() {
    const map = gmMap.value
    if (!map || !hasDraft.value) return false

    const draft = gmDraft.value
    const { error } = await supabase.from('maps').update(draft).eq('id', map.id)
    if (error) { console.error('pushLiveDraft:', error.message); return false }

    await supabase.from('map_drafts').delete().eq('map_id', map.id)

    const { [map.id]: _, ...rest } = _draftsByMapId.value
    _draftsByMapId.value = rest
    return true
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
    gmMapId,
    gmMode,
    activeMap,
    gmMap,
    activeMapImageUrl,
    gmMapImageUrl,
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
    gmMapType,
    gmMapHexWidth,
    gmMapHexHeight,
    gmMapImageRotation,
    gmMapGridRotation,
    gmMapImageOffsetX,
    gmMapImageOffsetY,
    gmMapGridOffsetX,
    gmMapGridOffsetY,
    gmMapOffsetLocked,
    hasDraft,
    init,
    cleanup,
    createMap,
    renameMap,
    deleteMap,
    setActiveMap,
    selectGmMap,
    cloneMap,
    updateActiveMap,
    pushLiveDraft,
    uploadMapImage,
  }
})
