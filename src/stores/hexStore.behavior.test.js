import { describe, test, expect, beforeEach, vi } from 'vitest'
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

import router from '@/router/index.js'
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

describe('hexStore behavior', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    resetKit(kit)
    kit.session = { isGM: true, hexMode: 'fow' }
    kit.mapStore = { setFogRevealAll: vi.fn(() => Promise.resolve()) }
    kit.responses.maps = { data: { party_hex_q: null, party_hex_r: null }, error: null }
    vi.mocked(router.push).mockClear()
    localStorage.clear()
  })

  test('GM init loads all cells straight from supabase', async () => {
    kit.responses.hex_cells = { data: [cell(0, 0), cell(1, 2)], error: null }
    const store = useHexStore()
    await store.init('s1', 'm1')

    expect(store.hexCells.size).toBe(2)
    expect(store.hexCells.get('1:2').id).toBe('cell-1-2')
    expect(kit.apiClient.get).not.toHaveBeenCalled()
  })

  test('player init fetches the redacted view through the API', async () => {
    kit.session.isGM = false
    kit.api['get /hex-cells?session_id=s1&map_id=m1'] = [cell(0, 0)]
    const store = useHexStore()
    await store.init('s1', 'm1')

    expect(store.hexCells.size).toBe(1)
    expect(kit.queries.filter(q => q.table === 'hex_cells')).toHaveLength(0)
  })

  test('selectHex toggles selection and selectedCell resolves from the grid', async () => {
    kit.responses.hex_cells = { data: [cell(3, 4, { label: 'Ruins' })], error: null }
    const store = useHexStore()
    await store.init('s1', 'm1')

    store.selectHex(3, 4)
    expect(store.selectedCell.label).toBe('Ruins')

    store.selectHex(3, 4)
    expect(store.selectedHex).toBeNull()
  })

  test('upsertHex is optimistic, keeps server result, and broadcasts a refresh', async () => {
    kit.api['post /hex-cells/upsert'] = body => ({ ...body, id: 'server-cell' })
    const store = useHexStore()
    await store.init('s1', 'm1')

    await store.upsertHex(0, 0, { terrain_type: 'forest' })

    const stored = store.hexCells.get('0:0')
    expect(stored.id).toBe('server-cell')
    expect(stored.terrain_type).toBe('forest')
    expect(hexChannel().send).toHaveBeenCalledWith(expect.objectContaining({ event: 'refresh' }))
  })

  test('a failed upsert rolls back to the previous cell (or removes a new one)', async () => {
    kit.responses.hex_cells = { data: [cell(0, 0, { terrain_type: 'plains' })], error: null }
    const store = useHexStore()
    await store.init('s1', 'm1')

    kit.api['post /hex-cells/upsert'] = new kit.ApiError('nope', 500)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await store.upsertHex(0, 0, { terrain_type: 'volcanic' })
    expect(store.hexCells.get('0:0').terrain_type).toBe('plains')

    await store.upsertHex(9, 9, { terrain_type: 'swamp' })
    expect(store.hexCells.has('9:9')).toBe(false)
    errorSpy.mockRestore()
  })

  test('a stale server response cannot clobber a newer local edit (in-flight guard)', async () => {
    let calls = 0
    let resolveFirst
    kit.api['post /hex-cells/upsert'] = body => {
      calls += 1
      if (calls === 1) return new Promise(resolve => (resolveFirst = () => resolve({ ...body, id: 'first-server' })))
      return { ...body, id: 'second-server' }
    }
    const store = useHexStore()
    await store.init('s1', 'm1')

    const first = store.upsertHex(0, 0, { terrain_type: 'forest' })
    await store.upsertHex(0, 0, { terrain_type: 'desert' })
    resolveFirst()
    await first

    expect(store.hexCells.get('0:0').id).toBe('second-server')
    expect(store.hexCells.get('0:0').terrain_type).toBe('desert')
  })

  test('in blank mode a plain edit is stored as revealed', async () => {
    kit.session.hexMode = 'blank'
    kit.api['post /hex-cells/upsert'] = body => ({ ...body, id: 'server-cell' })
    const store = useHexStore()
    await store.init('s1', 'm1')

    await store.upsertHex(0, 0, { terrain_type: 'forest' })

    expect(kit.apiClient.post).toHaveBeenCalledWith(
      '/hex-cells/upsert',
      expect.objectContaining({ revealed: true }),
      'edit_hex',
    )
  })

  test('upsert preserves local gm_markers when the redacted echo omits them', async () => {
    kit.api['post /hex-cells/upsert'] = body => ({ ...body, id: 'server-cell', gm_markers: null })
    const store = useHexStore()
    await store.init('s1', 'm1')

    await store.upsertHex(0, 0, { gm_markers: '[{"id":"g1","kind":"trap","label":""}]' })

    expect(store.hexCells.get('0:0').gm_markers).toContain('trap')
  })

  test('realtime UPDATE from this client is ignored; from others it is applied', async () => {
    kit.api['post /hex-cells/upsert'] = body => ({ ...body, id: 'server-cell' })
    const store = useHexStore()
    await store.init('s1', 'm1')
    await store.upsertHex(0, 0, { terrain_type: 'forest' })
    const clientId = kit.apiClient.post.mock.calls[0][1].source_client

    hexChannel().emitPostgres('hex_cells', 'UPDATE', cell(0, 0, { terrain_type: 'desert', source_client: clientId }))
    expect(store.hexCells.get('0:0').terrain_type).toBe('forest')

    hexChannel().emitPostgres('hex_cells', 'UPDATE', cell(0, 0, { terrain_type: 'desert', source_client: 'other-client' }))
    expect(store.hexCells.get('0:0').terrain_type).toBe('desert')
  })

  test('players receive hidden cells as sentinels and never see gm_markers', async () => {
    kit.session.isGM = false
    kit.api['get /hex-cells?session_id=s1&map_id=m1'] = []
    const store = useHexStore()
    await store.init('s1', 'm1')

    hexChannel().emitPostgres('hex_cells', 'UPDATE', cell(0, 0, { revealed: false, label: 'Secret Fort', gm_markers: '[]' }))
    expect(store.hexCells.get('0:0')).toEqual({ session_id: 's1', map_id: 'm1', q: 0, r: 0, revealed: false })

    hexChannel().emitPostgres('hex_cells', 'UPDATE', cell(1, 1, { revealed: true, gm_markers: '["trap"]' }))
    expect(store.hexCells.get('1:1').gm_markers).toBeUndefined()
    expect(store.hexCells.get('1:1').revealed).toBe(true)
  })

  test('realtime DELETE removes the cell', async () => {
    kit.responses.hex_cells = { data: [cell(0, 0)], error: null }
    const store = useHexStore()
    await store.init('s1', 'm1')

    hexChannel().emitPostgres('hex_cells', 'DELETE', {}, { q: 0, r: 0 })

    expect(store.hexCells.size).toBe(0)
  })

  test('toggleRevealed sends the reveal intent with the flipped value', async () => {
    kit.responses.hex_cells = { data: [cell(0, 0, { revealed: false })], error: null }
    kit.api['post /hex-cells/upsert'] = body => ({ ...body, id: 'server-cell' })
    const store = useHexStore()
    await store.init('s1', 'm1')

    await store.toggleRevealed(0, 0)

    expect(kit.apiClient.post).toHaveBeenCalledWith(
      '/hex-cells/upsert',
      expect.objectContaining({ revealed: true }),
      'reveal_hex',
    )
  })

  test('revealAll flips every cell, updates map fog, and posts one bulk call', async () => {
    kit.responses.hex_cells = { data: [cell(0, 0, { revealed: false }), cell(1, 1, { revealed: false })], error: null }
    const store = useHexStore()
    await store.init('s1', 'm1')

    await store.revealAll()

    expect([...store.hexCells.values()].every(c => c.revealed)).toBe(true)
    expect(kit.mapStore.setFogRevealAll).toHaveBeenCalledWith(true)
    expect(kit.apiClient.post).toHaveBeenCalledWith(
      '/hex-cells/bulk-reveal',
      { session_id: 's1', map_id: 'm1', revealed: true },
      'reveal_all_hexes',
    )
  })

  test('a failed bulk reveal re-syncs from the server instead of trusting local state', async () => {
    kit.responses.hex_cells = { data: [cell(0, 0, { revealed: false })], error: null }
    kit.api['post /hex-cells/bulk-reveal'] = new kit.ApiError('nope', 500)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const store = useHexStore()
    await store.init('s1', 'm1')

    await store.revealAll()

    expect(store.hexCells.get('0:0').revealed).toBe(false)
    errorSpy.mockRestore()
  })

  test('deleteHex rolls back on failure', async () => {
    kit.responses.hex_cells = { data: [cell(0, 0)], error: null }
    kit.api['post /hex-cells/delete'] = new kit.ApiError('nope', 500)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const store = useHexStore()
    await store.init('s1', 'm1')

    await store.deleteHex(0, 0)

    expect(store.hexCells.has('0:0')).toBe(true)
    errorSpy.mockRestore()
  })

  test('ensureCellExists returns the existing id without an API call', async () => {
    kit.responses.hex_cells = { data: [cell(0, 0)], error: null }
    const store = useHexStore()
    await store.init('s1', 'm1')

    expect(await store.ensureCellExists(0, 0)).toBe('cell-0-0')
    expect(kit.apiClient.post).not.toHaveBeenCalled()

    kit.api['post /hex-cells/upsert'] = body => ({ ...body, id: 'fresh-cell' })
    expect(await store.ensureCellExists(5, 5)).toBe('fresh-cell')
  })

  test('clearAll wipes the grid only when the API call succeeds', async () => {
    kit.responses.hex_cells = { data: [cell(0, 0)], error: null }
    const store = useHexStore()
    await store.init('s1', 'm1')

    kit.api['post /hex-cells/clear'] = new kit.ApiError('nope', 500)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await store.clearAll()).toBe(false)
    expect(store.hexCells.size).toBe(1)

    kit.api['post /hex-cells/clear'] = null
    expect(await store.clearAll()).toBe(true)
    expect(store.hexCells.size).toBe(0)
    errorSpy.mockRestore()
  })

  test('setPartyHex persists, broadcasts, and survives an incoming echo without loops', async () => {
    const store = useHexStore()
    await store.init('s1', 'm1')

    await store.setPartyHex(2, 3)

    expect(store.partyHex).toEqual({ q: 2, r: 3 })
    expect(JSON.parse(localStorage.getItem('party_hex_s1_m1'))).toEqual({ q: 2, r: 3 })
    expect(kit.apiClient.patch).toHaveBeenCalledWith('/maps/m1', { party_hex_q: 2, party_hex_r: 3 }, 'move_party')
    const partyChannel = kit.channels.find(c => c.name === 'map:m1:party')
    expect(partyChannel.send).toHaveBeenCalledWith(expect.objectContaining({ event: 'party' }))

    partyChannel.emitBroadcast('party', { q: 2, r: 3 })
    expect(store.partyHex).toEqual({ q: 2, r: 3 })
  })

  test('party position from the maps table UPDATE wins over local state', async () => {
    const store = useHexStore()
    await store.init('s1', 'm1')

    const dbChannel = kit.channels.find(c => c.name === 'map:m1:party_db')
    dbChannel.emitPostgres('maps', 'UPDATE', { id: 'm1', party_hex_q: 7, party_hex_r: 8 })

    expect(store.partyHex).toEqual({ q: 7, r: 8 })
  })

  test('createDungeon creates the hex if needed then navigates to the new dungeon', async () => {
    kit.api['post /hex-cells/upsert'] = body => ({ ...body, id: 'hex-id-1' })
    kit.api['post /dungeons'] = body => ({ id: 'dungeon-1', ...body })
    const store = useHexStore()
    await store.init('s1', 'm1')

    await store.createDungeon(0, 0, 'Barrow')

    expect(store.hexDungeons.map(d => d.id)).toEqual(['dungeon-1'])
    expect(router.push).toHaveBeenCalledWith({ name: 'dungeon', params: { sessionId: 's1', dungeonId: 'dungeon-1' } })
  })

  test('cleanup removes all three channels and resets state', async () => {
    kit.responses.hex_cells = { data: [cell(0, 0)], error: null }
    const store = useHexStore()
    await store.init('s1', 'm1')
    store.cleanup()

    expect(kit.channels).toHaveLength(3)
    expect(kit.channels.every(c => c.removed)).toBe(true)
    expect(store.hexCells.size).toBe(0)
    expect(store.partyHex).toBeNull()
  })
})
