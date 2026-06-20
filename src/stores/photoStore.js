import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '@/lib/supabase'
import { realtime } from '@/lib/realtime.js'
import { apiClient, ApiError } from '@/lib/apiClient.js'
import { useAuthStore } from '@/stores/authStore.js'

const BUCKET = 'reference-photos'
const MAX_FILE_SIZE = 10 * 1024 * 1024

export const usePhotoStore = defineStore('photo', () => {
  const photos           = ref([])
  const broadcastHistory = ref([])
  const currentBroadcast = ref(null)
  const loading          = ref(false)
  const uploading        = ref(false)
  let channel            = null
  let currentSessionId   = null

  async function init(sessionId) {
    if (currentSessionId === sessionId) return
    cleanup()
    currentSessionId = sessionId

    await Promise.all([_loadPhotos(sessionId), _loadBroadcastHistory(sessionId)])

    channel = realtime
      .channel(`photo_broadcasts:${sessionId}`, { sessionId, onReconnect: () => { cleanup(); return init(sessionId) } })
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'photo_broadcasts',
          filter: `session_id=eq.${sessionId}`,
        },
        ({ new: row }) => {
          currentBroadcast.value = row
          _addToBroadcastHistory(row)
        },
      )
      .subscribe()
  }

  async function _loadBroadcastHistory(sessionId) {
    const { data, error } = await supabase
      .from('photo_broadcasts')
      .select('id, photo_url, photo_name, created_at')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false })
    if (error) { console.error('photoStore._loadBroadcastHistory:', error.message); return }
    const seen = new Set()
    broadcastHistory.value = (data ?? []).filter(row => {
      if (seen.has(row.photo_url)) return false
      seen.add(row.photo_url)
      return true
    })
  }

  function _addToBroadcastHistory(row) {
    broadcastHistory.value = [
      { id: row.id, photo_url: row.photo_url, photo_name: row.photo_name, created_at: row.created_at },
      ...broadcastHistory.value.filter(p => p.photo_url !== row.photo_url),
    ]
  }

  async function _loadPhotos(sessionId) {
    loading.value = true
    const { data, error } = await supabase
      .from('reference_photos')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false })
    loading.value = false
    if (error) { console.error('photoStore._loadPhotos:', error.message); return }
    photos.value = (data ?? []).map(_withUrl)
  }

  function _withUrl(row) {
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(row.storage_path)
    return { ...row, url: data.publicUrl }
  }

  async function uploadPhoto(file, name) {
    const authStore = useAuthStore()
    if (!authStore.user?.id) return null

    if (file.size > MAX_FILE_SIZE) throw new Error('File too large (max 10 MB)')

    const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
    const EXT_MAP = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' }
    const mimeType = file.type
    if (!ALLOWED_TYPES.includes(mimeType)) throw new Error('Unsupported file type')
    const ext = EXT_MAP[mimeType] ?? 'jpg'

    const storagePath = `${currentSessionId}/${crypto.randomUUID()}.${ext}`

    uploading.value = true
    try {
      const { error: uploadErr } = await supabase.storage
        .from(BUCKET)
        .upload(storagePath, file, { upsert: false, contentType: mimeType })
      if (uploadErr) throw uploadErr

      const data = await apiClient.post('/reference-photos', {
        session_id:   currentSessionId,
        name:         (name ?? '').trim() || file.name.replace(/\.[^.]+$/, ''),
        storage_path: storagePath,
      })

      const newPhoto = _withUrl(data)
      photos.value = [newPhoto, ...photos.value]
      return newPhoto
    } finally {
      uploading.value = false
    }
  }

  async function deletePhoto(photo) {
    await supabase.storage.from(BUCKET).remove([photo.storage_path])
    try {
      await apiClient.delete(`/reference-photos/${photo.id}`)
    } catch (error) {
      console.error('photoStore.deletePhoto:', error instanceof ApiError ? error.message : error)
      return
    }
    photos.value = photos.value.filter(p => p.id !== photo.id)
  }

  async function broadcastPhoto(photo) {
    const authStore = useAuthStore()
    if (!authStore.user?.id) return
    try {
      await apiClient.post('/photo-broadcasts', {
        session_id: currentSessionId,
        photo_id:   photo.id,
        photo_url:  photo.url,
        photo_name: photo.name,
      })
    } catch (error) {
      console.error('photoStore.broadcastPhoto:', error instanceof ApiError ? error.message : error)
    }
  }

  function dismissBroadcast() {
    currentBroadcast.value = null
  }

  function cleanup() {
    if (channel) { realtime.removeChannel(channel); channel = null }
    photos.value           = []
    broadcastHistory.value = []
    currentBroadcast.value = null
    currentSessionId       = null
  }

  return {
    photos, broadcastHistory, currentBroadcast, loading, uploading,
    init, uploadPhoto, deletePhoto, broadcastPhoto, dismissBroadcast, cleanup,
  }
})
