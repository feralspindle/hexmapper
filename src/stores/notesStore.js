import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore.js'
import { useActivityStore } from '@/stores/activityStore.js'

export const useNotesStore = defineStore('notes', () => {
  const notes = ref([])
  const loading = ref(false)
  let channel = null
  let currentContextKey = null
  let _pendingInit = null

  async function initForHex(hexCellId, sessionId) {
    const key = hexCellId ? `hex:${hexCellId}` : null
    if (key && key === currentContextKey) {
      if (_pendingInit) await _pendingInit
      return
    }
    cleanup()
    if (!hexCellId) return

    currentContextKey = key
    _pendingInit = (async () => {
      try {
        loading.value = true
        const { data } = await supabase
          .from('hex_notes')
          .select('*')
          .eq('hex_cell_id', hexCellId)
          .order('created_at', { ascending: true })
        loading.value = false
        if (currentContextKey !== key) return
        if (data) notes.value = data

        channel = supabase
          .channel(`notes:hex:${hexCellId}:${crypto.randomUUID()}`)
          .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'hex_notes',
            filter: `hex_cell_id=eq.${hexCellId}`,
          }, handleRealtimeEvent)
          .subscribe()
        channel._ctx = { type: 'hex', hexCellId, sessionId }
      } finally {
        if (currentContextKey === key) _pendingInit = null
      }
    })()
    await _pendingInit
  }

  async function initForDungeonElement(elementId, elementType, sessionId) {
    const key = `dungeon:${elementId}`
    if (key === currentContextKey) {
      if (_pendingInit) await _pendingInit
      return
    }
    cleanup()

    currentContextKey = key
    _pendingInit = (async () => {
      try {
        loading.value = true
        const { data } = await supabase
          .from('dungeon_element_notes')
          .select('*')
          .eq('element_id', elementId)
          .order('created_at', { ascending: true })
        loading.value = false
        if (currentContextKey !== key) return
        if (data) notes.value = data

        channel = supabase
          .channel(`notes:dungeon:${elementId}:${crypto.randomUUID()}`)
          .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'dungeon_element_notes',
            filter: `element_id=eq.${elementId}`,
          }, handleRealtimeEvent)
          .subscribe()
        channel._ctx = { type: 'dungeon', elementId, elementType, sessionId }
      } finally {
        if (currentContextKey === key) _pendingInit = null
      }
    })()
    await _pendingInit
  }

  function handleRealtimeEvent({ eventType, new: row, old }) {
    const authStore = useAuthStore()
    if (eventType === 'INSERT') {
      if (row.user_id === authStore.user?.id) return
      notes.value = [...notes.value, row]
    } else if (eventType === 'UPDATE') {
      if (row.user_id === authStore.user?.id) return
      notes.value = notes.value.map(n => (n.id === row.id ? row : n))
    } else if (eventType === 'DELETE') {
      notes.value = notes.value.filter(n => n.id !== old.id)
    }
  }

  async function addNote(body) {
    const authStore = useAuthStore()
    const ctx = channel?._ctx
    if (!ctx || !body.trim()) return

    const optimisticId = crypto.randomUUID()
    const optimistic = {
      id: optimisticId,
      user_id: authStore.user?.id,
      display_name: authStore.displayName ?? 'Adventurer',
      body: body.trim(),
      created_at: new Date().toISOString(),
    }
    notes.value = [...notes.value, optimistic]

    let result
    if (ctx.type === 'hex') {
      result = await supabase
        .from('hex_notes')
        .insert({
          hex_cell_id: ctx.hexCellId,
          session_id: ctx.sessionId,
          user_id: authStore.user?.id,
          display_name: authStore.displayName ?? 'Adventurer',
          body: body.trim(),
        })
        .select()
        .single()
    } else {
      result = await supabase
        .from('dungeon_element_notes')
        .insert({
          element_id: ctx.elementId,
          element_type: ctx.elementType,
          session_id: ctx.sessionId,
          user_id: authStore.user?.id,
          display_name: authStore.displayName ?? 'Adventurer',
          body: body.trim(),
        })
        .select()
        .single()
    }

    const { data, error } = result
    if (error) {
      notes.value = notes.value.filter(n => n.id !== optimisticId)
      console.error('addNote error:', error.message)
    } else {
      notes.value = notes.value.map(n => (n.id === optimisticId ? data : n))
      const where = ctx?.type === 'hex' ? 'hex cell' : (ctx?.elementType ?? 'element')
      useActivityStore().record('added note to', where)
    }
  }

  async function updateNote(id, body) {
    if (!body.trim()) return
    const existing = notes.value.find(n => n.id === id)
    if (!existing) return

    notes.value = notes.value.map(n =>
      n.id === id ? { ...n, body: body.trim(), updated_at: new Date().toISOString() } : n,
    )

    const table = channel?._ctx?.type === 'hex' ? 'hex_notes' : 'dungeon_element_notes'
    const { error } = await supabase
      .from(table)
      .update({ body: body.trim() })
      .eq('id', id)

    if (error) {
      notes.value = notes.value.map(n => (n.id === id ? existing : n))
      console.error('updateNote error:', error.message)
    }
  }

  async function deleteNote(id) {
    const backup = notes.value.find(n => n.id === id)
    notes.value = notes.value.filter(n => n.id !== id)

    const table = channel?._ctx?.type === 'hex' ? 'hex_notes' : 'dungeon_element_notes'
    const { error } = await supabase.from(table).delete().eq('id', id)

    if (error) {
      if (backup) notes.value = [...notes.value, backup].sort((a, b) => a.created_at.localeCompare(b.created_at))
      console.error('deleteNote error:', error.message)
    }
  }

  function cleanup() {
    if (channel) {
      supabase.removeChannel(channel)
      channel = null
    }
    notes.value = []
    currentContextKey = null
    _pendingInit = null
  }

  return { notes, loading, initForHex, initForDungeonElement, addNote, updateNote, deleteNote, cleanup }
})
