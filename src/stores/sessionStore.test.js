import { describe, test, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { resetKit } from '../../test/helpers/storeTestKit.js'

const kit = vi.hoisted(() => ({ auth: { user: { id: 'me' }, displayName: 'Me', avatarUrl: null } }))

vi.mock('@/lib/supabase', async () => {
  const { createSupabaseMock } = await import('../../test/helpers/storeTestKit.js')
  return createSupabaseMock(kit)
})
vi.mock('@/lib/realtime.js', async () => {
  const { createRealtimeMock } = await import('../../test/helpers/storeTestKit.js')
  return createRealtimeMock(kit)
})
vi.mock('@/lib/apiClient.js', async () => {
  const { createApiClientMock } = await import('../../test/helpers/storeTestKit.js')
  return createApiClientMock(kit)
})
vi.mock('@/stores/authStore.js', () => ({
  useAuthStore: () => kit.auth,
}))
vi.mock('@/router/index.js', () => ({
  default: { push: vi.fn() },
}))

import router from '@/router/index.js'
import { useSessionStore } from './sessionStore.js'

const sessionRow = (overrides = {}) => ({
  id: 'sess-1',
  name: 'The Sunken Keep',
  owner_id: 'gm-1',
  active_map_id: 'map-1',
  hex_mode: 'explore',
  play_mode: 'gm',
  ...overrides,
})

describe('sessionStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    resetKit(kit)
    kit.auth = { user: { id: 'me' }, displayName: 'Me', avatarUrl: null }
    vi.mocked(router.push).mockClear()
  })

  test('joinSession applies the session row and subscribes to config updates', async () => {
    kit.api['post /sessions/sess-1/join'] = sessionRow()
    const store = useSessionStore()
    await store.joinSession('sess-1')

    expect(store.sessionId).toBe('sess-1')
    expect(store.sessionName).toBe('The Sunken Keep')
    expect(store.activeMapId).toBe('map-1')
    expect(kit.channels.map(c => c.name)).toContain('session:sess-1:config')
    expect(store.error).toBeNull()
  })

  test('a failed join surfaces a friendly error', async () => {
    kit.api['post /sessions/nope/join'] = new kit.ApiError('404', 404)
    const store = useSessionStore()
    await store.joinSession('nope')

    expect(store.error).toMatch(/Session not found/)
    expect(store.sessionId).toBeNull()
  })

  test('isGM is true when the signed-in user owns the session', async () => {
    kit.api['post /sessions/sess-1/join'] = sessionRow({ owner_id: 'me' })
    const store = useSessionStore()
    await store.joinSession('sess-1')

    expect(store.isGM).toBe(true)
  })

  test('isGM is false for a joined session owned by someone else', async () => {
    kit.api['post /sessions/sess-1/join'] = sessionRow({ owner_id: 'gm-1' })
    const store = useSessionStore()
    await store.joinSession('sess-1')

    expect(store.isGM).toBe(false)
  })

  test('a session UPDATE moves players to the GM active map (follow-GM regression)', async () => {
    kit.api['post /sessions/sess-1/join'] = sessionRow()
    const store = useSessionStore()
    await store.joinSession('sess-1')

    const configChannel = kit.channels.find(c => c.name === 'session:sess-1:config')
    configChannel.emitPostgres('sessions', 'UPDATE', { active_map_id: 'map-2', torch_running: true })

    expect(store.activeMapId).toBe('map-2')
    expect(store.torchRunning).toBe(true)
    expect(store.sessionName).toBe('The Sunken Keep')
  })

  test('reconnect refetches the session row so a missed map switch is applied', async () => {
    kit.api['post /sessions/sess-1/join'] = sessionRow()
    const store = useSessionStore()
    await store.joinSession('sess-1')

    kit.responses.sessions = { data: sessionRow({ active_map_id: 'map-9', name: 'Renamed' }), error: null }
    const configChannel = kit.channels.find(c => c.name === 'session:sess-1:config')
    await configChannel.reconnect()

    expect(store.activeMapId).toBe('map-9')
    expect(store.sessionName).toBe('Renamed')
  })

  test('createSession applies the new session and navigates to it', async () => {
    kit.api['post /sessions'] = body => sessionRow({ id: 'new-sess', name: body.name, owner_id: 'me' })
    const store = useSessionStore()
    await store.createSession()

    expect(store.sessionId).toBe('new-sess')
    expect(store.userSessions[0].id).toBe('new-sess')
    expect(router.push).toHaveBeenCalledWith({ name: 'hex-map', params: { sessionId: 'new-sess' } })
  })

  test('fetchUserSessions excludes owned sessions from the joined list', async () => {
    kit.responses.sessions = { data: [{ id: 'owned-1', name: 'Mine' }], error: null }
    kit.responses.session_members = {
      data: [
        { session: { id: 'owned-1', name: 'Mine' } },
        { session: { id: 'joined-1', name: 'Theirs' } },
        { session: null },
      ],
      error: null,
    }
    const store = useSessionStore()
    await store.fetchUserSessions()

    expect(store.userSessions.map(s => s.id)).toEqual(['owned-1'])
    expect(store.joinedSessions.map(s => s.id)).toEqual(['joined-1'])
  })

  test('updateSessionName rolls back on failure', async () => {
    kit.api['post /sessions/sess-1/join'] = sessionRow()
    const store = useSessionStore()
    await store.joinSession('sess-1')

    kit.api['patch /sessions/sess-1'] = new kit.ApiError('nope', 500)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await store.updateSessionName('New Name')

    expect(store.sessionName).toBe('The Sunken Keep')
    errorSpy.mockRestore()
  })

  test('setActiveMapId is optimistic and rolls back on failure', async () => {
    kit.api['post /sessions/sess-1/join'] = sessionRow()
    const store = useSessionStore()
    await store.joinSession('sess-1')

    kit.api['patch /sessions/sess-1'] = new kit.ApiError('nope', 500)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await store.setActiveMapId('map-3')

    expect(store.activeMapId).toBe('map-1')
    errorSpy.mockRestore()
  })

  test('setPlayMode rejects unknown modes without calling the API', async () => {
    const store = useSessionStore()
    const result = await store.setPlayMode('chaos')

    expect(result).toBe(false)
    expect(kit.apiClient.patch).not.toHaveBeenCalled()
  })

  test('setGmInitiative rolls back and reports failure', async () => {
    kit.api['post /sessions/sess-1/join'] = sessionRow({ gm_initiative: 12 })
    const store = useSessionStore()
    await store.joinSession('sess-1')

    kit.api['patch /sessions/sess-1'] = new kit.ApiError('nope', 500)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const ok = await store.setGmInitiative(18)

    expect(ok).toBe(false)
    expect(store.gmInitiative).toBe(12)
    errorSpy.mockRestore()
  })

  test('deleteSession removes the session from the list only when the API succeeds', async () => {
    kit.responses.sessions = { data: [{ id: 'owned-1' }], error: null }
    kit.responses.session_members = { data: [], error: null }
    const store = useSessionStore()
    await store.fetchUserSessions()

    kit.api['delete /sessions/owned-1'] = new kit.ApiError('nope', 500)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await store.deleteSession('owned-1')).toBe(false)
    expect(store.userSessions).toHaveLength(1)

    kit.api['delete /sessions/owned-1'] = null
    expect(await store.deleteSession('owned-1')).toBe(true)
    expect(store.userSessions).toHaveLength(0)
    errorSpy.mockRestore()
  })

  describe('presence', () => {
    test('tracks presence once subscribed and lists online users', async () => {
      const store = useSessionStore()
      store.initPresence('sess-1')
      const channel = kit.channels.find(c => c.name === 'session:sess-1:presence')

      channel.setStatus('SUBSCRIBED')
      expect(channel.track).toHaveBeenCalledWith(expect.objectContaining({ user_id: 'me', display_name: 'Me' }))

      channel.presenceState = () => ({
        me: [{ user_id: 'me', display_name: 'Me' }],
        p1: [{ user_id: 'p1', display_name: 'Player One' }],
      })
      for (const h of channel.handlers) {
        if (h.type === 'presence' && h.filter.event === 'sync') h.callback()
      }

      expect(store.onlineUsers.map(u => u.user_id).sort()).toEqual(['me', 'p1'])
    })

    test('latestJoin fires only after the first sync and never for yourself', async () => {
      const store = useSessionStore()
      store.initPresence('sess-1')
      const channel = kit.channels.find(c => c.name === 'session:sess-1:presence')
      channel.presenceState = () => ({})
      const fire = (event, payload) => {
        for (const h of channel.handlers) {
          if (h.type === 'presence' && h.filter.event === event) h.callback(payload)
        }
      }

      fire('join', { newPresences: [{ user_id: 'p1' }] })
      expect(store.latestJoin).toBeNull()

      fire('sync')
      fire('join', { newPresences: [{ user_id: 'me' }] })
      expect(store.latestJoin).toBeNull()

      fire('join', { newPresences: [{ user_id: 'p2', display_name: 'Player Two' }] })
      expect(store.latestJoin).toMatchObject({ user_id: 'p2' })
    })

    test('cleanupPresence removes the channel and clears the roster', async () => {
      const store = useSessionStore()
      store.initPresence('sess-1')
      const channel = kit.channels.find(c => c.name === 'session:sess-1:presence')
      store.cleanupPresence()

      expect(channel.removed).toBe(true)
      expect(store.onlineUsers).toEqual([])
      expect(store.latestJoin).toBeNull()
    })
  })

  test('cleanup resets all session state', async () => {
    kit.api['post /sessions/sess-1/join'] = sessionRow({ torch_running: true, torch_elapsed_ms: 5000 })
    const store = useSessionStore()
    await store.joinSession('sess-1')
    store.cleanup()

    expect(store.sessionId).toBeNull()
    expect(store.sessionName).toBe('Untitled Campaign')
    expect(store.activeMapId).toBeNull()
    expect(store.torchRunning).toBe(false)
    expect(store.torchElapsedMs).toBe(0)
    expect(kit.channels.every(c => c.removed)).toBe(true)
  })
})
