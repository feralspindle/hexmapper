import { supabase } from '@/lib/supabase'

const BASE_URL = import.meta.env.VITE_API_BASE_URL

// One client id per tab/load, and the frontend build that issued the request —
// both ride along in every event's metadata for forensics.
const CLIENT_ID = crypto.randomUUID()
const APP_VERSION = import.meta.env.VITE_APP_VERSION || 'dev'

export class ApiError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

const REQUEST_TIMEOUT_MS = 15_000

async function request(method, path, body, intent, isRetry = false) {
  const { data: { session } } = await supabase.auth.getSession()
  const requestId = crypto.randomUUID()

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      'X-Request-Id': requestId,
      'X-Client-Id': CLIENT_ID,
      'X-App-Version': APP_VERSION,
      ...(intent ? { 'X-Intent': intent } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })

  // A long-hidden tab can outlive its access token before Supabase's auto-refresh
  // catches up; refresh once and replay rather than failing the first user action.
  if (res.status === 401 && !isRetry) {
    const { error } = await supabase.auth.refreshSession()
    if (!error) return request(method, path, body, intent, true)
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new ApiError(res.status, err.message ?? res.statusText)
  }

  return res.status === 204 ? null : res.json()
}

export const apiClient = {
  get: (path) => request('GET', path),
  post: (path, body, intent) => request('POST', path, body, intent),
  put: (path, body, intent) => request('PUT', path, body, intent),
  patch: (path, body, intent) => request('PATCH', path, body, intent),
  delete: (path, intent) => request('DELETE', path, undefined, intent),
}
