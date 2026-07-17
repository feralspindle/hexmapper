import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '@/lib/supabase'
import { createSessionChannel } from '@/lib/sessionChannel.js'
import { apiClient, ApiError } from '@/lib/apiClient.js'
import { signReferencePhotoUrl, signReferencePhotoUrls } from '@/lib/referencePhotoUrl.js'
import { useAuthStore } from '@/stores/authStore.js'

const BUCKET = 'reference-photos'
const MAX_FILE_SIZE = 10 * 1024 * 1024

export const usePhotoStore = defineStore('photo', () => {
  const photos           = ref([])
  const broadcastHistory = ref([])
  const currentBroadcast = ref(null)
  const loading          = ref(false)
  const uploading        = ref(false)
  const session = createSessionChannel()

  async function refresh(generation = session.generation) {
    const sessionId = session.key
    if (!sessionId) return
    await Promise.all([_loadPhotos(sessionId, generation), _loadBroadcastHistory(sessionId, generation)])
  }

  async function init(sessionId) {
    if (session.key === sessionId) return
    cleanup()
    const generation = session.begin(sessionId)

    loading.value = true
    await Promise.all([_loadPhotos(sessionId, generation), _loadBroadcastHistory(sessionId, generation)])
    loading.value = false

    if (!session.isCurrent(generation)) return

    session.open(`photo_broadcasts:${sessionId}`, { sessionId, refresh }, ch => ch
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'photo_broadcasts',
          filter: `session_id=eq.${sessionId}`,
        },
        async ({ new: row }) => {
          const url = await signReferencePhotoUrl(_broadcastPath(row.photo_url))
          const resolved = { ...row, photo_url: url }
          currentBroadcast.value = resolved
          _addToBroadcastHistory(resolved)
        },
      ))
  }

  async function _loadBroadcastHistory(sessionId, generation = session.generation) {
    const { data, error } = await supabase
      .from('photo_broadcasts')
      .select('id, photo_url, photo_name, created_at')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false })
    if (error) { console.error('photoStore._loadBroadcastHistory:', error.message); return }
    const seen = new Set()
    const rows = (data ?? []).filter(row => {
      if (seen.has(row.photo_url)) return false
      seen.add(row.photo_url)
      return true
    })
    const urlFor = await signReferencePhotoUrls(rows.map(row => _broadcastPath(row.photo_url)))
    if (!session.isCurrent(generation)) return
    broadcastHistory.value = rows.map(row => _resolveBroadcast(row, urlFor))
  }

  function _addToBroadcastHistory(row) {
    broadcastHistory.value = [
      { id: row.id, photo_url: row.photo_url, photo_name: row.photo_name, created_at: row.created_at },
      ...broadcastHistory.value.filter(p => p.photo_url !== row.photo_url),
    ]
  }

  async function _loadPhotos(sessionId, generation = session.generation) {
    const { data, error } = await supabase
      .from('reference_photos')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false })
    if (error) { console.error('photoStore._loadPhotos:', error.message); return }
    const rows = data ?? []
    const urlFor = await signReferencePhotoUrls(rows.map(row => row.storage_path))
    if (!session.isCurrent(generation)) return
    photos.value = rows.map(row => ({ ...row, url: urlFor(row.storage_path) }))
  }

  // photo_broadcasts.photo_url historically stored an absolute public URL; the
  // bucket is private now, so recover the storage path from legacy values and
  // sign it like everything else. New broadcasts persist the relative path.
  function _broadcastPath(stored = '') {
    if (!stored.startsWith('http')) return stored
    const marker = '/reference-photos/'
    const index = stored.indexOf(marker)
    return index === -1 ? null : decodeURIComponent(stored.slice(index + marker.length))
  }

  function _resolveBroadcast(row, urlFor) {
    return { ...row, photo_url: urlFor(_broadcastPath(row.photo_url)) }
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

    const storagePath = `${session.key}/${crypto.randomUUID()}.${ext}`

    uploading.value = true
    try {
      const { error: uploadErr } = await supabase.storage
        .from(BUCKET)
        .upload(storagePath, file, { upsert: false, contentType: mimeType })
      if (uploadErr) throw uploadErr

      const data = await apiClient.post('/reference-photos', {
        session_id:   session.key,
        name:         (name ?? '').trim() || file.name.replace(/\.[^.]+$/, ''),
        storage_path: storagePath,
      })

      const newPhoto = { ...data, url: await signReferencePhotoUrl(data.storage_path) }
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
        session_id: session.key,
        photo_id:   photo.id,
        photo_url:  photo.storage_path,
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
    session.close()
    photos.value           = []
    broadcastHistory.value = []
    currentBroadcast.value = null
  }

  return {
    photos, broadcastHistory, currentBroadcast, loading, uploading,
    init, refresh, uploadPhoto, deletePhoto, broadcastPhoto, dismissBroadcast, cleanup,
  }
})
