import { describe, test, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { resetKit } from '../../test/helpers/storeTestKit.js'

const kit = vi.hoisted(() => ({ session: { activeMapId: 'm1', setActiveMapId: null } }))

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
vi.mock('@/stores/sessionStore.js', () => ({
  useSessionStore: () => kit.session,
}))

import { useMapStore } from './mapStore.js'

const map = (id, overrides = {}) => ({
  id,
  session_id: 's1',
  name: `Map ${id}`,
  created_at: `2026-01-0${id.at(-1) ?? 1}T00:00:00Z`,
  ...overrides,
})

describe('mapStore behavior', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    resetKit(kit)
    kit.session = { activeMapId: 'm1', setActiveMapId: vi.fn(() => Promise.resolve()), sessionId: 's1' }
  })

  async function initWith(maps) {
    kit.responses.maps = { data: maps, error: null }
    const store = useMapStore()
    await store.init('s1')
    return store
  }

  test('activeMap follows the session activeMapId and getters expose defaults', async () => {
    const store = await initWith([map('m1', { map_hex_width: 120 }), map('m2')])

    expect(store.activeMap.id).toBe('m1')
    expect(store.mapHexWidth).toBe(120)
    expect(store.mapType).toBe('hex')
    expect(store.mapImageRotation).toBe(0)
    expect(store.mapFogRevealAll).toBe(false)
  })

  test('parentMap and childMapsByHexId resolve the map hierarchy', async () => {
    const store = await initWith([
      map('m0'),
      map('m1', { parent_map_id: 'm0', parent_hex_id: 'hex-9' }),
      map('m2', { parent_map_id: 'm0', parent_hex_id: 'hex-9' }),
    ])

    expect(store.parentMap.id).toBe('m0')
    expect(store.childMapsByHexId.get('hex-9').map(m => m.id)).toEqual(['m1', 'm2'])
    expect(store.ancestorChain().map(m => m.id)).toEqual(['m0'])
  })

  test('realtime INSERT adds new maps in created_at order without duplicates', async () => {
    const store = await initWith([map('m2')])
    const channel = kit.channels[0]

    channel.emitPostgres('maps', 'INSERT', map('m1'))
    channel.emitPostgres('maps', 'INSERT', map('m1'))

    expect(store.maps.map(m => m.id)).toEqual(['m1', 'm2'])
  })

  test('realtime UPDATE applies the row but preserves local overrides (map flashing regression)', async () => {
    const store = await initWith([map('m1', { map_hex_width: 96 })])
    const channel = kit.channels[0]

    store.applyLocalPatch({ mapHexWidth: 150 })
    expect(store.mapHexWidth).toBe(150)

    channel.emitPostgres('maps', 'UPDATE', map('m1', { map_hex_width: 96, name: 'Renamed' }))

    expect(store.maps[0].name).toBe('Renamed')
    expect(store.mapHexWidth).toBe(150)
  })

  test('updateActiveMap persists the patch and releases the matching local override', async () => {
    const store = await initWith([map('m1', { map_hex_width: 96 })])
    store.applyLocalPatch({ mapHexWidth: 150 })

    const ok = await store.updateActiveMap({ mapHexWidth: 150, mapScale: 6 })
    expect(ok).toBe(true)
    expect(kit.apiClient.patch).toHaveBeenCalledWith('/maps/m1', { map_hex_width: 150, map_scale: 6 }, 'update_map_settings')

    const channel = kit.channels[0]
    channel.emitPostgres('maps', 'UPDATE', map('m1', { map_hex_width: 150, map_scale: 6 }))
    expect(store.maps[0].map_hex_width).toBe(150)
  })

  test('a failed updateActiveMap returns false and keeps local state untouched', async () => {
    const store = await initWith([map('m1', { map_hex_width: 96 })])
    kit.api['patch /maps/m1'] = new kit.ApiError('nope', 500)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const ok = await store.updateActiveMap({ mapHexWidth: 150 })

    expect(ok).toBe(false)
    expect(store.maps[0].map_hex_width).toBe(96)
    errorSpy.mockRestore()
  })

  test('realtime DELETE drops the map', async () => {
    const store = await initWith([map('m1'), map('m2')])
    kit.channels[0].emitPostgres('maps', 'DELETE', {}, { id: 'm2' })

    expect(store.maps.map(m => m.id)).toEqual(['m1'])
  })

  test('setFogRevealAll is optimistic and reverts on failure', async () => {
    const store = await initWith([map('m1', { fog_reveal_all: false })])
    kit.api['patch /maps/m1'] = new kit.ApiError('nope', 500)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await store.setFogRevealAll(true)

    expect(store.maps[0].fog_reveal_all).toBe(false)
    errorSpy.mockRestore()
  })

  test('createChildMap posts the parent linkage and makes the new map active', async () => {
    kit.api['post /maps'] = body => map('m9', body)
    const store = await initWith([map('m1')])

    const created = await store.createChildMap('hex-3', 'Cavern Level')

    expect(created.id).toBe('m9')
    expect(kit.apiClient.post).toHaveBeenCalledWith('/maps', {
      session_id: 's1',
      name: 'Cavern Level',
      map_type: 'hex',
      parent_map_id: 'm1',
      parent_hex_id: 'hex-3',
    }, 'create_child_map')
    expect(kit.session.setActiveMapId).toHaveBeenCalledWith('m9')
  })

  test('createMap failure returns null and leaves the list unchanged', async () => {
    kit.api['post /maps'] = new kit.ApiError('nope', 500)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const store = await initWith([map('m1')])

    expect(await store.createMap({ name: 'Doomed' })).toBeNull()
    expect(store.maps).toHaveLength(1)
    errorSpy.mockRestore()
  })

  test('refresh reapplies local overrides on top of the server snapshot', async () => {
    const store = await initWith([map('m1', { map_hex_width: 96 })])
    store.applyLocalPatch({ mapHexWidth: 150 })

    kit.responses.maps = { data: [map('m1', { map_hex_width: 96, name: 'From Server' })], error: null }
    await store.refresh()

    expect(store.maps[0].name).toBe('From Server')
    expect(store.maps[0].map_hex_width).toBe(150)
  })

  test('uploadMapImage rejects disallowed types and oversized files before touching storage', async () => {
    const store = await initWith([map('m1')])

    await expect(store.uploadMapImage({ type: 'image/gif', size: 10 })).rejects.toThrow(/JPEG, PNG, and WebP/)
    await expect(store.uploadMapImage({ type: 'image/png', size: 11 * 1024 * 1024 })).rejects.toThrow(/under 10 MB/)
  })

  test('cleanup removes the channel and clears maps and overrides', async () => {
    const store = await initWith([map('m1')])
    store.applyLocalPatch({ mapHexWidth: 150 })
    store.cleanup()

    expect(kit.channels[0].removed).toBe(true)
    expect(store.maps).toEqual([])
  })
})
