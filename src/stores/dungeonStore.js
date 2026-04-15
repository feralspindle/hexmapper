import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore.js'

const CLIENT_ID = crypto.randomUUID()

export const useD = defineStore('dungeon', () => {
  const dungeon = ref(null)
  const rooms = ref(new Map())
  const corridors = ref(new Map())
  const loading = ref(true)
  const loadError = ref(null)
  const drawMode = ref('select')
  const selectedElement = ref(null)
  const viewers = ref([])
  const _editingRoom = ref(null)
  let roomChannel = null
  let corridorChannel = null
  let dungeonChannel = null
  let presenceChannel = null

  async function init(sessionId, dungeonId) {
    loading.value = true
    loadError.value = null
    drawMode.value = 'select'
    selectedElement.value = null

    try {
      const [{ data: dungeonData, error: e1 }, { data: roomData }, { data: corridorData }] = await Promise.all([
        supabase.from('dungeons').select('*').eq('id', dungeonId).single(),
        supabase.from('dungeon_rooms').select('*').eq('dungeon_id', dungeonId),
        supabase.from('dungeon_corridors').select('*').eq('dungeon_id', dungeonId),
      ])

      if (e1) throw new Error(e1.message)

      dungeon.value = dungeonData
      rooms.value = new Map((roomData ?? []).map(r => [r.id, r]))
      corridors.value = new Map((corridorData ?? []).map(c => [c.id, c]))
    } catch (err) {
      loadError.value = err.message ?? 'Failed to load dungeon'
      console.error('dungeonStore.init error:', err)
    } finally {
      loading.value = false
    }

    if (dungeonChannel) supabase.removeChannel(dungeonChannel)
    if (roomChannel) supabase.removeChannel(roomChannel)
    if (corridorChannel) supabase.removeChannel(corridorChannel)

    dungeonChannel = supabase
      .channel(`dungeon:${dungeonId}:meta`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'dungeons', filter: `id=eq.${dungeonId}` },
        ({ new: row }) => { dungeon.value = row },
      )
      .subscribe()

    roomChannel = supabase
      .channel(`session:${sessionId}:dungeon:${dungeonId}:rooms`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'dungeon_rooms', filter: `dungeon_id=eq.${dungeonId}` },
        ({ eventType, new: row, old }) => {
          if (eventType === 'INSERT' || eventType === 'UPDATE') {
            if (row.source_client !== CLIENT_ID) {
              const editing = _editingRoom.value
              if (editing && editing.id === row.id) {
                const current = rooms.value.get(row.id)
                const merged = { ...row }
                if (current) {
                  for (const field of editing.fields) {
                    merged[field] = current[field]
                  }
                }
                rooms.value.set(row.id, merged)
              } else {
                rooms.value.set(row.id, row)
              }
            }
          } else if (eventType === 'DELETE') {
            rooms.value.delete(old.id)
          }
        },
      )
      .subscribe()

    corridorChannel = supabase
      .channel(`session:${sessionId}:dungeon:${dungeonId}:corridors`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'dungeon_corridors', filter: `dungeon_id=eq.${dungeonId}` },
        ({ eventType, new: row, old }) => {
          if (eventType === 'INSERT' || eventType === 'UPDATE') {
            if (row.source_client !== CLIENT_ID) corridors.value.set(row.id, row)
          } else if (eventType === 'DELETE') {
            corridors.value.delete(old.id)
          }
        },
      )
      .subscribe()

    if (presenceChannel) supabase.removeChannel(presenceChannel)
    const authStore = useAuthStore()

    const syncViewers = () => {
      const state = presenceChannel.presenceState()
      const latest = Object.values(state).map(entries => entries.at(-1)).filter(Boolean)
      const byUser = new Map()
      for (const p of latest) byUser.set(p.user_id, p)
      viewers.value = [...byUser.values()]
    }

    presenceChannel = supabase.channel(`dungeon:${dungeonId}:presence`, {
      config: { presence: { key: authStore.user?.id ?? CLIENT_ID } },
    })
      .on('presence', { event: 'sync' }, syncViewers)
      .on('presence', { event: 'join' }, syncViewers)
      .on('presence', { event: 'leave' }, syncViewers)
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await presenceChannel.track({
            user_id: authStore.user?.id,
            display_name: authStore.displayName ?? 'Adventurer',
            avatar_url: authStore.avatarUrl ?? null,
            editing_id: selectedElement.value?.id ?? null,
            editing_type: selectedElement.value?.type ?? null,
          })
        }
      })
  }

  async function addRoom(roomData) {
    const tempId = crypto.randomUUID()
    const optimistic = { id: tempId, ...roomData, source_client: CLIENT_ID }
    rooms.value.set(tempId, optimistic)

    const { data, error } = await supabase
      .from('dungeon_rooms')
      .insert({ ...roomData, source_client: CLIENT_ID })
      .select()
      .single()

    rooms.value.delete(tempId)
    if (error) { console.error('addRoom error:', error.message); return }
    rooms.value.set(data.id, data)
  }

  async function updateRoom(id, patch) {
    const existing = rooms.value.get(id)
    if (!existing) return
    rooms.value.set(id, { ...existing, ...patch })

    const { error } = await supabase
      .from('dungeon_rooms')
      .update({ ...patch, source_client: CLIENT_ID })
      .eq('id', id)

    if (error) {
      rooms.value.set(id, existing)
      console.error('updateRoom error:', error.message)
    }
  }

  async function deleteRoom(id) {
    const backup = rooms.value.get(id)
    rooms.value.delete(id)
    if (selectedElement.value?.id === id) selectedElement.value = null

    const { error } = await supabase.from('dungeon_rooms').delete().eq('id', id)
    if (error) {
      if (backup) rooms.value.set(id, backup)
      console.error('deleteRoom error:', error.message)
    }
  }

  async function addCorridor(corridorData) {
    const tempId = crypto.randomUUID()
    const optimistic = { id: tempId, ...corridorData, source_client: CLIENT_ID }
    corridors.value.set(tempId, optimistic)

    const { data, error } = await supabase
      .from('dungeon_corridors')
      .insert({ ...corridorData, source_client: CLIENT_ID })
      .select()
      .single()

    corridors.value.delete(tempId)
    if (error) { console.error('addCorridor error:', error.message); return }
    corridors.value.set(data.id, data)
  }

  async function updateCorridor(id, patch) {
    const existing = corridors.value.get(id)
    if (!existing) return
    corridors.value.set(id, { ...existing, ...patch })

    const { error } = await supabase
      .from('dungeon_corridors')
      .update({ ...patch, source_client: CLIENT_ID })
      .eq('id', id)

    if (error) {
      corridors.value.set(id, existing)
      console.error('updateCorridor error:', error.message)
    }
  }

  async function deleteCorridor(id) {
    const backup = corridors.value.get(id)
    corridors.value.delete(id)
    if (selectedElement.value?.id === id) selectedElement.value = null

    const { error } = await supabase.from('dungeon_corridors').delete().eq('id', id)
    if (error) {
      if (backup) corridors.value.set(id, backup)
      console.error('deleteCorridor error:', error.message)
    }
  }

  function addDoor(roomId, doorData) {
    const room = rooms.value.get(roomId)
    if (!room) return
    const doors = [...(room.doors ?? []), { id: crypto.randomUUID(), ...doorData }]
    updateRoom(roomId, { doors })
  }

  function removeDoor(roomId, doorId) {
    const room = rooms.value.get(roomId)
    if (!room) return
    const doors = (room.doors ?? []).filter(d => d.id !== doorId)
    updateRoom(roomId, { doors })
  }

  function addRoomItem(roomId, type, x, y) {
    const room = rooms.value.get(roomId)
    if (!room) return
    const cx = x ?? room.origin_x + room.width / 2
    const cy = y ?? room.origin_y + room.height / 2
    const items = [...(room.items ?? []), { id: crypto.randomUUID(), type, x: cx, y: cy, notes: '' }]
    updateRoom(roomId, { items })
  }

  function removeRoomItem(roomId, itemId) {
    const room = rooms.value.get(roomId)
    if (!room) return
    const items = (room.items ?? []).filter(i => i.id !== itemId)
    updateRoom(roomId, { items })
  }

  function updateRoomItem(roomId, itemId, patch) {
    const room = rooms.value.get(roomId)
    if (!room) return
    const items = (room.items ?? []).map(i => i.id === itemId ? { ...i, ...patch } : i)
    updateRoom(roomId, { items })
  }

  function selectElement(type, id) {
    selectedElement.value = { type, id }
    _trackPresence()
  }

  function deselect() {
    selectedElement.value = null
    _trackPresence()
  }

  function _trackPresence() {
    if (!presenceChannel) return
    const authStore = useAuthStore()
    presenceChannel.track({
      user_id: authStore.user?.id,
      display_name: authStore.displayName ?? 'Adventurer',
      avatar_url: authStore.avatarUrl ?? null,
      editing_id: selectedElement.value?.id ?? null,
      editing_type: selectedElement.value?.type ?? null,
    })
  }

  function beginRoomEdit(id, fields) {
    _editingRoom.value = { id, fields }
  }

  function endRoomEdit() {
    _editingRoom.value = null
  }

  async function updateTorch(patch) {
    if (!dungeon.value?.id) return
    dungeon.value = { ...dungeon.value, ...patch }
    const { error } = await supabase
      .from('dungeons')
      .update(patch)
      .eq('id', dungeon.value.id)
    if (error) console.error('updateTorch error:', error.message)
  }

  function cleanup() {
    if (dungeonChannel) supabase.removeChannel(dungeonChannel)
    if (roomChannel) supabase.removeChannel(roomChannel)
    if (corridorChannel) supabase.removeChannel(corridorChannel)
    if (presenceChannel) supabase.removeChannel(presenceChannel)
    dungeonChannel = null
    roomChannel = null
    corridorChannel = null
    presenceChannel = null
    dungeon.value = null
    rooms.value = new Map()
    corridors.value = new Map()
    viewers.value = []
    selectedElement.value = null
    loadError.value = null
    loading.value = true
  }

  return {
    dungeon,
    rooms,
    corridors,
    loading,
    loadError,
    drawMode,
    selectedElement,
    viewers,
    init,
    addRoom,
    updateRoom,
    deleteRoom,
    addCorridor,
    updateCorridor,
    deleteCorridor,
    addDoor,
    removeDoor,
    addRoomItem,
    removeRoomItem,
    updateRoomItem,
    selectElement,
    deselect,
    beginRoomEdit,
    endRoomEdit,
    updateTorch,
    cleanup,
  }
})
