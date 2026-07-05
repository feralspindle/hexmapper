import { supabase } from './supabase'
import {
  accessTokenNeedsRefresh,
  connectionWasStable,
  matchesRealtimeFilter,
  realtimeConnectionIsStale,
  realtimeOperation,
  realtimeSnapshotRefreshNeeded,
  snapshotRefreshDelay,
  REALTIME_TABLES,
} from './realtimeProtocol.js'

export const usingRustRealtime = import.meta.env.VITE_REALTIME_TRANSPORT === 'rust'
const CLIENT_ID = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)
const HEARTBEAT_STALE_MS = 65_000
const PROBE_TIMEOUT_MS = 10_000
const BACKGROUND_REFRESH_MS = 60_000
const TOKEN_REFRESH_MARGIN_S = 30
const STABLE_CONNECTION_MS = 30_000
const SNAPSHOT_REFRESH_MIN_INTERVAL_MS = 10_000

function websocketUrl() {
  const url = new URL(import.meta.env.VITE_API_BASE_URL || '/api', window.location.href)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  url.pathname = `${url.pathname.replace(/\/$/, '')}/realtime`
  return url.toString()
}

class RustChannel {
  constructor(owner, name, options = {}) {
    this.owner = owner
    this.name = name
    this.sessionId = options.sessionId ?? options.config?.sessionId ?? null
    this.reconnect = options.onReconnect ?? null
    this.receiveSelf = options.config?.broadcast?.self === true
    this.handlers = []
    this.statusCallback = null
    this.presences = []
    this.hasPresenceSnapshot = false
    this.subscribed = false
  }

  on(type, filter, callback) {
    this.handlers.push({ type, filter, callback })
    return this
  }

  subscribe(callback) {
    this.statusCallback = callback ?? null
    this.subscribed = true
    this.owner.add(this)
    return this
  }

  async send(message) {
    if (message.type !== 'broadcast') return 'error'
    this.owner.send({
      type: 'publish', session_id: this.sessionId, channel: this.name,
      event: message.event, payload: message.payload ?? {},
    })
    return 'ok'
  }

  async track(payload) {
    this.owner.send({ type: 'presence_track', session_id: this.sessionId, channel: this.name, payload })
    return 'ok'
  }

  async untrack() {
    this.owner.send({ type: 'presence_untrack', session_id: this.sessionId, channel: this.name })
    return 'ok'
  }

  presenceState() {
    return Object.fromEntries(this.presences.map(p => [p.user_id ?? p.connection_id, [p]]))
  }

  dispatch(message) {
    if (message.type === 'broadcast' && message.channel === this.name) {
      if (!this.receiveSelf && message.source_connection_id === this.owner.connectionId) return
      for (const h of this.handlers) {
        if (h.type === 'broadcast' && h.filter?.event === message.event) h.callback({ payload: message.payload })
      }
      return
    }
    if (message.type === 'presence_snapshot' && message.channel === this.name) {
      const before = new Map(this.presences.map(p => [p.user_id ?? p.connection_id, p]))
      const after = new Map(message.presences.map(p => [p.user_id ?? p.connection_id, p]))
      const wasReady = this.hasPresenceSnapshot
      this.presences = message.presences
      this.hasPresenceSnapshot = true
      for (const h of this.handlers) {
        if (h.type !== 'presence') continue
        if (h.filter?.event === 'sync') h.callback()
        if (wasReady && h.filter?.event === 'join') {
          const joined = [...after].filter(([id]) => !before.has(id)).map(([, p]) => p)
          if (joined.length) h.callback({ newPresences: joined })
        }
        if (wasReady && h.filter?.event === 'leave') {
          const left = [...before].filter(([id]) => !after.has(id)).map(([, p]) => p)
          if (left.length) h.callback({ leftPresences: left })
        }
      }
      return
    }
    if (message.type !== 'postgres_change') return
    const table = REALTIME_TABLES[message.aggregate_type]
    const eventType = realtimeOperation(message.event)
    const row = { ...message.payload }
    if (message.source_client && row.source_client == null) row.source_client = message.source_client
    for (const h of this.handlers) {
      if (h.type !== 'postgres_changes' || h.filter?.table !== table) continue
      if (h.filter.event !== '*' && h.filter.event !== eventType) continue
      if (!matchesRealtimeFilter(row, h.filter.filter, eventType === 'DELETE')) continue
      h.callback({ eventType, new: eventType === 'DELETE' ? {} : row, old: eventType === 'DELETE' ? row : {} })
    }
  }
}

class RustRealtime {
  constructor() {
    this.channels = new Set()
    this.sessionRefs = new Map()
    this.subscribedSessions = new Set()
    this.socket = null
    this.ready = false
    this.connecting = null
    this.reconnectAttempt = 0
    this.connectionId = null
    this.readyAt = null
    this.everReady = false
    this.lastMessageAt = 0
    this.pendingProbe = null
    this.hiddenAt = document.visibilityState === 'hidden' ? Date.now() : null
    this.refreshing = null
    this.refreshQueued = false
    this.refreshTimer = null
    this.lastRefreshStartedAt = null
    this.pendingPublishes = []
    this.watchdog = setInterval(() => {
      if (document.visibilityState === 'visible') this.resume()
    }, 15_000)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        this.hiddenAt = Date.now()
        return
      }
      const hiddenFor = this.hiddenAt == null ? 0 : Date.now() - this.hiddenAt
      this.hiddenAt = null
      if (this.resume() && realtimeSnapshotRefreshNeeded(hiddenFor, BACKGROUND_REFRESH_MS)) this.refreshSnapshots()
    })
    window.addEventListener('pageshow', () => this.resume())
    window.addEventListener('online', () => this.resume())
    supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.access_token && this.ready) this.send({ type: 'reauthenticate', token: session.access_token })
    })
  }

  channel(name, options) {
    return new RustChannel(this, name, options)
  }

  _emitStatus() {
    const connected = this.ready || this.channels.size === 0
    window.dispatchEvent(new CustomEvent('hexmap:realtime-status', { detail: { connected } }))
  }

  removeChannel(channel) {
    if (channel.handlers.some(handler => handler.type === 'presence')) {
      channel.untrack()
    }
    channel.subscribed = false
    this.channels.delete(channel)
    if (channel.sessionId) this.releaseSession(channel.sessionId)
    this._emitStatus()
    return Promise.resolve('ok')
  }

  add(channel) {
    if (!channel.sessionId) {
      console.error(`[realtime] channel ${channel.name} has no sessionId`)
      channel.statusCallback?.('CHANNEL_ERROR')
      return
    }
    this.channels.add(channel)
    this.retainSession(channel.sessionId)
    this.connect()
    if (this.subscribedSessions.has(channel.sessionId)) queueMicrotask(() => channel.statusCallback?.('SUBSCRIBED'))
  }

  retainSession(sessionId) {
    const count = this.sessionRefs.get(sessionId) ?? 0
    this.sessionRefs.set(sessionId, count + 1)
    if (count === 0 && this.ready) this.send({ type: 'subscribe', session_id: sessionId })
  }

  releaseSession(sessionId) {
    const count = this.sessionRefs.get(sessionId) ?? 0
    if (count <= 1) {
      this.sessionRefs.delete(sessionId)
      this.subscribedSessions.delete(sessionId)
      if (this.ready) this.send({ type: 'unsubscribe', session_id: sessionId })
    } else this.sessionRefs.set(sessionId, count - 1)
  }

  async connect() {
    if (this.socket || this.connecting || !this.channels.size) return
    this.connecting = this._freshAccessToken()
    const token = await this.connecting
    this.connecting = null
    if (!token || this.socket) return
    const socket = new WebSocket(websocketUrl())
    this.socket = socket
    socket.addEventListener('open', () => socket.send(JSON.stringify({ type: 'authenticate', token, client_id: CLIENT_ID })))
    socket.addEventListener('message', event => {
      let message
      try {
        message = JSON.parse(event.data)
      } catch {
        console.warn('[realtime] unparseable server message')
        return
      }
      try {
        this.handle(message)
      } catch (error) {
        console.warn('[realtime] message handler failed', error)
      }
    })
    socket.addEventListener('close', () => this.closed())
    socket.addEventListener('error', () => socket.close())
  }

  async _freshAccessToken() {
    try {
      const { data } = await supabase.auth.getSession()
      let session = data.session
      if (session && accessTokenNeedsRefresh(session.expires_at, Date.now(), TOKEN_REFRESH_MARGIN_S)) {
        const { data: refreshed, error } = await supabase.auth.refreshSession()
        if (!error && refreshed.session) session = refreshed.session
      }
      return session?.access_token ?? null
    } catch (error) {
      console.warn('[realtime] could not obtain access token', error)
      return null
    }
  }

  handle(message) {
    this.lastMessageAt = Date.now()
    if (message.type === 'heartbeat') return
    if (message.type === 'pong') {
      if (this.pendingProbe?.nonce === message.nonce) this.clearProbe()
      return
    }
    if (message.type === 'ready') {
      this.ready = true
      this.connectionId = message.connection_id
      this.readyAt = Date.now()
      for (const sessionId of this.sessionRefs.keys()) this.send({ type: 'subscribe', session_id: sessionId })
      const queued = this.pendingPublishes
      this.pendingPublishes = []
      for (const message of queued) this.send(message)
      if (this.everReady) {
        queueMicrotask(() => this.refreshSnapshots())
        window.dispatchEvent(new CustomEvent('hexmap:realtime-reconnected'))
      }
      this.everReady = true
      this._emitStatus()
      return
    }
    if (message.type === 'subscribed') {
      this.subscribedSessions.add(message.session_id)
      for (const channel of this.channels) {
        if (channel.sessionId === message.session_id) channel.statusCallback?.('SUBSCRIBED')
      }
      return
    }
    if (message.type === 'unsubscribed') {
      this.subscribedSessions.delete(message.session_id)
      for (const channel of this.channels) {
        if (channel.sessionId !== message.session_id) continue
        channel.hasPresenceSnapshot = false
        channel.presences = []
        channel.statusCallback?.('CLOSED')
      }
      return
    }
    if (message.type === 'error') {
      console.warn('[realtime]', message.code, message.message)
      if (message.code === 'token_expired') void supabase.auth.refreshSession()
      return
    }
    for (const channel of this.channels) channel.dispatch(message)
  }

  send(message) {
    if (!this.ready || this.socket?.readyState !== WebSocket.OPEN) {
      // Broadcast-only events (initiative, loot toasts, undo pushes) have no
      // postgres_changes fallback, so hold them for the next connection instead
      // of dropping them. Cursor positions are stale the moment they're queued.
      if (message.type === 'publish' && message.event !== 'cursor') {
        this.pendingPublishes.push(message)
        if (this.pendingPublishes.length > 32) this.pendingPublishes.shift()
      }
      return
    }
    this.socket.send(JSON.stringify(message))
  }

  resume() {
    if (!this.channels.size) return false
    if (!this.socket) {
      this.connect()
      return false
    }
    if (!this.ready || this.socket.readyState !== WebSocket.OPEN) return false
    if (realtimeConnectionIsStale(this.lastMessageAt, Date.now(), HEARTBEAT_STALE_MS)) {
      console.warn('[realtime] stale connection detected; reconnecting')
      this.socket.close()
      return false
    }
    this.probe()
    return true
  }

  probe() {
    if (this.pendingProbe || !this.ready) return
    const nonce = crypto.randomUUID()
    const timer = setTimeout(() => {
      if (this.pendingProbe?.nonce === nonce) {
        console.warn('[realtime] health probe timed out; reconnecting')
        this.socket?.close()
      }
    }, PROBE_TIMEOUT_MS)
    this.pendingProbe = { nonce, timer }
    this.send({ type: 'probe', nonce })
  }

  clearProbe() {
    if (this.pendingProbe) clearTimeout(this.pendingProbe.timer)
    this.pendingProbe = null
  }

  refreshSnapshots() {
    if (this.refreshing) {
      this.refreshQueued = true
      return this.refreshing
    }
    if (this.refreshTimer) return
    const delay = snapshotRefreshDelay(this.lastRefreshStartedAt, Date.now(), SNAPSHOT_REFRESH_MIN_INTERVAL_MS)
    if (delay > 0) {
      this.refreshTimer = setTimeout(() => {
        this.refreshTimer = null
        this.refreshSnapshots()
      }, delay)
      return
    }
    this.lastRefreshStartedAt = Date.now()
    const refreshes = new Set([...this.channels].map(channel => channel.reconnect).filter(Boolean))
    this.refreshing = Promise.allSettled([...refreshes].map(refresh => refresh()))
      .finally(() => {
        this.refreshing = null
        if (this.refreshQueued) {
          this.refreshQueued = false
          this.refreshSnapshots()
        }
      })
    return this.refreshing
  }

  closed() {
    if (connectionWasStable(this.readyAt, Date.now(), STABLE_CONNECTION_MS)) this.reconnectAttempt = 0
    this.readyAt = null
    this.socket = null
    this.ready = false
    this.connectionId = null
    this.lastMessageAt = 0
    this.clearProbe()
    this.subscribedSessions.clear()
    for (const channel of this.channels) {
      channel.hasPresenceSnapshot = false
      channel.presences = []
      channel.statusCallback?.('CLOSED')
    }
    this._emitStatus()
    if (!this.channels.size) return
    const delay = Math.min(30_000, 500 * 2 ** this.reconnectAttempt++) * (0.75 + Math.random() * 0.5)
    setTimeout(() => this.connect(), delay)
  }
}

const rustRealtime = new RustRealtime()

// E2E hook: Playwright's setOffline blocks new requests but cannot sever an
// established websocket, so the reconnect spec closes it through this handle.
if (usingRustRealtime && typeof window !== 'undefined') {
  window.__hexmapRealtime = rustRealtime
}

export const realtime = usingRustRealtime ? rustRealtime : {
  channel: (name, options) => supabase.channel(name, options),
  removeChannel: channel => supabase.removeChannel(channel),
}
