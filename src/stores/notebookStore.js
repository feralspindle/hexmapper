import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '@/lib/supabase'
import { apiClient, ApiError } from '@/lib/apiClient.js'
import { useQuestToast } from '@/composables/useQuestToast.js'
import { useAuthStore } from '@/stores/authStore.js'

const CLIENT_ID = crypto.randomUUID()

export const useNotebookStore = defineStore('notebook', () => {
  const quests    = ref([])
  const notes     = ref([])
  const editingBy = ref({}) // { 'quest:id': string[], 'note:id': string[] }

  let questsChannel = null
  let notesChannel  = null
  let editChannel   = null
  let _sessionId    = null

  const _editByUser  = {}   // { key: { userId: name } }  — internal dedup map
  const _staleTimers = {}   // clear stale indicators if 'done' is never received (tab close)

  function _applyEditing(kind, id, userId, name) {
    const key = `${kind}:${id}`
    if (!_editByUser[key]) _editByUser[key] = {}
    _editByUser[key][userId] = name
    clearTimeout(_staleTimers[`${key}:${userId}`])
    _staleTimers[`${key}:${userId}`] = setTimeout(() => _applyDone(kind, id, userId), 30_000)
    editingBy.value = { ...editingBy.value, [key]: Object.values(_editByUser[key]) }
  }

  function _applyDone(kind, id, userId) {
    const key = `${kind}:${id}`
    if (!_editByUser[key]) return
    delete _editByUser[key][userId]
    clearTimeout(_staleTimers[`${key}:${userId}`])
    const names = Object.values(_editByUser[key])
    if (names.length) {
      editingBy.value = { ...editingBy.value, [key]: names }
    } else {
      const next = { ...editingBy.value }
      delete next[key]
      editingBy.value = next
    }
  }

  function _subscribeEditing(sessionId) {
    editChannel = supabase
      .channel(`notebook:editing:${sessionId}`)
      .on('broadcast', { event: 'editing' }, ({ payload }) => {
        const authStore = useAuthStore()
        if (payload.user_id === (authStore.user?.id ?? CLIENT_ID)) return
        _applyEditing(payload.kind, payload.id, payload.user_id, payload.name)
      })
      .on('broadcast', { event: 'done' }, ({ payload }) => {
        const authStore = useAuthStore()
        if (payload.user_id === (authStore.user?.id ?? CLIENT_ID)) return
        _applyDone(payload.kind, payload.id, payload.user_id)
      })
      .subscribe()
  }

  function setEditing(kind, id) {
    if (!editChannel) return
    const authStore = useAuthStore()
    editChannel.send({ type: 'broadcast', event: 'editing', payload: {
      kind, id,
      user_id: authStore.user?.id ?? CLIENT_ID,
      name:    authStore.displayName ?? 'Adventurer',
    }})
  }

  function clearEditing(kind, id) {
    if (!editChannel) return
    const authStore = useAuthStore()
    editChannel.send({ type: 'broadcast', event: 'done', payload: {
      kind, id,
      user_id: authStore.user?.id ?? CLIENT_ID,
    }})
  }

  async function init(sessionId) {
    if (_sessionId === sessionId) return
    cleanup()
    _sessionId = sessionId
    await Promise.all([_loadQuests(sessionId), _loadNotes(sessionId)])
    _subscribeQuests(sessionId)
    _subscribeNotes(sessionId)
    _subscribeEditing(sessionId)
  }

  function cleanup() {
    if (questsChannel) { supabase.removeChannel(questsChannel); questsChannel = null }
    if (notesChannel)  { supabase.removeChannel(notesChannel);  notesChannel  = null }
    if (editChannel)   { supabase.removeChannel(editChannel);   editChannel   = null }
    _sessionId = null
    quests.value    = []
    notes.value     = []
    editingBy.value = {}
    for (const k of Object.keys(_editByUser))  delete _editByUser[k]
    for (const k of Object.keys(_staleTimers)) { clearTimeout(_staleTimers[k]); delete _staleTimers[k] }
  }

  async function _loadQuests(sessionId) {
    const { data } = await supabase
      .from('party_quests')
      .select('*')
      .eq('session_id', sessionId)
      .order('display_order', { ascending: true })
      .order('created_at',    { ascending: true })
    if (data) quests.value = data
  }

  async function _loadNotes(sessionId) {
    const { data } = await supabase
      .from('party_session_notes')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false })
    if (data) notes.value = data
  }

  function _subscribeQuests(sessionId) {
    questsChannel = supabase
      .channel(`notebook:quests:${sessionId}:${crypto.randomUUID()}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'party_quests',
        filter: `session_id=eq.${sessionId}`,
      }, e => {
        if (e.eventType === 'INSERT') {
          if (e.new?.source_client === CLIENT_ID) return
          if (!quests.value.find(q => q.id === e.new.id)) quests.value.push(e.new)
        } else if (e.eventType === 'UPDATE') {
          if (e.new?.source_client === CLIENT_ID) return
          const idx = quests.value.findIndex(q => q.id === e.new.id)
          const wasComplete = idx !== -1 ? !!quests.value[idx].completed : false
          if (idx !== -1) quests.value[idx] = e.new; else quests.value.push(e.new)
          if (!wasComplete && e.new.completed) {
            useQuestToast().push({ title: e.new.title, rewards: e.new.rewards ?? [] })
          }
        } else if (e.eventType === 'DELETE') {
          quests.value = quests.value.filter(q => q.id !== e.old.id)
        }
      })
      .subscribe()
  }

  function _subscribeNotes(sessionId) {
    notesChannel = supabase
      .channel(`notebook:notes:${sessionId}:${crypto.randomUUID()}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'party_session_notes',
        filter: `session_id=eq.${sessionId}`,
      }, e => {
        if (e.eventType === 'INSERT') {
          if (e.new?.source_client === CLIENT_ID) return
          if (!notes.value.find(n => n.id === e.new.id)) notes.value.unshift(e.new)
        } else if (e.eventType === 'UPDATE') {
          if (e.new?.source_client === CLIENT_ID) return
          const idx = notes.value.findIndex(n => n.id === e.new.id)
          if (idx !== -1) notes.value[idx] = e.new; else notes.value.unshift(e.new)
        } else if (e.eventType === 'DELETE') {
          notes.value = notes.value.filter(n => n.id !== e.old.id)
        }
      })
      .subscribe()
  }

  async function addQuest() {
    try {
      const data = await apiClient.post('/party-quests', {
        session_id:    _sessionId,
        display_order: quests.value.length,
        source_client: CLIENT_ID,
      })
      if (data) quests.value.push(data)
      return data
    } catch (error) {
      console.error('addQuest:', error instanceof ApiError ? error.message : error)
    }
  }

  async function updateQuest(id, patch) {
    const idx = quests.value.findIndex(q => q.id === id)
    if (idx !== -1) Object.assign(quests.value[idx], patch)
    try {
      await apiClient.patch(`/party-quests/${id}`, { ...patch, source_client: CLIENT_ID })
    } catch (error) {
      console.error('updateQuest:', error instanceof ApiError ? error.message : error)
    }
  }

  async function deleteQuest(id) {
    quests.value = quests.value.filter(q => q.id !== id)
    try {
      await apiClient.delete(`/party-quests/${id}`)
    } catch (error) {
      console.error('deleteQuest:', error instanceof ApiError ? error.message : error)
    }
  }

  async function addNote() {
    try {
      const data = await apiClient.post('/party-session-notes', {
        session_id:    _sessionId,
        source_client: CLIENT_ID,
      })
      if (data) notes.value.unshift(data)
      return data
    } catch (error) {
      console.error('addNote:', error instanceof ApiError ? error.message : error)
    }
  }

  async function updateNote(id, patch) {
    const idx = notes.value.findIndex(n => n.id === id)
    if (idx !== -1) Object.assign(notes.value[idx], patch)
    try {
      await apiClient.patch(`/party-session-notes/${id}`, { ...patch, source_client: CLIENT_ID })
    } catch (error) {
      console.error('updateNote:', error instanceof ApiError ? error.message : error)
    }
  }

  async function deleteNote(id) {
    notes.value = notes.value.filter(n => n.id !== id)
    try {
      await apiClient.delete(`/party-session-notes/${id}`)
    } catch (error) {
      console.error('deleteNote:', error instanceof ApiError ? error.message : error)
    }
  }

  return {
    quests, notes, editingBy,
    init, cleanup,
    addQuest, updateQuest, deleteQuest,
    addNote,  updateNote,  deleteNote,
    setEditing, clearEditing,
  }
})
