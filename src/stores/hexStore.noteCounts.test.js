import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { resetKit } from '../../test/helpers/storeTestKit.js'

const kit = vi.hoisted(() => ({
  session: { isGM: true, hexMode: 'fow' },
  mapStore: {},
}))

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
vi.mock('@/stores/mapStore.js', () => ({
  useMapStore: () => kit.mapStore,
}))
vi.mock('@/router/index.js', () => ({
  default: { push: vi.fn(), currentRoute: { value: { params: {} } } },
}))

import { useHexStore } from './hexStore.js'

const cell = (q, r, overrides = {}) => ({
  id: `cell-${q}-${r}`,
  session_id: 's1',
  map_id: 'm1',
  q,
  r,
  revealed: true,
  ...overrides,
})

function hexChannel() {
  return kit.channels.find(c => c.name === 'map:m1:hex')
}

function hexFetchCount() {
  return kit.apiClient.get.mock.calls.filter(([path]) => path.startsWith('/hex-cells?')).length
}

describe('hexStore note counts', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    resetKit(kit)
    kit.session = { isGM: true, hexMode: 'fow' }
    kit.mapStore = { setFogRevealAll: vi.fn(() => Promise.resolve()) }
    kit.responses.maps = { data: { party_hex_q: null, party_hex_r: null }, error: null }
    localStorage.clear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test('a hex_cells realtime UPDATE without note_count keeps the previous count', async () => {
    kit.api['get /hex-cells?session_id=s1&map_id=m1'] = [cell(0, 0, { note_count: 2 })]
    const store = useHexStore()
    await store.init('s1', 'm1')

    hexChannel().emitPostgres('hex_cells', 'UPDATE', cell(0, 0, { terrain_type: 'desert', source_client: 'other-client' }))

    expect(store.hexCells.get('0:0').terrain_type).toBe('desert')
    expect(store.hexCells.get('0:0').note_count).toBe(2)
  })

  test('players keep note_count through the gm_markers strip', async () => {
    kit.session.isGM = false
    kit.api['get /hex-cells?session_id=s1&map_id=m1'] = [cell(0, 0, { note_count: 1 })]
    const store = useHexStore()
    await store.init('s1', 'm1')

    hexChannel().emitPostgres('hex_cells', 'UPDATE', cell(0, 0, { revealed: true, gm_markers: '["trap"]', source_client: 'other-client' }))

    expect(store.hexCells.get('0:0').gm_markers).toBeUndefined()
    expect(store.hexCells.get('0:0').note_count).toBe(1)
  })

  test('an upsert response without note_count keeps the previous count', async () => {
    kit.api['get /hex-cells?session_id=s1&map_id=m1'] = [cell(0, 0, { note_count: 3 })]
    kit.api['post /hex-cells/upsert'] = body => {
      const echo = { ...body, id: 'server-cell' }
      delete echo.note_count
      return echo
    }
    const store = useHexStore()
    await store.init('s1', 'm1')

    await store.upsertHex(0, 0, { terrain_type: 'forest' })

    expect(store.hexCells.get('0:0').id).toBe('server-cell')
    expect(store.hexCells.get('0:0').note_count).toBe(3)
  })

  test('exploreHex keeps the previous count when the generated cell lacks one', async () => {
    kit.api['get /hex-cells?session_id=s1&map_id=m1'] = [cell(4, 4, { explored: false, note_count: 1 })]
    kit.api['post /hex-cells/explore'] = () => ({ generated: true, cell: cell(4, 4, { explored: true, terrain_type: 'forest' }) })
    const store = useHexStore()
    await store.init('s1', 'm1')

    await store.exploreHex(4, 4)

    expect(store.hexCells.get('4:4').explored).toBe(true)
    expect(store.hexCells.get('4:4').note_count).toBe(1)
  })

  test('a hex_notes realtime event triggers one debounced refetch', async () => {
    vi.useFakeTimers()
    kit.api['get /hex-cells?session_id=s1&map_id=m1'] = [cell(0, 0, { note_count: 0 })]
    const store = useHexStore()
    await store.init('s1', 'm1')
    expect(hexFetchCount()).toBe(1)

    kit.api['get /hex-cells?session_id=s1&map_id=m1'] = [cell(0, 0, { note_count: 1 })]
    hexChannel().emitPostgres('hex_notes', 'INSERT', { id: 'n1', hex_cell_id: 'cell-0-0', session_id: 's1' })
    hexChannel().emitPostgres('hex_notes', 'INSERT', { id: 'n2', hex_cell_id: 'cell-0-0', session_id: 's1' })
    expect(hexFetchCount()).toBe(1)

    await vi.advanceTimersByTimeAsync(150)

    expect(hexFetchCount()).toBe(2)
    expect(store.hexCells.get('0:0').note_count).toBe(1)
  })

  test('noteCountsChanged triggers the same debounced refetch', async () => {
    vi.useFakeTimers()
    kit.api['get /hex-cells?session_id=s1&map_id=m1'] = [cell(0, 0)]
    const store = useHexStore()
    await store.init('s1', 'm1')

    kit.api['get /hex-cells?session_id=s1&map_id=m1'] = [cell(0, 0, { note_count: 5 })]
    store.noteCountsChanged()
    store.noteCountsChanged()
    await vi.advanceTimersByTimeAsync(150)

    expect(hexFetchCount()).toBe(2)
    expect(store.hexCells.get('0:0').note_count).toBe(5)
  })

  test('cleanup cancels a pending note count refetch', async () => {
    vi.useFakeTimers()
    kit.api['get /hex-cells?session_id=s1&map_id=m1'] = [cell(0, 0)]
    const store = useHexStore()
    await store.init('s1', 'm1')

    store.noteCountsChanged()
    store.cleanup()
    await vi.advanceTimersByTimeAsync(150)

    expect(hexFetchCount()).toBe(1)
  })
})
