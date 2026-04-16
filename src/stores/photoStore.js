import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore.js'

const BUCKET = 'reference-photos'
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB

export const usePhotoStore = defineStore('photo', () => {
  const photos           = ref([])
  const broadcastHistory = ref([]) // deduplicated, newest-first; shown in player gallery
  const currentBroadcast = ref(null) // { id, photo_url, photo_name }
  const loading          = ref(false)
  const uploading        = ref(false)
  let channel            = null
  let currentSessionId   = null

  async function init(sessionId) {
    if (currentSessionId === sessionId) return
    cleanup()
    currentSessionId = sessionId

    await Promise.all([_loadPhotos(sessionId), _loadBroadcastHistory(sessionId)])

    channel = supabase
      .channel(`photo_broadcasts:${sessionId}`)
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
    // Deduplicate by photo_url, keeping the most recent broadcast for each
    const seen = new Set()
    broadcastHistory.value = (data ?? []).filter(row => {
      if (seen.has(row.photo_url)) return false
      seen.add(row.photo_url)
      return true
    })
  }

  function _addToBroadcastHistory(row) {
    // Remove any existing entry for this url, then prepend the new one
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
    const ext = file.name.split('.').pop().toLowerCase()
    if (!['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext)) throw new Error('Unsupported file type')

    const storagePath = `${currentSessionId}/${crypto.randomUUID()}.${ext}`

    uploading.value = true
    try {
      const { error: uploadErr } = await supabase.storage
        .from(BUCKET)
        .upload(storagePath, file, { upsert: false })
      if (uploadErr) throw uploadErr

      const { data, error } = await supabase
        .from('reference_photos')
        .insert({
          session_id:   currentSessionId,
          user_id:      authStore.user.id,
          name:         (name ?? '').trim() || file.name.replace(/\.[^.]+$/, ''),
          storage_path: storagePath,
        })
        .select()
        .single()
      if (error) throw error

      const newPhoto = _withUrl(data)
      photos.value = [newPhoto, ...photos.value]
      return newPhoto
    } finally {
      uploading.value = false
    }
  }

  async function deletePhoto(photo) {
    await supabase.storage.from(BUCKET).remove([photo.storage_path])
    const { error } = await supabase.from('reference_photos').delete().eq('id', photo.id)
    if (error) { console.error('photoStore.deletePhoto:', error.message); return }
    photos.value = photos.value.filter(p => p.id !== photo.id)
  }

  async function broadcastPhoto(photo) {
    const authStore = useAuthStore()
    if (!authStore.user?.id) return
    const { error } = await supabase.from('photo_broadcasts').insert({
      session_id: currentSessionId,
      user_id:    authStore.user.id,
      photo_id:   photo.id,
      photo_url:  photo.url,
      photo_name: photo.name,
    })
    if (error) console.error('photoStore.broadcastPhoto:', error.message)
  }

  function dismissBroadcast() {
    currentBroadcast.value = null
  }

  function cleanup() {
    if (channel) { supabase.removeChannel(channel); channel = null }
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
