import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest'

const authState = vi.hoisted(() => ({
  session: { access_token: 'token-1', expires_at: Math.floor(Date.now() / 1000) + 3600 },
  authCallbacks: [],
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: () => Promise.resolve({ data: { session: authState.session } }),
      refreshSession: vi.fn(() => Promise.resolve({ data: { session: authState.session }, error: null })),
      onAuthStateChange: cb => {
        authState.authCallbacks.push(cb)
        return { data: { subscription: { unsubscribe: () => {} } } }
      },
    },
    channel: vi.fn(),
    removeChannel: vi.fn(),
  },
}))

class FakeWebSocket {
  static instances = []
  static OPEN = 1
  static CONNECTING = 0
  constructor(url) {
    this.url = url
    this.readyState = FakeWebSocket.CONNECTING
    this.sent = []
    this.listeners = {}
    FakeWebSocket.instances.push(this)
  }
  addEventListener(type, cb) {
    ;(this.listeners[type] ??= []).push(cb)
  }
  send(data) {
    this.sent.push(JSON.parse(data))
  }
  close() {
    this.readyState = 3
    this.emit('close', {})
  }
  emit(type, event) {
    for (const cb of this.listeners[type] ?? []) cb(event)
  }
  open() {
    this.readyState = FakeWebSocket.OPEN
    this.emit('open', {})
  }
  receive(message) {
    this.emit('message', { data: JSON.stringify(message) })
  }
}

async function loadRealtime() {
  vi.resetModules()
  vi.stubEnv('VITE_REALTIME_TRANSPORT', 'rust')
  const module = await import('./realtime.js')
  return module.realtime
}

async function connectedRealtime() {
  const realtime = await loadRealtime()
  const statuses = []
  const channel = realtime
    .channel('session:s1', { sessionId: 's1' })
    .subscribe(status => statuses.push(status))
  await vi.waitFor(() => {
    if (!FakeWebSocket.instances.length) throw new Error('no socket yet')
  })
  const socket = FakeWebSocket.instances.at(-1)
  socket.open()
  socket.receive({ type: 'ready', connection_id: 'conn-1' })
  socket.receive({ type: 'subscribed', session_id: 's1' })
  return { realtime, channel, socket, statuses }
}

beforeEach(() => {
  FakeWebSocket.instances = []
  authState.authCallbacks = []
  authState.session = { access_token: 'token-1', expires_at: Math.floor(Date.now() / 1000) + 3600 }
  globalThis.WebSocket = FakeWebSocket
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.useRealTimers()
})

describe('RustRealtime connection lifecycle', () => {
  test('authenticates on open and subscribes retained sessions on ready', async () => {
    const { socket, statuses } = await connectedRealtime()

    expect(socket.sent[0]).toMatchObject({ type: 'authenticate', token: 'token-1' })
    expect(socket.sent).toContainEqual({ type: 'subscribe', session_id: 's1' })
    expect(statuses).toContain('SUBSCRIBED')
  })

  test('a channel with no sessionId errors instead of subscribing', async () => {
    const realtime = await loadRealtime()
    const statuses = []
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    realtime.channel('broken').subscribe(status => statuses.push(status))

    expect(statuses).toEqual(['CHANNEL_ERROR'])
    expect(FakeWebSocket.instances).toHaveLength(0)
    errorSpy.mockRestore()
  })

  test('first ready does NOT fire the reconnected event; a second ready after close does', async () => {
    const reconnects = []
    window.addEventListener('hexmap:realtime-reconnected', () => reconnects.push(Date.now()))
    const { socket } = await connectedRealtime()
    expect(reconnects).toHaveLength(0)

    vi.useFakeTimers()
    socket.close()
    await vi.advanceTimersByTimeAsync(60_000)
    vi.useRealTimers()

    await vi.waitFor(() => {
      if (FakeWebSocket.instances.length < 2) throw new Error('no reconnect socket')
    })
    const socket2 = FakeWebSocket.instances.at(-1)
    socket2.open()
    socket2.receive({ type: 'ready', connection_id: 'conn-2' })
    await Promise.resolve()

    expect(reconnects).toHaveLength(1)
  })

  test('reconnect re-subscribes sessions and calls each channel onReconnect refresh exactly once', async () => {
    const refresh = vi.fn(() => Promise.resolve())
    const realtime = await loadRealtime()
    realtime.channel('session:s1', { sessionId: 's1', onReconnect: refresh }).subscribe()
    realtime.channel('session:s1:other', { sessionId: 's1', onReconnect: refresh }).subscribe()
    await vi.waitFor(() => {
      if (!FakeWebSocket.instances.length) throw new Error('no socket yet')
    })
    const socket = FakeWebSocket.instances.at(-1)
    socket.open()
    socket.receive({ type: 'ready', connection_id: 'conn-1' })
    expect(refresh).not.toHaveBeenCalled()

    vi.useFakeTimers()
    socket.close()
    await vi.advanceTimersByTimeAsync(60_000)
    vi.useRealTimers()
    await vi.waitFor(() => {
      if (FakeWebSocket.instances.length < 2) throw new Error('no reconnect socket')
    })
    const socket2 = FakeWebSocket.instances.at(-1)
    socket2.open()
    socket2.receive({ type: 'ready', connection_id: 'conn-2' })
    await vi.waitFor(() => {
      if (!refresh.mock.calls.length) throw new Error('refresh not yet called')
    })

    expect(refresh).toHaveBeenCalledTimes(1)
    expect(socket2.sent).toContainEqual({ type: 'subscribe', session_id: 's1' })
  })

  test('close resets presence, notifies channels CLOSED, and emits disconnected status', async () => {
    const { channel, socket, statuses } = await connectedRealtime()
    const statusEvents = []
    window.addEventListener('hexmap:realtime-status', e => statusEvents.push(e.detail.connected))
    socket.receive({ type: 'presence_snapshot', channel: 'session:s1', presences: [{ user_id: 'u1' }] })
    expect(channel.presenceState()).toHaveProperty('u1')

    vi.useFakeTimers()
    socket.close()

    expect(statuses).toContain('CLOSED')
    expect(channel.presenceState()).toEqual({})
    expect(channel.hasPresenceSnapshot).toBe(false)
    expect(statusEvents).toContain(false)
  })

  test('browser offline event tears down without waiting for the socket close event', async () => {
    const { channel, socket, statuses } = await connectedRealtime()
    const statusEvents = []
    window.addEventListener('hexmap:realtime-status', e => statusEvents.push(e.detail.connected))

    // a blackholed connection: close() starts the handshake but the close
    // event never comes back
    socket.close = () => { socket.readyState = 2 }
    vi.useFakeTimers()
    window.dispatchEvent(new Event('offline'))

    expect(statusEvents).toContain(false)
    expect(statuses).toContain('CLOSED')
    expect(channel.hasPresenceSnapshot).toBe(false)
  })

  test('a stale socket\'s late close event does not disturb the replacement connection', async () => {
    const { socket } = await connectedRealtime()
    socket.close = () => { socket.readyState = 2 }

    vi.useFakeTimers()
    window.dispatchEvent(new Event('offline'))
    await vi.advanceTimersByTimeAsync(60_000)
    vi.useRealTimers()
    await vi.waitFor(() => {
      if (FakeWebSocket.instances.length < 2) throw new Error('no reconnect socket')
    })
    const socket2 = FakeWebSocket.instances.at(-1)
    socket2.open()
    socket2.receive({ type: 'ready', connection_id: 'conn-2' })

    const statusEvents = []
    window.addEventListener('hexmap:realtime-status', e => statusEvents.push(e.detail.connected))
    socket.emit('close', {})

    expect(statusEvents).not.toContain(false)
    expect(socket2.sent).toContainEqual({ type: 'subscribe', session_id: 's1' })
  })

  test('removing the last channel for a session unsubscribes it', async () => {
    const { realtime, channel, socket } = await connectedRealtime()
    await realtime.removeChannel(channel)

    expect(socket.sent).toContainEqual({ type: 'unsubscribe', session_id: 's1' })
  })

  test('a second channel on the same session does not unsubscribe until both are removed', async () => {
    const { realtime, channel, socket } = await connectedRealtime()
    const channel2 = realtime.channel('session:s1:dice', { sessionId: 's1' }).subscribe()
    await Promise.resolve()

    await realtime.removeChannel(channel2)
    expect(socket.sent).not.toContainEqual({ type: 'unsubscribe', session_id: 's1' })

    await realtime.removeChannel(channel)
    expect(socket.sent).toContainEqual({ type: 'unsubscribe', session_id: 's1' })
  })

  test('subscribing to an already-subscribed session fires SUBSCRIBED immediately', async () => {
    const { realtime } = await connectedRealtime()
    const statuses = []
    realtime.channel('session:s1:late', { sessionId: 's1' }).subscribe(s => statuses.push(s))
    await new Promise(resolve => queueMicrotask(resolve))

    expect(statuses).toEqual(['SUBSCRIBED'])
  })

  test('token_expired error triggers a session refresh', async () => {
    const { socket } = await connectedRealtime()
    const { supabase } = await import('@/lib/supabase')
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    socket.receive({ type: 'error', code: 'token_expired', message: 'expired' })
    warnSpy.mockRestore()

    expect(supabase.auth.refreshSession).toHaveBeenCalled()
  })

  test('auth state change while connected sends reauthenticate', async () => {
    const { socket } = await connectedRealtime()
    for (const cb of authState.authCallbacks) cb('TOKEN_REFRESHED', { access_token: 'token-2' })

    expect(socket.sent).toContainEqual({ type: 'reauthenticate', token: 'token-2' })
  })

  test('sign-out closes the socket instead of leaving the old identity live', async () => {
    const { realtime, channel, socket } = await connectedRealtime()
    for (const cb of authState.authCallbacks) cb('SIGNED_IN', { access_token: 'token-1', user: { id: 'user-a' } })
    for (const cb of authState.authCallbacks) cb('SIGNED_OUT', null)

    expect(socket.readyState).toBe(3)
    realtime.removeChannel(channel)
  })

  test('an account switch closes the socket rather than reauthenticating across users', async () => {
    const { realtime, channel, socket } = await connectedRealtime()
    for (const cb of authState.authCallbacks) cb('SIGNED_IN', { access_token: 'token-a', user: { id: 'user-a' } })
    const sentBefore = socket.sent.length
    for (const cb of authState.authCallbacks) cb('SIGNED_IN', { access_token: 'token-b', user: { id: 'user-b' } })

    expect(socket.readyState).toBe(3)
    expect(socket.sent.slice(sentBefore)).toEqual([])
    realtime.removeChannel(channel)
  })

  test('heartbeat server time drives token refresh, so a slow local clock cannot delay it', async () => {
    const { socket } = await connectedRealtime()
    const { supabase } = await import('@/lib/supabase')

    // locally the token looks 2 minutes from expiry, but the server clock is
    // 5 minutes ahead of us, so it is already expired server-side
    authState.session.expires_at = Math.floor(Date.now() / 1000) + 120
    socket.receive({ type: 'heartbeat', server_time_ms: Date.now() + 5 * 60_000 })

    await vi.waitFor(() => {
      expect(supabase.auth.refreshSession).toHaveBeenCalled()
    })
  })

  test('heartbeat with an honest clock leaves a fresh token alone', async () => {
    const { socket } = await connectedRealtime()
    const { supabase } = await import('@/lib/supabase')
    supabase.auth.refreshSession.mockClear()

    socket.receive({ type: 'heartbeat', server_time_ms: Date.now() })
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(supabase.auth.refreshSession).not.toHaveBeenCalled()
  })

  test('unparseable and throwing messages do not kill the socket handler', async () => {
    const { channel, socket } = await connectedRealtime()
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    channel.on('broadcast', { event: 'boom' }, () => {
      throw new Error('handler exploded')
    })

    socket.emit('message', { data: 'not json{{' })
    socket.receive({ type: 'broadcast', channel: 'session:s1', event: 'boom', payload: {} })
    socket.receive({ type: 'broadcast', channel: 'session:s1', event: 'boom', payload: {} })

    expect(warnSpy).toHaveBeenCalled()
    expect(socket.readyState).toBe(FakeWebSocket.OPEN)
    warnSpy.mockRestore()
  })
})

describe('RustChannel dispatch', () => {
  test('broadcast from own connection is suppressed unless self-receive is configured', async () => {
    const { realtime, channel, socket } = await connectedRealtime()
    const received = []
    channel.on('broadcast', { event: 'dice' }, ({ payload }) => received.push(payload))

    socket.receive({ type: 'broadcast', channel: 'session:s1', event: 'dice', payload: { n: 1 }, source_connection_id: 'conn-1' })
    expect(received).toEqual([])

    socket.receive({ type: 'broadcast', channel: 'session:s1', event: 'dice', payload: { n: 2 }, source_connection_id: 'other-conn' })
    expect(received).toEqual([{ n: 2 }])

    const selfChannel = realtime.channel('session:s1:self', { sessionId: 's1', config: { broadcast: { self: true } } }).subscribe()
    const selfReceived = []
    selfChannel.on('broadcast', { event: 'dice' }, ({ payload }) => selfReceived.push(payload))
    socket.receive({ type: 'broadcast', channel: 'session:s1:self', event: 'dice', payload: { n: 3 }, source_connection_id: 'conn-1' })
    expect(selfReceived).toEqual([{ n: 3 }])
  })

  test('broadcasts for other channels or other events are ignored', async () => {
    const { channel, socket } = await connectedRealtime()
    const received = []
    channel.on('broadcast', { event: 'dice' }, ({ payload }) => received.push(payload))

    socket.receive({ type: 'broadcast', channel: 'session:s2', event: 'dice', payload: { n: 1 } })
    socket.receive({ type: 'broadcast', channel: 'session:s1', event: 'chat', payload: { n: 2 } })

    expect(received).toEqual([])
  })

  test('presence join/leave only fire after the initial snapshot', async () => {
    const { channel, socket } = await connectedRealtime()
    const joins = []
    const leaves = []
    let syncs = 0
    channel.on('presence', { event: 'sync' }, () => syncs++)
    channel.on('presence', { event: 'join' }, ({ newPresences }) => joins.push(...newPresences))
    channel.on('presence', { event: 'leave' }, ({ leftPresences }) => leaves.push(...leftPresences))

    socket.receive({ type: 'presence_snapshot', channel: 'session:s1', presences: [{ user_id: 'gm' }] })
    expect(syncs).toBe(1)
    expect(joins).toEqual([])

    socket.receive({ type: 'presence_snapshot', channel: 'session:s1', presences: [{ user_id: 'gm' }, { user_id: 'p1' }] })
    expect(joins).toEqual([{ user_id: 'p1' }])

    socket.receive({ type: 'presence_snapshot', channel: 'session:s1', presences: [{ user_id: 'p1' }] })
    expect(leaves).toEqual([{ user_id: 'gm' }])
    expect(syncs).toBe(3)
  })

  test('postgres_change routes by table, event, and filter, with DELETE rows in old', async () => {
    const { channel, socket } = await connectedRealtime()
    const inserts = []
    const deletes = []
    const filtered = []
    channel.on('postgres_changes', { table: 'hex_cells', event: 'INSERT', filter: 'session_id=eq.s1' }, e => inserts.push(e))
    channel.on('postgres_changes', { table: 'hex_cells', event: 'DELETE', filter: 'session_id=eq.s1' }, e => deletes.push(e))
    channel.on('postgres_changes', { table: 'hex_cells', event: '*', filter: 'session_id=eq.other' }, e => filtered.push(e))

    socket.receive({ type: 'postgres_change', aggregate_type: 'hex_cell', event: 'hex_cell.created', payload: { id: 'h1', session_id: 's1' } })
    socket.receive({ type: 'postgres_change', aggregate_type: 'hex_cell', event: 'hex_cell.deleted', payload: { id: 'h1', session_id: 's1' } })

    expect(inserts).toHaveLength(1)
    expect(inserts[0].new).toMatchObject({ id: 'h1' })
    expect(deletes).toHaveLength(1)
    expect(deletes[0].old).toMatchObject({ id: 'h1' })
    expect(deletes[0].new).toEqual({})
    expect(filtered).toEqual([])
  })

  test('postgres_change carries source_client into the row for echo suppression', async () => {
    const { channel, socket } = await connectedRealtime()
    const rows = []
    channel.on('postgres_changes', { table: 'hex_cells', event: '*', filter: 'session_id=eq.s1' }, e => rows.push(e.new))

    socket.receive({ type: 'postgres_change', aggregate_type: 'hex_cell', event: 'hex_cell.updated', payload: { id: 'h1', session_id: 's1' }, source_client: 'client-abc' })

    expect(rows[0].source_client).toBe('client-abc')
  })

  test('send publishes broadcasts and rejects non-broadcast messages', async () => {
    const { channel, socket } = await connectedRealtime()
    const ok = await channel.send({ type: 'broadcast', event: 'dice', payload: { n: 6 } })
    const bad = await channel.send({ type: 'presence' })

    expect(ok).toBe('ok')
    expect(bad).toBe('error')
    expect(socket.sent).toContainEqual({ type: 'publish', session_id: 's1', channel: 'session:s1', event: 'dice', payload: { n: 6 } })
  })
})

describe('snapshot refresh throttling', () => {
  test('refreshes within the min interval are deferred, not dropped', async () => {
    vi.useFakeTimers()
    const refresh = vi.fn(() => Promise.resolve())
    const realtime = await loadRealtime()
    realtime.channel('session:s1', { sessionId: 's1', onReconnect: refresh }).subscribe()
    await vi.advanceTimersByTimeAsync(0)
    const socket = FakeWebSocket.instances.at(-1)
    socket.open()
    socket.receive({ type: 'ready', connection_id: 'c1' })

    realtime.refreshSnapshots()
    await vi.advanceTimersByTimeAsync(0)
    expect(refresh).toHaveBeenCalledTimes(1)

    realtime.refreshSnapshots()
    await vi.advanceTimersByTimeAsync(0)
    expect(refresh).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(10_000)
    expect(refresh).toHaveBeenCalledTimes(2)
  })

  test('a refresh requested during an in-flight refresh runs again afterwards', async () => {
    vi.useFakeTimers()
    let resolveFirst
    const refresh = vi.fn(() => new Promise(resolve => (resolveFirst = resolve)))
    const realtime = await loadRealtime()
    realtime.channel('session:s1', { sessionId: 's1', onReconnect: refresh }).subscribe()
    await vi.advanceTimersByTimeAsync(0)
    const socket = FakeWebSocket.instances.at(-1)
    socket.open()
    socket.receive({ type: 'ready', connection_id: 'c1' })

    realtime.refreshSnapshots()
    expect(refresh).toHaveBeenCalledTimes(1)
    realtime.refreshSnapshots()
    resolveFirst()
    await vi.advanceTimersByTimeAsync(10_000)

    expect(refresh).toHaveBeenCalledTimes(2)
  })
})
