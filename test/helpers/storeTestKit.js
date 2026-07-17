import { vi } from 'vitest'

export function chainableQuery(getResponse) {
  const calls = []
  const proxy = new Proxy({}, {
    get(_, prop) {
      if (prop === 'then') {
        const res = Promise.resolve(getResponse(calls))
        return res.then.bind(res)
      }
      return (...args) => {
        calls.push([prop, ...args])
        return proxy
      }
    },
  })
  return proxy
}

export function createSupabaseMock(kit) {
  kit.responses ??= {}
  kit.queries ??= []
  return {
    supabase: {
      from(table) {
        return chainableQuery(calls => {
          kit.queries.push({ table, calls })
          const response = kit.responses[table]
          if (typeof response === 'function') return response(calls)
          return response ?? { data: [], error: null }
        })
      },
      auth: {
        getSession: () => Promise.resolve({ data: { session: null } }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      },
      storage: {
        from: () => ({
          createSignedUrl: path => Promise.resolve({ data: { signedUrl: `https://signed.example/${path}` }, error: null }),
          createSignedUrls: paths => Promise.resolve({
            data: paths.map(path => ({ path, signedUrl: `https://signed.example/${path}` })),
            error: null,
          }),
          getPublicUrl: path => ({ data: { publicUrl: `https://public.example/${path}` } }),
          upload: (path, file, options) => {
            ;(kit.uploads ??= []).push({ path, file, options })
            return Promise.resolve(kit.uploadResult ?? { data: { path }, error: null })
          },
          remove: paths => {
            ;(kit.removals ??= []).push(paths)
            return Promise.resolve({ data: null, error: null })
          },
        }),
      },
    },
  }
}

export function createRealtimeMock(kit) {
  kit.channels ??= []
  function channel(name, options = {}) {
    const ch = {
      name,
      options,
      handlers: [],
      statusCallback: null,
      removed: false,
      on(type, filter, callback) {
        ch.handlers.push({ type, filter, callback })
        return ch
      },
      subscribe(callback) {
        ch.statusCallback = callback ?? null
        kit.channels.push(ch)
        return ch
      },
      send: vi.fn(() => Promise.resolve('ok')),
      track: vi.fn(() => Promise.resolve('ok')),
      untrack: vi.fn(() => Promise.resolve('ok')),
      presenceState: () => ({}),
      emitPostgres(table, eventType, row, oldRow = {}) {
        const results = []
        for (const h of ch.handlers) {
          if (h.type !== 'postgres_changes') continue
          if (h.filter?.table !== table) continue
          if (h.filter.event !== '*' && h.filter.event !== eventType) continue
          results.push(h.callback({ eventType, new: row, old: oldRow }))
        }
        return Promise.all(results)
      },
      emitBroadcast(event, payload) {
        for (const h of ch.handlers) {
          if (h.type === 'broadcast' && h.filter?.event === event) h.callback({ payload })
        }
      },
      setStatus(status) {
        ch.statusCallback?.(status)
      },
      reconnect() {
        return ch.options.onReconnect?.()
      },
    }
    return ch
  }
  return {
    realtime: {
      channel,
      removeChannel: ch => {
        ch.removed = true
        return Promise.resolve('ok')
      },
    },
    usingRustRealtime: true,
  }
}

export function resetKit(kit) {
  kit.responses = {}
  kit.queries = []
  kit.channels = []
  kit.api = {}
  kit.uploads = []
  kit.removals = []
  kit.uploadResult = null
  if (kit.apiClient) {
    for (const fn of Object.values(kit.apiClient)) fn.mockClear()
  }
}

export function createApiClientMock(kit) {
  kit.api ??= {}
  class ApiError extends Error {
    constructor(message, status) {
      super(message)
      this.status = status
    }
  }
  const call = method => vi.fn((path, body) => {
    const handler = kit.api[`${method} ${path}`] ?? kit.api[method]
    if (typeof handler === 'function') return Promise.resolve(handler(body, path))
    if (handler instanceof Error) return Promise.reject(handler)
    return Promise.resolve(handler ?? null)
  })
  const apiClient = { get: call('get'), post: call('post'), put: call('put'), patch: call('patch'), delete: call('delete') }
  kit.apiClient = apiClient
  kit.ApiError = ApiError
  return { apiClient, ApiError }
}
