import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '@/lib/supabase'
import { apiClient, ApiError } from '@/lib/apiClient.js'
import { useQuestToast } from '@/composables/useQuestToast.js'

const CLIENT_ID = crypto.randomUUID()

export const useNotebookStore = defineStore('notebook', () => {
  const quests = ref([])
  const notes  = ref([])

  let questsChannel = null
  let notesChannel  = null
  let _sessionId    = null

  async function init(sessionId) {
    if (_sessionId === sessionId) return
    cleanup()
    _sessionId = sessionId
    await Promise.all([_loadQuests(sessionId), _loadNotes(sessionId)])
    _subscribeQuests(sessionId)
    _subscribeNotes(sessionId)
  }

  function cleanup() {
    if (questsChannel) { supabase.removeChannel(questsChannel); questsChannel = null }
    if (notesChannel)  { supabase.removeChannel(notesChannel);  notesChannel  = null }
    _sessionId = null
    quests.value = []
    notes.value  = []
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
        if (e.new?.source_client === CLIENT_ID || e.old?.source_client === CLIENT_ID) return
        if (e.eventType === 'INSERT') {
          if (!quests.value.find(q => q.id === e.new.id)) quests.value.push(e.new)
        } else if (e.eventType === 'UPDATE') {
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
        if (e.new?.source_client === CLIENT_ID || e.old?.source_client === CLIENT_ID) return
        if (e.eventType === 'INSERT') {
          if (!notes.value.find(n => n.id === e.new.id)) notes.value.unshift(e.new)
        } else if (e.eventType === 'UPDATE') {
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
    quests, notes,
    init, cleanup,
    addQuest, updateQuest, deleteQuest,
    addNote,  updateNote,  deleteNote,
  }
})
