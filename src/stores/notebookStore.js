import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore.js'
import { useSessionStore } from '@/stores/sessionStore.js'
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
    const authStore    = useAuthStore()
    const sessionStore = useSessionStore()
    const { data } = await supabase
      .from('party_quests')
      .insert({
        session_id:    _sessionId,
        title:         '',
        added_by_name: authStore.displayName ?? 'Adventurer',
        is_gm_added:   sessionStore.isGM,
        display_order: quests.value.length,
        source_client: CLIENT_ID,
      })
      .select()
      .single()
    if (data) quests.value.push(data)
    return data
  }

  async function updateQuest(id, patch) {
    const idx = quests.value.findIndex(q => q.id === id)
    if (idx !== -1) Object.assign(quests.value[idx], patch)
    await supabase
      .from('party_quests')
      .update({ ...patch, source_client: CLIENT_ID, updated_at: new Date().toISOString() })
      .eq('id', id)
  }

  async function deleteQuest(id) {
    quests.value = quests.value.filter(q => q.id !== id)
    await supabase.from('party_quests').delete().eq('id', id)
  }

  async function addNote() {
    const authStore    = useAuthStore()
    const sessionStore = useSessionStore()
    const { data } = await supabase
      .from('party_session_notes')
      .insert({
        session_id:     _sessionId,
        title:          '',
        content:        '',
        author_name:    authStore.displayName ?? 'Adventurer',
        author_user_id: authStore.user?.id ?? null,
        is_gm_author:   sessionStore.isGM,
        source_client:  CLIENT_ID,
      })
      .select()
      .single()
    if (data) notes.value.unshift(data)
    return data
  }

  async function updateNote(id, patch) {
    const idx = notes.value.findIndex(n => n.id === id)
    if (idx !== -1) Object.assign(notes.value[idx], patch)
    await supabase
      .from('party_session_notes')
      .update({ ...patch, source_client: CLIENT_ID, updated_at: new Date().toISOString() })
      .eq('id', id)
  }

  async function deleteNote(id) {
    notes.value = notes.value.filter(n => n.id !== id)
    await supabase.from('party_session_notes').delete().eq('id', id)
  }

  return {
    quests, notes,
    init, cleanup,
    addQuest, updateQuest, deleteQuest,
    addNote,  updateNote,  deleteNote,
  }
})
