import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore.js'
import router from '@/router/index.js'

export const useSessionStore = defineStore('session', () => {
  const CLIENT_ID = crypto.randomUUID()
  const sessionId      = ref(null)
  const sessionName    = ref('Untitled Campaign')
  const sessionOwnerId = ref(null)
  const activeMapId    = ref(null)
  const hexMode        = ref(null)
  const torchRunning   = ref(false)
  const torchElapsedMs = ref(0)
  const torchStartedAt = ref(null)
  const loading        = ref(false)
  const error          = ref(null)

  const isGM = computed(() => {
    const authStore = useAuthStore()
    return !!authStore.user?.id && authStore.user.id === sessionOwnerId.value
  })

  const userSessions   = ref([])
  const joinedSessions = ref([])
  const sessionsLoading = ref(false)

  let sessionChannel  = null
  let presenceChannel = null
  let _stopAuthWatch  = null
  let _stopPageHide   = null

  const onlineUsers = ref([])
  const latestJoin  = ref(null)

  function _applySessionRow(data) {
    sessionId.value      = data.id
    sessionName.value    = data.name
    sessionOwnerId.value = data.owner_id
    activeMapId.value    = data.active_map_id ?? null
    hexMode.value        = data.hex_mode ?? null
    torchRunning.value   = data.torch_running ?? false
    torchElapsedMs.value = data.torch_elapsed_ms ?? 0
    torchStartedAt.value = data.torch_started_at ?? null
  }

  function _subscribeToSession(id) {
    if (sessionChannel) supabase.removeChannel(sessionChannel)
    sessionChannel = supabase
      .channel(`session:${id}:config`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'sessions', filter: `id=eq.${id}` },
        ({ new: row }) => {
          if (row.name !== undefined)             sessionName.value    = row.name
          if (row.active_map_id !== undefined)    activeMapId.value    = row.active_map_id ?? null
          if (row.hex_mode !== undefined)         hexMode.value        = row.hex_mode
          if (row.torch_running !== undefined)    torchRunning.value   = row.torch_running
          if (row.torch_elapsed_ms !== undefined) torchElapsedMs.value = row.torch_elapsed_ms
          if (row.torch_started_at !== undefined) torchStartedAt.value = row.torch_started_at ?? null
        },
      )
      .subscribe()
  }

  async function fetchUserSessions() {
    const authStore = useAuthStore()
    if (!authStore.user) return
    sessionsLoading.value = true

    const [ownedRes, joinedRes] = await Promise.all([
      supabase
        .from('sessions')
        .select('id, name, created_at, updated_at')
        .eq('owner_id', authStore.user.id)
        .order('updated_at', { ascending: false }),

      supabase
        .from('session_members')
        .select('last_seen_at, session:session_id(id, name, created_at, updated_at, owner_id)')
        .eq('user_id', authStore.user.id)
        .order('last_seen_at', { ascending: false }),
    ])

    sessionsLoading.value = false

    if (!ownedRes.error) userSessions.value = ownedRes.data ?? []

    if (!joinedRes.error) {
      const ownedIds = new Set((ownedRes.data ?? []).map(s => s.id))
      joinedSessions.value = (joinedRes.data ?? [])
        .map(row => row.session)
        .filter(s => s && !ownedIds.has(s.id))
    }
  }

  async function createSession() {
    const authStore = useAuthStore()
    loading.value = true
    error.value = null
    try {
      const { data, error: err } = await supabase
        .from('sessions')
        .insert({ name: sessionName.value, owner_id: authStore.user?.id })
        .select()
        .single()
      if (err) throw err
      _applySessionRow(data)
      userSessions.value = [data, ...userSessions.value]
      _subscribeToSession(data.id)
      router.push({ name: 'hex-map', params: { sessionId: data.id } })
    } catch (e) {
      error.value = e.message
    } finally {
      loading.value = false
    }
  }

  async function deleteSession(id) {
    const { error: err } = await supabase.from('sessions').delete().eq('id', id)
    if (err) { console.error('deleteSession:', err.message); return false }
    userSessions.value = userSessions.value.filter(s => s.id !== id)
    return true
  }

  async function joinSession(id) {
    loading.value = true
    error.value = null
    try {
      // Uses the join_session RPC (security definer) so sessions don't need to be
      // publicly enumerable — the UUID is the access credential.
      const { data, error: err } = await supabase.rpc('join_session', { p_session_id: id })
      if (err) throw err
      _applySessionRow(data)
      _subscribeToSession(id)
    } catch (e) {
      error.value = 'Session not found. Check the ID and try again.'
    } finally {
      loading.value = false
    }
  }

  async function updateSessionName(name) {
    const prev = sessionName.value
    sessionName.value = name
    const { error: err } = await supabase
      .from('sessions')
      .update({ name })
      .eq('id', sessionId.value)
    if (err) sessionName.value = prev
    else {
      const idx = userSessions.value.findIndex(s => s.id === sessionId.value)
      if (idx !== -1) userSessions.value[idx] = { ...userSessions.value[idx], name }
    }
  }

  async function setActiveMapId(mapId) {
    const prev = activeMapId.value
    activeMapId.value = mapId
    const { error: err } = await supabase
      .from('sessions')
      .update({ active_map_id: mapId })
      .eq('id', sessionId.value)
    if (err) { console.error('setActiveMapId:', err.message); activeMapId.value = prev }
  }

  async function setHexMode(mode) {
    const { error: err } = await supabase
      .from('sessions')
      .update({ hex_mode: mode })
      .eq('id', sessionId.value)
    if (err) console.error('setHexMode:', err.message)
    else hexMode.value = mode
  }

  function initPresence(id) {
    const authStore = useAuthStore()
    if (presenceChannel) supabase.removeChannel(presenceChannel)
    if (_stopAuthWatch) { _stopAuthWatch(); _stopAuthWatch = null }

    let _ready = false

    const channel = supabase
      .channel(`session:${id}:presence`, {
        config: { presence: { key: authStore.user?.id ?? CLIENT_ID } },
      })

    presenceChannel = channel

    const syncUsers = () => {
      const state = channel.presenceState()
      const latest = Object.values(state).map(e => e.at(-1)).filter(Boolean)
      const byUser = new Map()
      for (const p of latest) byUser.set(p.user_id ?? p._clientId, p)
      onlineUsers.value = [...byUser.values()]
    }

    channel
      .on('presence', { event: 'sync' }, () => { syncUsers(); _ready = true })
      .on('presence', { event: 'join' }, ({ newPresences }) => {
        syncUsers()
        if (!_ready) return
        for (const p of newPresences) {
          if (p.user_id && p.user_id === authStore.user?.id) continue
          latestJoin.value = { ...p, _ts: Date.now() }
        }
      })
      .on('presence', { event: 'leave' }, syncUsers)
      .subscribe(status => {
        if (status !== 'SUBSCRIBED') return
        channel.track({
          user_id:      authStore.user?.id ?? null,
          _clientId:    CLIENT_ID,
          display_name: authStore.displayName ?? 'Adventurer',
          avatar_url:   authStore.avatarUrl ?? null,
        })
      })

    _stopAuthWatch = watch(
      () => authStore.user?.id,
      (userId, prev) => {
        if (!userId || userId === prev || !presenceChannel) return
        presenceChannel.track({
          user_id:      userId,
          _clientId:    CLIENT_ID,
          display_name: authStore.displayName ?? 'Adventurer',
          avatar_url:   authStore.avatarUrl ?? null,
        })
      },
    )

    const handlePageHide = () => { if (presenceChannel) presenceChannel.untrack() }
    window.addEventListener('pagehide', handlePageHide)
    _stopPageHide = () => window.removeEventListener('pagehide', handlePageHide)
  }

  async function torchStart() {
    torchRunning.value = true
    const { error } = await supabase.rpc('session_torch_start', { p_session_id: sessionId.value })
    if (error) console.error('session torchStart:', error.message)
  }

  async function torchPause() {
    const { error } = await supabase.rpc('session_torch_pause', { p_session_id: sessionId.value })
    if (error) console.error('session torchPause:', error.message)
  }

  async function torchReset() {
    torchElapsedMs.value = 0
    const { error } = await supabase.rpc('session_torch_reset', { p_session_id: sessionId.value })
    if (error) console.error('session torchReset:', error.message)
  }

  function cleanupPresence() {
    if (_stopPageHide)  { _stopPageHide(); _stopPageHide = null }
    if (_stopAuthWatch) { _stopAuthWatch(); _stopAuthWatch = null }
    if (presenceChannel) { supabase.removeChannel(presenceChannel); presenceChannel = null }
    onlineUsers.value = []
    latestJoin.value  = null
  }

  function cleanup() {
    if (sessionChannel) { supabase.removeChannel(sessionChannel); sessionChannel = null }
    cleanupPresence()
    sessionId.value      = null
    sessionName.value    = 'Untitled Campaign'
    sessionOwnerId.value = null
    activeMapId.value    = null
    hexMode.value        = null
    torchRunning.value   = false
    torchElapsedMs.value = 0
    torchStartedAt.value = null
  }

  return {
    sessionId,
    sessionName,
    sessionOwnerId,
    activeMapId,
    hexMode,
    torchRunning,
    torchElapsedMs,
    torchStartedAt,
    isGM,
    loading,
    error,
    userSessions,
    joinedSessions,
    sessionsLoading,
    onlineUsers,
    latestJoin,
    fetchUserSessions,
    createSession,
    deleteSession,
    joinSession,
    updateSessionName,
    setActiveMapId,
    setHexMode,
    torchStart,
    torchPause,
    torchReset,
    initPresence,
    cleanupPresence,
    cleanup,
  }
})
