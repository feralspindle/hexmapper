import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { supabase } from '@/lib/supabase'
import { realtime } from '@/lib/realtime.js'
import { pendingKeys } from '@/lib/realtimeProtocol.js'
import { apiClient, ApiError } from '@/lib/apiClient.js'
import { useAuthStore } from '@/stores/authStore.js'
import router from '@/router/index.js'

export const useSessionStore = defineStore('session', () => {
  const CLIENT_ID = crypto.randomUUID()
  const sessionId      = ref(null)
  const sessionName    = ref('Untitled Campaign')
  const sessionOwnerId = ref(null)
  const activeMapId    = ref(null)
  const hexMode        = ref(null)
  const gmInitiative   = ref(null)
  const playMode       = ref('gm')
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

  // fields we've written optimistically with the patch still in flight. the
  // session UPDATE echo carries every column, so until our own write commits
  // any echo (ours or another client's) holds a stale value for these
  const _pendingFields = pendingKeys()

  const onlineUsers = ref([])
  const latestJoin  = ref(null)

  function _applySessionRow(data) {
    sessionId.value      = data.id
    sessionName.value    = data.name
    sessionOwnerId.value = data.owner_id
    activeMapId.value    = data.active_map_id ?? null
    hexMode.value        = data.hex_mode ?? null
    gmInitiative.value   = data.gm_initiative ?? null
    playMode.value       = data.play_mode ?? 'gm'
    torchRunning.value   = data.torch_running ?? false
    torchElapsedMs.value = data.torch_elapsed_ms ?? 0
    torchStartedAt.value = data.torch_started_at ?? null
  }

  function _subscribeToSession(id) {
    if (sessionChannel) realtime.removeChannel(sessionChannel)
    sessionChannel = realtime
      .channel(`session:${id}:config`, {
        sessionId: id,
        onReconnect: async () => {
          const { data } = await supabase.from('sessions').select('*').eq('id', id).maybeSingle()
          if (data) _applySessionRow(data)
        },
      })
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'sessions', filter: `id=eq.${id}` },
        ({ new: row }) => {
          const fresh = field => row[field] !== undefined && !_pendingFields.has(field)
          if (fresh('name'))             sessionName.value    = row.name
          if (fresh('active_map_id'))    activeMapId.value    = row.active_map_id ?? null
          if (fresh('hex_mode'))         hexMode.value        = row.hex_mode
          if (fresh('gm_initiative'))    gmInitiative.value   = row.gm_initiative ?? null
          if (fresh('play_mode'))        playMode.value       = row.play_mode ?? 'gm'
          if (fresh('torch_running'))    torchRunning.value   = row.torch_running
          if (fresh('torch_elapsed_ms')) torchElapsedMs.value = row.torch_elapsed_ms
          if (fresh('torch_started_at')) torchStartedAt.value = row.torch_started_at ?? null
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
        .select('id, name, created_at, updated_at, play_mode')
        .eq('owner_id', authStore.user.id)
        .order('updated_at', { ascending: false }),

      supabase
        .from('session_members')
        .select('last_seen_at, session:session_id(id, name, created_at, updated_at, owner_id, play_mode)')
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

  async function createSession(playModeOverride = playMode.value) {
    loading.value = true
    error.value = null
    try {
      const data = await apiClient.post('/sessions', {
        name: sessionName.value,
        play_mode: playModeOverride,
      }, 'create_session')
      _applySessionRow(data)
      userSessions.value = [data, ...userSessions.value]
      _subscribeToSession(data.id)
      router.push({ name: 'hex-map', params: { sessionId: data.id } })
    } catch (e) {
      error.value = e instanceof ApiError ? e.message : e.message
    } finally {
      loading.value = false
    }
  }

  async function deleteSession(id) {
    try {
      await apiClient.delete(`/sessions/${id}`, 'delete_session')
    } catch (err) { console.error('deleteSession:', err instanceof ApiError ? err.message : err); return false }
    userSessions.value = userSessions.value.filter(s => s.id !== id)
    return true
  }

  async function leaveSession(id) {
    try {
      await apiClient.post(`/sessions/${id}/leave`, undefined, 'leave_session')
    } catch (err) { console.error('leaveSession:', err instanceof ApiError ? err.message : err); return false }
    joinedSessions.value = joinedSessions.value.filter(s => s.id !== id)
    return true
  }

  async function joinSession(id) {
    loading.value = true
    error.value = null
    try {
      const data = await apiClient.post(`/sessions/${id}/join`, undefined, 'join_session')
      _applySessionRow(data)
      _subscribeToSession(id)
    } catch {
      error.value = 'Session not found. Check the ID and try again.'
    } finally {
      loading.value = false
    }
  }

  async function updateSessionName(name) {
    const prev = sessionName.value
    sessionName.value = name
    _pendingFields.begin(['name'])
    try {
      await apiClient.patch(`/sessions/${sessionId.value}`, { name }, 'rename_session')
      const idx = userSessions.value.findIndex(s => s.id === sessionId.value)
      if (idx !== -1) userSessions.value[idx] = { ...userSessions.value[idx], name }
    } catch (err) {
      console.error('updateSessionName:', err instanceof ApiError ? err.message : err)
      sessionName.value = prev
    } finally {
      _pendingFields.end(['name'])
    }
  }

  async function setActiveMapId(mapId) {
    const prev = activeMapId.value
    activeMapId.value = mapId
    _pendingFields.begin(['active_map_id'])
    try {
      await apiClient.patch(`/sessions/${sessionId.value}`, { active_map_id: mapId }, 'set_active_map')
    } catch (err) {
      console.error('setActiveMapId:', err instanceof ApiError ? err.message : err)
      activeMapId.value = prev
    } finally {
      _pendingFields.end(['active_map_id'])
    }
  }

  async function setHexMode(mode) {
    try {
      await apiClient.patch(`/sessions/${sessionId.value}`, { hex_mode: mode }, 'set_hex_mode')
      hexMode.value = mode
    } catch (err) {
      console.error('setHexMode:', err instanceof ApiError ? err.message : err)
    }
  }

  async function setGmInitiative(score) {
    const previous = gmInitiative.value
    gmInitiative.value = score ?? null
    _pendingFields.begin(['gm_initiative'])
    try {
      await apiClient.patch(
        `/sessions/${sessionId.value}`,
        { gm_initiative: gmInitiative.value },
        'set_gm_initiative',
      )
      return true
    } catch (err) {
      console.error('setGmInitiative:', err instanceof ApiError ? err.message : err)
      gmInitiative.value = previous
      return false
    } finally {
      _pendingFields.end(['gm_initiative'])
    }
  }

  async function setPlayMode(mode) {
    if (!['gm', 'gm_less'].includes(mode)) return false
    const previous = playMode.value
    playMode.value = mode
    _pendingFields.begin(['play_mode'])
    try {
      await apiClient.patch(`/sessions/${sessionId.value}`, { play_mode: mode }, 'set_play_mode')
      return true
    } catch (err) {
      console.error('setPlayMode:', err instanceof ApiError ? err.message : err)
      playMode.value = previous
      return false
    } finally {
      _pendingFields.end(['play_mode'])
    }
  }

  function initPresence(id) {
    const authStore = useAuthStore()
    if (presenceChannel) realtime.removeChannel(presenceChannel)
    if (_stopAuthWatch) { _stopAuthWatch(); _stopAuthWatch = null }

    let _ready = false

    const channel = realtime
      .channel(`session:${id}:presence`, {
        sessionId: id,
        config: { presence: { key: authStore.user?.id ?? CLIENT_ID } },
      })

    presenceChannel = channel

    const trackPresence = () => channel.track({
      user_id:      authStore.user?.id ?? null,
      _clientId:    CLIENT_ID,
      display_name: authStore.displayName ?? 'Adventurer',
      avatar_url:   authStore.avatarUrl ?? null,
    })

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
        trackPresence()
      })

    _stopAuthWatch = watch(
      () => authStore.user?.id,
      (userId, prev) => {
        if (!userId || userId === prev || !presenceChannel) return
        trackPresence()
      },
    )

    const handlePageHide = () => { if (presenceChannel) presenceChannel.untrack() }
    const handlePageShow = () => { if (presenceChannel) trackPresence() }
    window.addEventListener('pagehide', handlePageHide)
    window.addEventListener('pageshow', handlePageShow)
    _stopPageHide = () => {
      window.removeEventListener('pagehide', handlePageHide)
      window.removeEventListener('pageshow', handlePageShow)
    }
  }

  async function torchStart() {
    torchRunning.value = true
    _pendingFields.begin(['torch_running'])
    try {
      await apiClient.post(`/sessions/${sessionId.value}/torch`, { action: 'start' }, 'session_torch_start')
    } catch (err) { console.error('session torchStart:', err instanceof ApiError ? err.message : err) }
    finally { _pendingFields.end(['torch_running']) }
  }

  async function torchPause() {
    try {
      await apiClient.post(`/sessions/${sessionId.value}/torch`, { action: 'pause' }, 'session_torch_pause')
    } catch (err) { console.error('session torchPause:', err instanceof ApiError ? err.message : err) }
  }

  async function torchReset() {
    torchElapsedMs.value = 0
    _pendingFields.begin(['torch_elapsed_ms'])
    try {
      await apiClient.post(`/sessions/${sessionId.value}/torch`, { action: 'reset' }, 'session_torch_reset')
    } catch (err) { console.error('session torchReset:', err instanceof ApiError ? err.message : err) }
    finally { _pendingFields.end(['torch_elapsed_ms']) }
  }

  function cleanupPresence() {
    if (_stopPageHide)  { _stopPageHide(); _stopPageHide = null }
    if (_stopAuthWatch) { _stopAuthWatch(); _stopAuthWatch = null }
    if (presenceChannel) { realtime.removeChannel(presenceChannel); presenceChannel = null }
    onlineUsers.value = []
    latestJoin.value  = null
  }

  function cleanup() {
    if (sessionChannel) { realtime.removeChannel(sessionChannel); sessionChannel = null }
    cleanupPresence()
    sessionId.value      = null
    sessionName.value    = 'Untitled Campaign'
    sessionOwnerId.value = null
    activeMapId.value    = null
    hexMode.value        = null
    gmInitiative.value   = null
    playMode.value       = 'gm'
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
    gmInitiative,
    playMode,
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
    leaveSession,
    joinSession,
    updateSessionName,
    setActiveMapId,
    setHexMode,
    setGmInitiative,
    setPlayMode,
    torchStart,
    torchPause,
    torchReset,
    initPresence,
    cleanupPresence,
    cleanup,
  }
})
