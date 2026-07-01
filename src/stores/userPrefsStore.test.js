import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

const state = vi.hoisted(() => ({ prefsResult: { data: null, error: null } }))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve(state.prefsResult),
        }),
      }),
    }),
  },
}))

vi.mock('@/stores/authStore.js', () => ({
  useAuthStore: () => ({ user: { id: 'u1' }, displayName: 'Tester' }),
}))

vi.mock('@/lib/apiClient.js', () => ({
  apiClient: { put: vi.fn(() => Promise.resolve({})) },
  ApiError: class ApiError extends Error {},
}))

import { apiClient } from '@/lib/apiClient.js'
import { useUserPrefsStore } from './userPrefsStore.js'

describe('userPrefsStore read/write gap', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    apiClient.put.mockClear()
    state.prefsResult = { data: null, error: null }
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
  })

  test('a failed prefs read does NOT let a later save overwrite the server with local defaults', async () => {
    state.prefsResult = { data: null, error: { message: 'blocked by client' } }
    const store = useUserPrefsStore()
    await store.load()

    store.setMapStyle('classic')
    await vi.advanceTimersByTimeAsync(700)

    expect(apiClient.put).not.toHaveBeenCalled()
  })

  test('a successful (empty) read marks loaded so genuine edits still save', async () => {
    state.prefsResult = { data: null, error: null }
    const store = useUserPrefsStore()
    await store.load()

    store.setMapStyle('candlelit')
    await vi.advanceTimersByTimeAsync(700)

    expect(apiClient.put).toHaveBeenCalledTimes(1)
  })
})
