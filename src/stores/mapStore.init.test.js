import { describe, test, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

const state = vi.hoisted(() => ({ mapsResult: { data: [], error: null } }))

vi.mock('@/lib/realtime.js', () => {
  const channel = { on: () => channel, subscribe: () => channel }
  return { realtime: { channel: () => channel, removeChannel: () => {} } }
})

vi.mock('@/stores/sessionStore.js', () => ({
  useSessionStore: () => ({ activeMapId: null }),
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => Promise.resolve(state.mapsResult),
        }),
      }),
    }),
    storage: {
      from: () => ({ createSignedUrl: () => Promise.resolve({ data: null, error: null }) }),
    },
  },
}))

import { useMapStore } from './mapStore.js'

describe('mapStore.init read/write gap', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    state.mapsResult = { data: [], error: null }
  })

  test('returns true and clears loadError on a successful empty read', async () => {
    state.mapsResult = { data: [], error: null }
    const store = useMapStore()
    const ok = await store.init('session-1')
    expect(ok).toBe(true)
    expect(store.loadError).toBeNull()
    expect(store.maps).toEqual([])
  })

  test('returns true and populates maps on a successful non-empty read', async () => {
    state.mapsResult = {
      data: [{ id: 'm1', session_id: 'session-1', created_at: '2026-01-01' }],
      error: null,
    }
    const store = useMapStore()
    const ok = await store.init('session-1')
    expect(ok).toBe(true)
    expect(store.maps).toHaveLength(1)
  })

  test('returns false and sets loadError without inventing an empty map list on a failed read', async () => {
    state.mapsResult = { data: null, error: { message: 'blocked by client' } }
    const store = useMapStore()
    const ok = await store.init('session-1')
    expect(ok).toBe(false)
    expect(store.loadError).toEqual({ message: 'blocked by client' })
    expect(store.maps).toEqual([])
  })

  test('the auto-create guard (mapsLoaded && maps.length === 0) is false when the read failed', async () => {
    state.mapsResult = { data: null, error: { message: 'blocked' } }
    const store = useMapStore()
    const mapsLoaded = await store.init('session-1')
    const wouldAutoCreate = mapsLoaded && store.maps.length === 0
    expect(wouldAutoCreate).toBe(false)
  })

  test('init clears the legacy per-browser map override key', async () => {
    localStorage.setItem('map_view_session-1', 'stale-map-id')
    const store = useMapStore()
    await store.init('session-1')
    expect(localStorage.getItem('map_view_session-1')).toBeNull()
  })
})
