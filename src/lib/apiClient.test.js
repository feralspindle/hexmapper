import { describe, test, expect, beforeEach, vi } from 'vitest'

const state = vi.hoisted(() => ({ session: { access_token: 'jwt-token' } }))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: () => Promise.resolve({ data: { session: state.session } }),
    },
  },
}))

import { apiClient, ApiError } from './apiClient.js'

function mockFetch(response) {
  const fetchSpy = vi.fn(() => Promise.resolve(response))
  globalThis.fetch = fetchSpy
  return fetchSpy
}

const okJson = body => ({
  ok: true,
  status: 200,
  json: () => Promise.resolve(body),
})

describe('apiClient', () => {
  beforeEach(() => {
    state.session = { access_token: 'jwt-token' }
  })

  test('sends auth, request id, client id, and intent headers', async () => {
    const fetchSpy = mockFetch(okJson({ id: 1 }))

    await apiClient.post('/dice-rolls', { d20: 1 }, 'roll_dice')

    const [url, options] = fetchSpy.mock.calls[0]
    expect(url).toBe('http://localhost:8080/api/dice-rolls')
    expect(options.method).toBe('POST')
    expect(options.headers.Authorization).toBe('Bearer jwt-token')
    expect(options.headers['X-Intent']).toBe('roll_dice')
    expect(options.headers['X-Request-Id']).toMatch(/^[0-9a-f-]{36}$/)
    expect(options.headers['X-Client-Id']).toBeTruthy()
    expect(JSON.parse(options.body)).toEqual({ d20: 1 })
  })

  test('omits the auth header and intent when absent', async () => {
    state.session = null
    const fetchSpy = mockFetch(okJson([]))

    await apiClient.get('/hex-cells')

    const [, options] = fetchSpy.mock.calls[0]
    expect(options.headers.Authorization).toBeUndefined()
    expect(options.headers['X-Intent']).toBeUndefined()
    expect(options.body).toBeUndefined()
  })

  test('non-2xx responses throw ApiError with the server message and status', async () => {
    mockFetch({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
      json: () => Promise.resolve({ message: 'not a member of this session' }),
    })

    const error = await apiClient.delete('/sessions/s1').catch(e => e)

    expect(error).toBeInstanceOf(ApiError)
    expect(error.status).toBe(403)
    expect(error.message).toBe('not a member of this session')
  })

  test('falls back to statusText when the error body is not JSON', async () => {
    mockFetch({
      ok: false,
      status: 502,
      statusText: 'Bad Gateway',
      json: () => Promise.reject(new Error('not json')),
    })

    const error = await apiClient.get('/maps').catch(e => e)

    expect(error.message).toBe('Bad Gateway')
  })

  test('a 204 response resolves to null', async () => {
    mockFetch({ ok: true, status: 204, json: () => Promise.reject(new Error('no body')) })

    expect(await apiClient.delete('/hex-notes/n1')).toBeNull()
  })
})
