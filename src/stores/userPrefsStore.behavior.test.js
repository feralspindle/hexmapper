import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { reactive, nextTick } from 'vue'
import { resetKit } from '../../test/helpers/storeTestKit.js'

const kit = vi.hoisted(() => ({ auth: null }))

vi.mock('@/lib/supabase', async () => {
  const { createSupabaseMock } = await import('../../test/helpers/storeTestKit.js')
  return createSupabaseMock(kit)
})
vi.mock('@/lib/apiClient.js', async () => {
  const { createApiClientMock } = await import('../../test/helpers/storeTestKit.js')
  return createApiClientMock(kit)
})
vi.mock('@/stores/authStore.js', () => ({
  useAuthStore: () => kit.auth,
}))

import { useUserPrefsStore } from './userPrefsStore.js'

describe('userPrefsStore behavior', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    resetKit(kit)
    kit.auth = reactive({ user: { id: 'me' } })
    localStorage.clear()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test('load applies server prefs and caches them for the next visit', async () => {
    kit.responses.user_preferences = {
      data: { dungeon_palette: 'ember', dungeon_map_style: 'sketch' },
      error: null,
    }
    const store = useUserPrefsStore()
    await store.load()

    expect(store.palette).toBe('ember')
    expect(store.mapStyle).toBe('sketch')
    expect(JSON.parse(localStorage.getItem('ds_prefs_v1'))).toMatchObject({ palette: 'ember', mapStyle: 'sketch' })
  })

  test('a cached snapshot seeds the store before any network call', async () => {
    localStorage.setItem('ds_prefs_v1', JSON.stringify({ palette: 'moss', density: 'compact' }))
    const store = useUserPrefsStore()

    expect(store.palette).toBe('moss')
    expect(store.density).toBe('compact')
    expect(store.iconStyle).toBe('filled')
  })

  test('load waits for sign-in and then runs automatically', async () => {
    kit.auth = reactive({ user: null })
    kit.responses.user_preferences = { data: { dungeon_palette: 'ink' }, error: null }
    const store = useUserPrefsStore()
    await store.load()

    expect(kit.queries).toHaveLength(0)

    kit.auth.user = { id: 'me' }
    await nextTick()
    await vi.waitFor(() => {
      if (store.palette !== 'ink') throw new Error('prefs not loaded yet')
    })
  })

  test('rapid setting changes debounce into a single PUT', async () => {
    const store = useUserPrefsStore()
    await store.load()

    store.setPalette('ember')
    store.setDensity('compact')
    store.setIconStyle('outline')
    expect(kit.apiClient.put).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(600)

    expect(kit.apiClient.put).toHaveBeenCalledTimes(1)
    expect(kit.apiClient.put).toHaveBeenCalledWith('/user-preferences', expect.objectContaining({
      dungeon_palette: 'ember',
      dungeon_density: 'compact',
      dungeon_icon_style: 'outline',
    }))
    expect(JSON.parse(localStorage.getItem('ds_prefs_v1'))).toMatchObject({ palette: 'ember' })
  })

  test('a change made before load finishes is saved once the load completes', async () => {
    let resolveLoad
    kit.responses.user_preferences = () => new Promise(resolve => (resolveLoad = () => resolve({ data: null, error: null })))
    const store = useUserPrefsStore()
    const loading = store.load()

    store.setPalette('ember')
    await vi.advanceTimersByTimeAsync(600)
    expect(kit.apiClient.put).not.toHaveBeenCalled()

    resolveLoad()
    await loading
    await vi.advanceTimersByTimeAsync(600)

    expect(kit.apiClient.put).toHaveBeenCalledTimes(1)
  })

  test('a failed save logs but keeps the local preference', async () => {
    kit.api['put /user-preferences'] = new kit.ApiError('nope', 500)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const store = useUserPrefsStore()
    await store.load()

    store.setPalette('ember')
    await vi.advanceTimersByTimeAsync(600)

    expect(store.palette).toBe('ember')
    errorSpy.mockRestore()
  })
})
