import { describe, test, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

const state = vi.hoisted(() => ({
  results: { reference_photos: { data: [], error: null }, photo_broadcasts: { data: [], error: null } },
  lastPost: null,
  insertHandler: null,
}))

const SIGNED_PREFIX = 'https://test.supabase.co/storage/v1/object/sign/reference-photos/'

vi.mock('@/lib/realtime.js', () => {
  const channel = {
    on: (_evt, _cfg, handler) => { state.insertHandler = handler; return channel },
    subscribe: () => channel,
  }
  return { realtime: { channel: () => channel, removeChannel: () => {} } }
})

vi.mock('@/lib/apiClient.js', () => ({
  apiClient: {
    post: (...args) => { state.lastPost = args; return Promise.resolve({ id: 'evt' }) },
    delete: () => Promise.resolve(),
  },
  ApiError: class ApiError extends Error {},
}))

vi.mock('@/stores/authStore.js', () => ({
  useAuthStore: () => ({ user: { id: 'u1' } }),
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table) => ({
      select: () => ({
        eq: () => ({
          order: () => Promise.resolve(state.results[table]),
        }),
      }),
    }),
    storage: {
      from: () => ({
        createSignedUrl: (path) => Promise.resolve({ data: { signedUrl: SIGNED_PREFIX + path }, error: null }),
        createSignedUrls: (paths) => Promise.resolve({
          data: paths.map(path => ({ path, signedUrl: SIGNED_PREFIX + path })),
          error: null,
        }),
        upload: () => Promise.resolve({ error: null }),
        remove: () => Promise.resolve({ error: null }),
      }),
    },
  },
}))

import { usePhotoStore } from './photoStore.js'
import { clearReferencePhotoUrls } from '@/lib/referencePhotoUrl.js'

describe('photoStore broadcast URL resolution', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    clearReferencePhotoUrls()
    state.results = { reference_photos: { data: [], error: null }, photo_broadcasts: { data: [], error: null } }
    state.lastPost = null
    state.insertHandler = null
  })

  test('a relative stored photo_url is resolved to a signed URL', async () => {
    state.results.photo_broadcasts = {
      data: [{ id: 'b1', photo_url: 's1/img.png', photo_name: 'goblin', created_at: '2026-01-01' }],
      error: null,
    }
    const store = usePhotoStore()
    await store.init('s1')
    expect(store.broadcastHistory[0].photo_url).toBe(SIGNED_PREFIX + 's1/img.png')
  })

  test('a legacy absolute photo_url is re-signed from its embedded storage path', async () => {
    const legacy = 'https://oldref.supabase.co/storage/v1/object/public/reference-photos/s1/img.png'
    state.results.photo_broadcasts = {
      data: [{ id: 'b1', photo_url: legacy, photo_name: 'goblin', created_at: '2026-01-01' }],
      error: null,
    }
    const store = usePhotoStore()
    await store.init('s1')
    expect(store.broadcastHistory[0].photo_url).toBe(SIGNED_PREFIX + 's1/img.png')
  })

  test('a realtime INSERT with a relative photo_url resolves for currentBroadcast and history', async () => {
    const store = usePhotoStore()
    await store.init('s1')
    await state.insertHandler({ new: { id: 'b2', photo_url: 's1/live.png', photo_name: 'slime', created_at: '2026-02-02' } })
    expect(store.currentBroadcast.photo_url).toBe(SIGNED_PREFIX + 's1/live.png')
    expect(store.broadcastHistory[0].photo_url).toBe(SIGNED_PREFIX + 's1/live.png')
  })

  test('broadcastPhoto persists the relative storage_path, never the absolute URL', async () => {
    const store = usePhotoStore()
    await store.init('s1')
    await store.broadcastPhoto({
      id: 'p1',
      name: 'pic',
      storage_path: 's1/pic.png',
      url: SIGNED_PREFIX + 's1/pic.png',
    })
    expect(state.lastPost[0]).toBe('/photo-broadcasts')
    expect(state.lastPost[1].photo_url).toBe('s1/pic.png')
    expect(state.lastPost[1].photo_url).not.toMatch(/^https?:/)
  })
})
