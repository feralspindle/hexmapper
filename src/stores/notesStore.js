import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '@/lib/supabase'
import { createSessionChannel } from '@/lib/sessionChannel.js'
import { apiClient, ApiError } from '@/lib/apiClient.js'
import { useAuthStore } from '@/stores/authStore.js'
import { useActivityStore } from '@/stores/activityStore.js'
import { useHexStore } from '@/stores/hexStore.js'

export const useNotesStore = defineStore('notes', () => {
  const notes = ref([])
  const loading = ref(false)
  const session = createSessionChannel()
  let _ctx = null
  let _pendingInit = null

  async function refresh(generation = session.generation) {
    const ctx = _ctx
    if (!ctx || !session.key) return
    const query = ctx.type === 'hex'
      ? supabase.from('hex_notes').select('*').eq('hex_cell_id', ctx.hexCellId)
      : ctx.type === 'dungeonCell'
        ? supabase.from('dungeon_cell_notes').select('*')
            .eq('dungeon_id', ctx.dungeonId).eq('cell_x', ctx.cellX).eq('cell_y', ctx.cellY)
        : supabase.from('dungeon_element_notes').select('*').eq('element_id', ctx.elementId)
    const { data } = await query.order('created_at', { ascending: true })
    if (data && session.isCurrent(generation)) notes.value = data
  }

  async function _init(key, ctx, { table, filter, extraFilters = [], channelName }) {
    if (key === session.key) {
      if (_pendingInit) await _pendingInit
      return
    }
    cleanup()

    const generation = session.begin(key)
    _ctx = ctx
    _pendingInit = (async () => {
      try {
        loading.value = true
        let query = supabase
          .from(table)
          .select('*')
          .eq(...filter)
        for (const extra of extraFilters) query = query.eq(...extra)
        const { data } = await query.order('created_at', { ascending: true })
        loading.value = false
        if (!session.isCurrent(generation)) return
        if (data) notes.value = data

        // postgres_changes takes a single column filter, so contexts keyed by
        // more than one column (cell notes) narrow the rest client-side
        session.open(channelName, { sessionId: ctx.sessionId, refresh }, ch => ch
          .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table,
            filter: `${filter[0]}=eq.${filter[1]}`,
          }, handleRealtimeEvent))
      } finally {
        if (session.isCurrent(generation)) _pendingInit = null
      }
    })()
    await _pendingInit
  }

  async function initForHex(hexCellId, sessionId) {
    if (!hexCellId) {
      cleanup()
      return
    }
    await _init(`hex:${hexCellId}`, { type: 'hex', hexCellId, sessionId }, {
      table: 'hex_notes',
      filter: ['hex_cell_id', hexCellId],
      channelName: `notes:hex:${hexCellId}:${crypto.randomUUID()}`,
    })
  }

  async function initForDungeonElement(elementId, elementType, sessionId) {
    await _init(`dungeon:${elementId}`, { type: 'dungeon', elementId, elementType, sessionId }, {
      table: 'dungeon_element_notes',
      filter: ['element_id', elementId],
      channelName: `notes:dungeon:${elementId}:${crypto.randomUUID()}`,
    })
  }

  // fog-mode annotations hang off a grid cell, not a room/corridor row
  async function initForDungeonCell(dungeonId, cellX, cellY, sessionId) {
    await _init(`dungeonCell:${dungeonId}:${cellX}:${cellY}`, { type: 'dungeonCell', dungeonId, cellX, cellY, sessionId }, {
      table: 'dungeon_cell_notes',
      filter: ['dungeon_id', dungeonId],
      extraFilters: [['cell_x', cellX], ['cell_y', cellY]],
      channelName: `notes:dungeonCell:${dungeonId}:${cellX}:${cellY}:${crypto.randomUUID()}`,
    })
  }

  function _rowInContext(row) {
    const ctx = _ctx
    if (ctx?.type !== 'dungeonCell') return true
    return row.cell_x === ctx.cellX && row.cell_y === ctx.cellY
  }

  function handleRealtimeEvent({ eventType, new: row, old }) {
    if (eventType === 'INSERT') {
      if (!_rowInContext(row)) return
      if (notes.value.some(n => n.id === row.id)) return
      notes.value = [...notes.value, row]
    } else if (eventType === 'UPDATE') {
      if (!_rowInContext(row)) return
      notes.value = notes.value.map(n => (n.id === row.id ? row : n))
    } else if (eventType === 'DELETE') {
      notes.value = notes.value.filter(n => n.id !== old.id)
    }
  }

  async function addNote(body) {
    const authStore = useAuthStore()
    const ctx = _ctx
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

    try {
      let data
      if (ctx.type === 'hex') {
        data = await apiClient.post('/hex-notes', {
          hex_cell_id: ctx.hexCellId,
          session_id: ctx.sessionId,
          body: body.trim(),
        })
      } else if (ctx.type === 'dungeonCell') {
        data = await apiClient.post('/dungeon-cell-notes', {
          dungeon_id: ctx.dungeonId,
          cell_x: ctx.cellX,
          cell_y: ctx.cellY,
          body: body.trim(),
        })
      } else {
        data = await apiClient.post('/dungeon-element-notes', {
          element_id: ctx.elementId,
          element_type: ctx.elementType,
          session_id: ctx.sessionId,
          body: body.trim(),
        })
      }
      const replaced = notes.value.map(n => (n.id === optimisticId ? data : n))
      notes.value = replaced.filter((n, i) => replaced.findIndex(x => x.id === n.id) === i)
      const where = ctx?.type === 'hex' ? 'hex cell'
        : ctx?.type === 'dungeonCell' ? 'map cell'
        : (ctx?.elementType ?? 'element')
      useActivityStore().record('added note to', where)
      if (ctx.type === 'hex') useHexStore().noteCountsChanged()
    } catch (error) {
      notes.value = notes.value.filter(n => n.id !== optimisticId)
      console.error('addNote error:', error instanceof ApiError ? error.message : (error.message ?? error))
    }
  }

  async function updateNote(id, body) {
    if (!body.trim()) return
    const existing = notes.value.find(n => n.id === id)
    if (!existing) return

    notes.value = notes.value.map(n =>
      n.id === id ? { ...n, body: body.trim(), updated_at: new Date().toISOString() } : n,
    )

    const notePath = _ctx?.type === 'hex' ? '/hex-notes'
      : _ctx?.type === 'dungeonCell' ? '/dungeon-cell-notes'
      : '/dungeon-element-notes'
    try {
      await apiClient.patch(`${notePath}/${id}`, { body: body.trim() })
    } catch (error) {
      notes.value = notes.value.map(n => (n.id === id ? existing : n))
      console.error('updateNote error:', error instanceof ApiError ? error.message : (error.message ?? error))
    }
  }

  async function deleteNote(id) {
    const backup = notes.value.find(n => n.id === id)
    notes.value = notes.value.filter(n => n.id !== id)

    const isHex = _ctx?.type === 'hex'
    const notePath = isHex ? '/hex-notes'
      : _ctx?.type === 'dungeonCell' ? '/dungeon-cell-notes'
      : '/dungeon-element-notes'
    try {
      await apiClient.delete(`${notePath}/${id}`)
      if (isHex) useHexStore().noteCountsChanged()
    } catch (error) {
      if (backup) notes.value = [...notes.value, backup].sort((a, b) => a.created_at.localeCompare(b.created_at))
      console.error('deleteNote error:', error instanceof ApiError ? error.message : (error.message ?? error))
    }
  }

  function cleanup() {
    session.close()
    notes.value = []
    _ctx = null
    _pendingInit = null
  }

  return { notes, loading, initForHex, initForDungeonElement, initForDungeonCell, refresh, addNote, updateNote, deleteNote, cleanup }
})
