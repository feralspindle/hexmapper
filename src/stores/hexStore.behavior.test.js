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
vi.mock('@/stores/journalStore.js', () => ({
  useJournalStore: () => kit.journal,
}))
vi.mock('@/router/index.js', () => ({
  default: { push: vi.fn(), currentRoute: { value: { params: {} } } },
}))

import router from '@/router/index.js'
import { useHexStore } from './hexStore.js'
import { usePartyFollow } from '@/composables/usePartyFollow.js'

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

function partyFollowChannel() {
  return kit.channels.find(c => c.name === 'session:s1:party-follow')
}

describe('hexStore behavior', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    resetKit(kit)
    kit.session = { isGM: true, hexMode: 'fow' }
    kit.mapStore = { setFogRevealAll: vi.fn(() => Promise.resolve()) }
    kit.journal = { init: vi.fn(() => Promise.resolve()), pin: vi.fn(() => Promise.resolve()) }
    kit.responses.maps = { data: { party_hex_q: null, party_hex_r: null }, error: null }
    vi.mocked(router.push).mockClear()
    localStorage.clear()
    usePartyFollow().dismiss()
  })

  test('GM init fetches through the API so unexplored cells stay redacted', async () => {
    kit.api['get /hex-cells?session_id=s1&map_id=m1'] = [cell(0, 0), cell(1, 2)]
    const store = useHexStore()
    await store.init('s1', 'm1')

    expect(store.hexCells.size).toBe(2)
    expect(store.hexCells.get('1:2').id).toBe('cell-1-2')
    expect(kit.apiClient.get).toHaveBeenCalledWith('/hex-cells?session_id=s1&map_id=m1')
    expect(kit.queries.filter(q => q.table === 'hex_cells')).toHaveLength(0)
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
    kit.api['get /hex-cells?session_id=s1&map_id=m1'] = [cell(3, 4, { label: 'Ruins' })]
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
    kit.api['get /hex-cells?session_id=s1&map_id=m1'] = [cell(0, 0, { terrain_type: 'plains' })]
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

  test('in fow mode with reveal-all on, an edit on an empty hex is stored as revealed', async () => {
    kit.session.isGM = false
    kit.mapStore.mapFogRevealAll = true
    kit.api['get /hex-cells?session_id=s1&map_id=m1'] = []
    kit.api['post /hex-cells/upsert'] = body => ({ ...body, id: 'server-cell' })
    const store = useHexStore()
    await store.init('s1', 'm1')

    await store.upsertHex(0, 0, { terrain_type: 'forest' })

    expect(kit.apiClient.post).toHaveBeenCalledWith(
      '/hex-cells/upsert',
      expect.objectContaining({ revealed: true }),
      'edit_hex',
    )
    expect(store.hexCells.get('0:0').revealed).toBe(true)
  })

  test('under reveal-all an explicitly hidden cell keeps its override on edit', async () => {
    kit.mapStore.mapFogRevealAll = true
    kit.api['get /hex-cells?session_id=s1&map_id=m1'] = [cell(0, 0, { revealed: false })]
    kit.api['post /hex-cells/upsert'] = body => ({ ...body, id: 'server-cell' })
    const store = useHexStore()
    await store.init('s1', 'm1')

    await store.upsertHex(0, 0, { label: 'still hidden' })

    const body = kit.apiClient.post.mock.calls.find(([path]) => path === '/hex-cells/upsert')[1]
    expect('revealed' in body).toBe(false)
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
    expect(store.hexCells.get('0:0')).toEqual({ session_id: 's1', map_id: 'm1', q: 0, r: 0, revealed: false, explored: true })

    hexChannel().emitPostgres('hex_cells', 'UPDATE', cell(1, 1, { revealed: true, gm_markers: '["trap"]' }))
    expect(store.hexCells.get('1:1').gm_markers).toBeUndefined()
    expect(store.hexCells.get('1:1').revealed).toBe(true)
  })

  test('unexplored cells arrive as fog sentinels even for the GM', async () => {
    kit.api['get /hex-cells?session_id=s1&map_id=m1'] = []
    const store = useHexStore()
    await store.init('s1', 'm1')

    hexChannel().emitPostgres('hex_cells', 'UPDATE', cell(2, 2, { explored: false, revealed: false, terrain_type: 'swamp', label: "Witch's hut" }))
    expect(store.hexCells.get('2:2')).toEqual({ session_id: 's1', map_id: 'm1', q: 2, r: 2, revealed: false, explored: false })
  })

  test('upsertHex only sends explored when the patch sets it', async () => {
    kit.api['get /hex-cells?session_id=s1&map_id=m1'] = [cell(0, 0, { explored: true })]
    kit.api['post /hex-cells/upsert'] = body => body
    const store = useHexStore()
    await store.init('s1', 'm1')

    await store.upsertHex(0, 0, { label: 'Camp' })
    expect(kit.apiClient.post.mock.calls.at(-1)[1].explored).toBeUndefined()

    await store.markUnexplored(0, 0)
    expect(kit.apiClient.post.mock.calls.at(-1)[1]).toMatchObject({ explored: false, revealed: false })

    await store.markExplored(0, 0)
    expect(kit.apiClient.post.mock.calls.at(-1)[1].explored).toBe(true)
  })

  test('moving the party onto an unexplored hex asks the server to generate it', async () => {
    kit.session.playMode = 'gm_less'
    kit.mapStore.mapExplorationMode = true
    kit.api['get /hex-cells?session_id=s1&map_id=m1'] = []
    const generated = cell(4, 4, { explored: true, terrain_type: 'forest', label: 'Standing stones' })
    kit.api['post /hex-cells/explore'] = () => ({ generated: true, cell: generated })
    const store = useHexStore()
    await store.init('s1', 'm1')

    await store.setPartyHex(4, 4)

    expect(kit.apiClient.post).toHaveBeenCalledWith(
      '/hex-cells/explore',
      { session_id: 's1', map_id: 'm1', q: 4, r: 4 },
      'explore_hex',
    )
    expect(store.hexCells.get('4:4')).toEqual(generated)
  })

  test('moving the party onto an explored hex skips generation', async () => {
    kit.session.playMode = 'gm_less'
    kit.mapStore.mapExplorationMode = true
    kit.api['get /hex-cells?session_id=s1&map_id=m1'] = [cell(1, 1, { explored: true })]
    kit.api['post /hex-cells/explore'] = vi.fn()
    const store = useHexStore()
    await store.init('s1', 'm1')

    await store.setPartyHex(1, 1)

    expect(kit.api['post /hex-cells/explore']).not.toHaveBeenCalled()
  })

  test('a party move on an explored hex burns travel time for its terrain', async () => {
    kit.session.playMode = 'gm_less'
    kit.session.travelState = { enabled: true, fraction: 0 }
    kit.session.travel = vi.fn()
    kit.api['get /hex-cells?session_id=s1&map_id=m1'] = [cell(2, 2, { explored: true, terrain_type: 'swamp' })]
    const store = useHexStore()
    await store.init('s1', 'm1')

    await store.setPartyHex(2, 2)

    expect(kit.session.travel).toHaveBeenCalledWith('move', { terrain: 'swamp' })
  })

  test('travel stays quiet when the procedure is off', async () => {
    kit.session.playMode = 'gm_less'
    kit.session.travelState = { enabled: false, fraction: 0 }
    kit.session.travel = vi.fn()
    kit.api['get /hex-cells?session_id=s1&map_id=m1'] = [cell(1, 1, { explored: true })]
    const store = useHexStore()
    await store.init('s1', 'm1')

    await store.setPartyHex(1, 1)

    expect(kit.session.travel).not.toHaveBeenCalled()
  })

  test('a solo party move writes a travel pin to the journal', async () => {
    kit.session.playMode = 'gm_less'
    kit.mapStore.mapExplorationMode = true
    kit.api['get /hex-cells?session_id=s1&map_id=m1'] = []
    kit.api['post /hex-cells/explore'] = () => ({
      generated: true,
      cell: cell(4, 4, { explored: true, terrain_type: 'forest' }),
    })
    const store = useHexStore()
    await store.init('s1', 'm1')

    await store.setPartyHex(4, 4)

    expect(kit.journal.init).toHaveBeenCalledWith('s1')
    expect(kit.journal.pin).toHaveBeenCalledWith({
      source: 'travel',
      label: 'Travel',
      text: 'The party enters hex 4,4',
      detail: 'forest · newly explored',
    })
  })

  test('re-setting the same party hex does not journal again', async () => {
    kit.session.playMode = 'gm_less'
    kit.api['get /hex-cells?session_id=s1&map_id=m1'] = [cell(1, 1, { explored: true, terrain_type: 'swamp' })]
    const store = useHexStore()
    await store.init('s1', 'm1')

    await store.setPartyHex(1, 1)
    await store.setPartyHex(1, 1)

    expect(kit.journal.pin).toHaveBeenCalledTimes(1)
    expect(kit.journal.pin).toHaveBeenCalledWith({
      source: 'travel',
      label: 'Travel',
      text: 'The party enters hex 1,1',
      detail: 'swamp',
    })
  })

  test('GM-led party moves stay out of the journal', async () => {
    kit.session.playMode = 'gm'
    kit.api['get /hex-cells?session_id=s1&map_id=m1'] = [cell(2, 2, { explored: true })]
    const store = useHexStore()
    await store.init('s1', 'm1')

    await store.setPartyHex(2, 2)

    expect(kit.journal.pin).not.toHaveBeenCalled()
  })

  test('GM-led sessions never trigger generation on party movement', async () => {
    kit.session.playMode = 'gm'
    kit.mapStore.mapExplorationMode = true
    kit.api['get /hex-cells?session_id=s1&map_id=m1'] = []
    kit.api['post /hex-cells/explore'] = vi.fn()
    const store = useHexStore()
    await store.init('s1', 'm1')

    await store.setPartyHex(4, 4)

    expect(kit.api['post /hex-cells/explore']).not.toHaveBeenCalled()
  })

  test('realtime DELETE removes the cell', async () => {
    kit.api['get /hex-cells?session_id=s1&map_id=m1'] = [cell(0, 0)]
    const store = useHexStore()
    await store.init('s1', 'm1')

    hexChannel().emitPostgres('hex_cells', 'DELETE', {}, { q: 0, r: 0 })

    expect(store.hexCells.size).toBe(0)
  })

  test('toggleRevealed sends the reveal intent with the flipped value', async () => {
    kit.api['get /hex-cells?session_id=s1&map_id=m1'] = [cell(0, 0, { revealed: false })]
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
    kit.api['get /hex-cells?session_id=s1&map_id=m1'] = [cell(0, 0, { revealed: false }), cell(1, 1, { revealed: false })]
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
    kit.api['get /hex-cells?session_id=s1&map_id=m1'] = [cell(0, 0, { revealed: false })]
    kit.api['post /hex-cells/bulk-reveal'] = new kit.ApiError('nope', 500)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const store = useHexStore()
    await store.init('s1', 'm1')

    await store.revealAll()

    expect(store.hexCells.get('0:0').revealed).toBe(false)
    errorSpy.mockRestore()
  })

  test('deleteHex rolls back on failure', async () => {
    kit.api['get /hex-cells?session_id=s1&map_id=m1'] = [cell(0, 0)]
    kit.api['post /hex-cells/delete'] = new kit.ApiError('nope', 500)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const store = useHexStore()
    await store.init('s1', 'm1')

    await store.deleteHex(0, 0)

    expect(store.hexCells.has('0:0')).toBe(true)
    errorSpy.mockRestore()
  })

  test('ensureCellExists returns the existing id without an API call', async () => {
    kit.api['get /hex-cells?session_id=s1&map_id=m1'] = [cell(0, 0)]
    const store = useHexStore()
    await store.init('s1', 'm1')

    expect(await store.ensureCellExists(0, 0)).toBe('cell-0-0')
    expect(kit.apiClient.post).not.toHaveBeenCalled()

    kit.api['post /hex-cells/upsert'] = body => ({ ...body, id: 'fresh-cell' })
    expect(await store.ensureCellExists(5, 5)).toBe('fresh-cell')
  })

  test('clearAll wipes the grid only when the API call succeeds', async () => {
    kit.api['get /hex-cells?session_id=s1&map_id=m1'] = [cell(0, 0)]
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

  test('a maps UPDATE echo cannot snap the party marker back during rapid moves', async () => {
    const resolvers = []
    kit.api['patch /maps/m1'] = () => new Promise(resolve => { resolvers.push(resolve) })
    const store = useHexStore()
    await store.init('s1', 'm1')
    const dbChannel = kit.channels.find(c => c.name === 'map:m1:party_db')

    const move1 = store.setPartyHex(1, 1)
    const move2 = store.setPartyHex(2, 2)
    expect(store.partyHex).toEqual({ q: 2, r: 2 })

    // the echo of the first move arrives while patches are still in flight
    dbChannel.emitPostgres('maps', 'UPDATE', { id: 'm1', party_hex_q: 1, party_hex_r: 1 })
    expect(store.partyHex).toEqual({ q: 2, r: 2 })

    // patches are chained so the first can't commit after the second
    await Promise.resolve()
    expect(kit.apiClient.patch).toHaveBeenCalledTimes(1)
    resolvers.shift()({})
    await move1
    await Promise.resolve()
    await Promise.resolve()
    expect(kit.apiClient.patch).toHaveBeenCalledTimes(2)
    resolvers.shift()({})
    await move2
    expect(store.partyHex).toEqual({ q: 2, r: 2 })

    // once idle, another client's move applies again
    dbChannel.emitPostgres('maps', 'UPDATE', { id: 'm1', party_hex_q: 9, party_hex_r: 9 })
    expect(store.partyHex).toEqual({ q: 9, r: 9 })
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

  test('cleanup removes all four channels and resets state', async () => {
    kit.api['get /hex-cells?session_id=s1&map_id=m1'] = [cell(0, 0)]
    const store = useHexStore()
    await store.init('s1', 'm1')
    store.cleanup()

    expect(kit.channels).toHaveLength(4)
    expect(kit.channels.every(c => c.removed)).toBe(true)
    expect(store.hexCells.size).toBe(0)
    expect(store.partyHex).toBeNull()
  })

  test('gm entering an existing dungeon broadcasts dungeon_entered with its name', async () => {
    kit.api['get /hex-cells?session_id=s1&map_id=m1'] = []
    kit.responses.dungeons = { data: [{ id: 'd1', name: 'Barrowmaze' }], error: null }
    const store = useHexStore()
    await store.init('s1', 'm1')
    await store.fetchDungeonsForHex('cell-0-0')

    store.navigateToDungeon('d1')

    expect(partyFollowChannel().send).toHaveBeenCalledWith({
      type: 'broadcast',
      event: 'dungeon_entered',
      payload: { dungeonId: 'd1', name: 'Barrowmaze' },
    })
    expect(router.push).toHaveBeenCalledWith({ name: 'dungeon', params: { sessionId: 's1', dungeonId: 'd1' } })
  })

  test('gm creating a dungeon broadcasts dungeon_entered', async () => {
    kit.api['get /hex-cells?session_id=s1&map_id=m1'] = []
    kit.api['post /hex-cells/upsert'] = body => ({ ...body, id: 'hex-id-1' })
    kit.api['post /dungeons'] = body => ({ id: 'dungeon-1', ...body })
    const store = useHexStore()
    await store.init('s1', 'm1')

    await store.createDungeon(0, 0, 'Deep Hole')

    expect(partyFollowChannel().send).toHaveBeenCalledWith({
      type: 'broadcast',
      event: 'dungeon_entered',
      payload: { dungeonId: 'dungeon-1', name: 'Deep Hole' },
    })
  })

  test('player navigation does not broadcast and clears any pending invite', async () => {
    kit.api['get /hex-cells?session_id=s1&map_id=m1'] = []
    kit.session.isGM = false
    const store = useHexStore()
    await store.init('s1', 'm1')
    usePartyFollow().push({ dungeonId: 'd1', name: 'Barrowmaze' })

    store.navigateToDungeon('d1')

    expect(partyFollowChannel().send).not.toHaveBeenCalled()
    expect(usePartyFollow().invite.value).toBeNull()
    expect(router.push).toHaveBeenCalledWith({ name: 'dungeon', params: { sessionId: 's1', dungeonId: 'd1' } })
  })

  test('a dungeon_entered broadcast raises the invite for players but not the gm', async () => {
    kit.api['get /hex-cells?session_id=s1&map_id=m1'] = []
    kit.session.isGM = false
    const store = useHexStore()
    await store.init('s1', 'm1')

    partyFollowChannel().emitBroadcast('dungeon_entered', { dungeonId: 'd2', name: 'Gloomvault' })
    expect(usePartyFollow().invite.value).toEqual({ dungeonId: 'd2', name: 'Gloomvault' })

    usePartyFollow().dismiss()
    kit.session.isGM = true
    partyFollowChannel().emitBroadcast('dungeon_entered', { dungeonId: 'd3', name: 'Other' })
    expect(usePartyFollow().invite.value).toBeNull()
  })
})
