import { describe, test, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { resetKit } from '../../test/helpers/storeTestKit.js'

const kit = vi.hoisted(() => ({}))

vi.mock('@/lib/supabase', async () => {
  const { createSupabaseMock } = await import('../../test/helpers/storeTestKit.js')
  return createSupabaseMock(kit)
})
vi.mock('@/lib/realtime.js', async () => {
  const { createRealtimeMock } = await import('../../test/helpers/storeTestKit.js')
  return createRealtimeMock(kit)
})
vi.mock('@/lib/apiClient.js', async () => {
  const { createApiClientMock } = await import('../../test/helpers/storeTestKit.js')
  return createApiClientMock(kit)
})
vi.mock('@/stores/authStore.js', () => ({
  useAuthStore: () => ({ user: { id: 'me' } }),
}))

import { usePhotoStore } from './photoStore.js'

const file = (overrides = {}) => ({ name: 'goblin.png', type: 'image/png', size: 1024, ...overrides })

describe('photoStore upload/delete behavior', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    resetKit(kit)
  })

  test('uploadPhoto rejects oversized and unsupported files before touching storage', async () => {
    const store = usePhotoStore()
    await store.init('s1')

    await expect(store.uploadPhoto(file({ size: 11 * 1024 * 1024 }))).rejects.toThrow(/too large/)
    await expect(store.uploadPhoto(file({ type: 'image/tiff' }))).rejects.toThrow(/Unsupported/)

    expect(kit.uploads).toEqual([])
    expect(kit.apiClient.post).not.toHaveBeenCalled()
  })

  test('uploadPhoto stores the file, derives the name from the filename, and prepends the photo', async () => {
    kit.api['post /reference-photos'] = body => ({ id: 'p1', ...body })
    const store = usePhotoStore()
    await store.init('s1')

    const photo = await store.uploadPhoto(file(), '')

    expect(kit.uploads).toHaveLength(1)
    expect(kit.uploads[0].path).toMatch(/^s1\/[0-9a-f-]+\.png$/)
    expect(kit.apiClient.post).toHaveBeenCalledWith('/reference-photos', expect.objectContaining({ name: 'goblin' }))
    expect(photo.url).toContain('https://public.example/')
    expect(store.photos[0].id).toBe('p1')
    expect(store.uploading).toBe(false)
  })

  test('an explicit name wins over the filename', async () => {
    kit.api['post /reference-photos'] = body => ({ id: 'p1', ...body })
    const store = usePhotoStore()
    await store.init('s1')

    await store.uploadPhoto(file(), '  Cave entrance  ')

    expect(kit.apiClient.post).toHaveBeenCalledWith('/reference-photos', expect.objectContaining({ name: 'Cave entrance' }))
  })

  test('a storage failure surfaces the error and resets the uploading flag', async () => {
    kit.uploadResult = { error: new Error('bucket unavailable') }
    const store = usePhotoStore()
    await store.init('s1')

    await expect(store.uploadPhoto(file())).rejects.toThrow('bucket unavailable')

    expect(store.photos).toEqual([])
    expect(store.uploading).toBe(false)
  })

  test('deletePhoto removes from storage and the list, but keeps the photo if the API delete fails', async () => {
    kit.responses.reference_photos = {
      data: [{ id: 'p1', storage_path: 's1/a.png' }, { id: 'p2', storage_path: 's1/b.png' }],
      error: null,
    }
    const store = usePhotoStore()
    await store.init('s1')

    await store.deletePhoto(store.photos[0])
    expect(kit.removals).toContainEqual(['s1/a.png'])
    expect(store.photos.map(p => p.id)).toEqual(['p2'])

    kit.api['delete /reference-photos/p2'] = new kit.ApiError('nope', 500)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await store.deletePhoto(store.photos[0])
    expect(store.photos.map(p => p.id)).toEqual(['p2'])
    errorSpy.mockRestore()
  })

  test('broadcast history keeps only the newest entry per photo_url', async () => {
    kit.responses.photo_broadcasts = {
      data: [
        { id: 'b3', photo_url: 's1/a.png', created_at: '2026-07-03T00:00:00Z' },
        { id: 'b2', photo_url: 's1/b.png', created_at: '2026-07-02T00:00:00Z' },
        { id: 'b1', photo_url: 's1/a.png', created_at: '2026-07-01T00:00:00Z' },
      ],
      error: null,
    }
    const store = usePhotoStore()
    await store.init('s1')

    expect(store.broadcastHistory.map(b => b.id)).toEqual(['b3', 'b2'])
  })

  test('dismissBroadcast clears only the live broadcast, not the history', async () => {
    const store = usePhotoStore()
    await store.init('s1')
    kit.channels[0].emitPostgres('photo_broadcasts', 'INSERT', { id: 'b1', photo_url: 's1/live.png', created_at: '2026-07-04T00:00:00Z' })

    expect(store.currentBroadcast).not.toBeNull()
    store.dismissBroadcast()

    expect(store.currentBroadcast).toBeNull()
    expect(store.broadcastHistory).toHaveLength(1)
  })

  test('re-init for the same session is a no-op', async () => {
    const store = usePhotoStore()
    await store.init('s1')
    const queriesAfterFirst = kit.queries.length
    await store.init('s1')

    expect(kit.queries.length).toBe(queriesAfterFirst)
    expect(kit.channels).toHaveLength(1)
  })
})
