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

  test('a join that resolves after navigation cannot clobber the newer session', async () => {
    let resolveSlow
    kit.api['post /sessions/slow/join'] = () => new Promise(resolve => { resolveSlow = resolve })
    kit.api['post /sessions/sess-1/join'] = sessionRow()
    const store = useSessionStore()

    const slowJoin = store.joinSession('slow')
    await store.joinSession('sess-1')
    resolveSlow(sessionRow({ id: 'slow', name: 'Stale Keep' }))
    await slowJoin

    expect(store.sessionId).toBe('sess-1')
    expect(store.sessionName).toBe('The Sunken Keep')
    expect(kit.channels.filter(c => !c.removed).map(c => c.name)).toEqual(['session:sess-1:config'])
  })

  test('a join that resolves after cleanup cannot reopen the old channel', async () => {
    let resolveSlow
    kit.api['post /sessions/slow/join'] = () => new Promise(resolve => { resolveSlow = resolve })
    const store = useSessionStore()

    const slowJoin = store.joinSession('slow')
    store.cleanup()
    resolveSlow(sessionRow({ id: 'slow' }))
    await slowJoin

    expect(store.sessionId).toBeNull()
    expect(kit.channels.filter(c => !c.removed)).toEqual([])
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

  test('a session UPDATE echo cannot stomp a field with our own write in flight', async () => {
    kit.api['post /sessions/sess-1/join'] = sessionRow()
    let resolvePatch
    kit.api['patch /sessions/sess-1'] = () => new Promise(resolve => { resolvePatch = resolve })
    const store = useSessionStore()
    await store.joinSession('sess-1')
    const configChannel = kit.channels.find(c => c.name === 'session:sess-1:config')

    const write = store.setGmInitiative(15)

    // the echo carries the whole row, so it holds the pre-write value for our
    // field - it must not stomp it, but other fields still apply
    configChannel.emitPostgres('sessions', 'UPDATE', { gm_initiative: null, torch_running: true })
    expect(store.gmInitiative).toBe(15)
    expect(store.torchRunning).toBe(true)

    resolvePatch({})
    await write
    // once the write lands, echoes for the field apply again
    configChannel.emitPostgres('sessions', 'UPDATE', { gm_initiative: 3 })
    expect(store.gmInitiative).toBe(3)
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

  test('leaveSession removes the joined session from the list only when the API succeeds', async () => {
    kit.responses.sessions = { data: [], error: null }
    kit.responses.session_members = { data: [{ session: { id: 'joined-1', name: 'Theirs' } }], error: null }
    const store = useSessionStore()
    await store.fetchUserSessions()

    kit.api['post /sessions/joined-1/leave'] = new kit.ApiError('nope', 500)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await store.leaveSession('joined-1')).toBe(false)
    expect(store.joinedSessions).toHaveLength(1)

    kit.api['post /sessions/joined-1/leave'] = null
    expect(await store.leaveSession('joined-1')).toBe(true)
    expect(store.joinedSessions).toHaveLength(0)
    errorSpy.mockRestore()
  })

  test('initiativeOp applies the returned state and realtime carries it to others', async () => {
    kit.api['post /sessions/sess-1/join'] = sessionRow()
    const store = useSessionStore()
    await store.joinSession('sess-1')

    const next = { entries: [{ id: 'e1', name: 'Goblin 1', initiative: 12 }], active_id: null, round: 1 }
    kit.api['post /sessions/sess-1/initiative'] = next
    await store.initiativeOp('add', { name: 'Goblin', count: 1 })
    expect(store.initiativeState.entries).toHaveLength(1)

    const configChannel = kit.channels.find(c => c.name === 'session:sess-1:config')
    configChannel.emitPostgres('sessions', 'UPDATE', {
      initiative_state: { entries: [], active_id: null, round: 1 },
    })
    expect(store.initiativeState.entries).toHaveLength(0)
  })

  test('advanceCrawlRound is optimistic and reverts on failure', async () => {
    kit.api['post /sessions/sess-1/join'] = sessionRow({ crawl_round: 4 })
    const store = useSessionStore()
    await store.joinSession('sess-1')
    expect(store.crawlRound).toBe(4)

    kit.api['post /sessions/sess-1/crawl-round'] = { session: { crawl_round: 5 }, encounter: null }
    await store.advanceCrawlRound()
    expect(store.crawlRound).toBe(5)

    kit.api['post /sessions/sess-1/crawl-round'] = new kit.ApiError('nope', 500)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await store.advanceCrawlRound()
    expect(store.crawlRound).toBe(5)
    errorSpy.mockRestore()
  })

  test('a session UPDATE carries the crawl round to every client', async () => {
    kit.api['post /sessions/sess-1/join'] = sessionRow()
    const store = useSessionStore()
    await store.joinSession('sess-1')

    const configChannel = kit.channels.find(c => c.name === 'session:sess-1:config')
    configChannel.emitPostgres('sessions', 'UPDATE', { crawl_round: 7, crawl_check_every: 4 })

    expect(store.crawlRound).toBe(7)
    expect(store.crawlCheckEvery).toBe(4)
  })

  test('travel applies the returned state and realtime carries it', async () => {
    kit.api['post /sessions/sess-1/join'] = sessionRow({ travel_state: { enabled: true, fraction: 0 } })
    const store = useSessionStore()
    await store.joinSession('sess-1')
    expect(store.travelState.enabled).toBe(true)

    kit.api['post /sessions/sess-1/travel'] = {
      travel_state: { enabled: true, fraction: 0.5 },
      moved: true,
      days_advanced: 0,
    }
    const result = await store.travel('move', { terrain: 'plains' })
    expect(result.moved).toBe(true)
    expect(store.travelState.fraction).toBe(0.5)

    const configChannel = kit.channels.find(c => c.name === 'session:sess-1:config')
    configChannel.emitPostgres('sessions', 'UPDATE', { travel_state: { enabled: true, fraction: 0 } })
    expect(store.travelState.fraction).toBe(0)
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
