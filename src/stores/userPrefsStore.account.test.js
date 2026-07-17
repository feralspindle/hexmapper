import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { nextTick } from 'vue'

const state = vi.hoisted(() => ({ prefsResult: { data: null, error: null }, auth: null }))

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

vi.mock('@/stores/authStore.js', async () => {
  const { reactive } = await import('vue')
  return {
    useAuthStore: () => {
      if (!state.auth) state.auth = reactive({ user: { id: 'user-a' }, displayName: 'A' })
      return state.auth
    },
  }
})

vi.mock('@/lib/apiClient.js', () => ({
  apiClient: { put: vi.fn(() => Promise.resolve({})) },
  ApiError: class ApiError extends Error {},
}))

import { apiClient } from '@/lib/apiClient.js'
import { useUserPrefsStore } from './userPrefsStore.js'

describe('userPrefsStore account binding', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    apiClient.put.mockClear()
    state.prefsResult = { data: null, error: null }
    state.auth = null
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
  })

  test('a pending save from account A never lands after switching to account B', async () => {
    const store = useUserPrefsStore()
    await store.load()

    store.setMapStyle('gritty')
    state.auth.user = { id: 'user-b' }
    await nextTick()
    await vi.advanceTimersByTimeAsync(700)

    expect(apiClient.put).not.toHaveBeenCalled()
  })

  test('a pending save from account A never lands after signing out', async () => {
    const store = useUserPrefsStore()
    await store.load()

    store.setMapStyle('gritty')
    state.auth.user = null
    await nextTick()
    await vi.advanceTimersByTimeAsync(700)

    expect(apiClient.put).not.toHaveBeenCalled()
  })

  test('an account switch resets values to defaults and clears the paint cache', async () => {
    const store = useUserPrefsStore()
    await store.load()
    store.setMapStyle('gritty')
    await vi.advanceTimersByTimeAsync(700)
    expect(localStorage.getItem('ds_prefs_v1')).toContain('gritty')

    state.auth.user = { id: 'user-b' }
    await nextTick()

    expect(store.mapStyle).toBe('classic')
    expect(localStorage.getItem('ds_prefs_v1')).toBeNull()
  })

  test('saves still go out for the account that made the change', async () => {
    const store = useUserPrefsStore()
    await store.load()

    store.setMapStyle('gritty')
    await vi.advanceTimersByTimeAsync(700)

    expect(apiClient.put).toHaveBeenCalledTimes(1)
  })
})
