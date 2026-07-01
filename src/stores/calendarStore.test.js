import { describe, test, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

const state = vi.hoisted(() => ({
  settingsRes: { data: null, error: null },
  daysRes: { data: [], error: null },
}))

vi.mock('@/lib/realtime.js', () => {
  const channel = { on: () => channel, subscribe: () => channel }
  return { realtime: { channel: () => channel, removeChannel: () => {} } }
})

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table) => {
      if (table === 'party_calendar_settings') {
        return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve(state.settingsRes) }) }) }
      }
      return { select: () => ({ eq: () => ({ eq: () => Promise.resolve(state.daysRes) }) }) }
    },
  },
}))

vi.mock('@/lib/apiClient.js', () => ({
  apiClient: { put: vi.fn(() => Promise.resolve(null)), post: vi.fn(() => Promise.resolve(null)) },
  ApiError: class ApiError extends Error {},
}))

import { apiClient } from '@/lib/apiClient.js'
import { useCalendarStore } from './calendarStore.js'

describe('calendarStore read/write gap', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    apiClient.put.mockClear()
    state.settingsRes = { data: null, error: null }
    state.daysRes = { data: [], error: null }
  })

  test('updateSettings does NOT overwrite shared settings when the settings read failed', async () => {
    state.settingsRes = { data: null, error: { message: 'blocked by client' } }
    const store = useCalendarStore()
    await store.init('s1')

    await store.updateSettings({ year_prefix: 'Age of ' })

    expect(apiClient.put).not.toHaveBeenCalled()
  })

  test('updateSettings saves once the settings read has succeeded', async () => {
    state.settingsRes = { data: null, error: null }
    const store = useCalendarStore()
    await store.init('s1')

    await store.updateSettings({ year_prefix: 'Age of ' })

    expect(apiClient.put).toHaveBeenCalledTimes(1)
  })

  test('a failed day read is not memoized, so a later ensureYear retries and loads', async () => {
    const store = useCalendarStore()
    await store.init('s1')

    state.daysRes = { data: null, error: { message: 'blocked by client' } }
    await store.ensureYear(5)
    expect(store.days.find(d => d.year === 5)).toBeUndefined()

    state.daysRes = { data: [{ id: 'd5', session_id: 's1', year: 5, month: 1, day: 1 }], error: null }
    await store.ensureYear(5)
    expect(store.days.find(d => d.year === 5)).toBeTruthy()
  })
})
