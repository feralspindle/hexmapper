import { describe, test, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { resetKit } from '../../test/helpers/storeTestKit.js'

const kit = vi.hoisted(() => ({ activity: {} }))

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
  useAuthStore: () => ({ user: { id: 'me' }, displayName: 'Me', avatarUrl: null }),
}))
vi.mock('@/stores/activityStore.js', () => ({
  useActivityStore: () => kit.activity,
}))
vi.mock('@/stores/oracleStore.js', () => ({
  useOracleStore: () => kit.oracle ?? { sessionTables: [], rollTable: vi.fn() },
}))

import { useD } from './dungeonStore.js'

const dungeonRow = (overrides = {}) => ({
  id: 'd1',
  session_id: 's1',
  name: 'The Sunken Crypt',
  fog_mode: true,
  fog_reveal_all: false,
  ...overrides,
})
const room = (id, overrides = {}) => ({
  id,
  dungeon_id: 'd1',
  name: `Room ${id}`,
  origin_x: 0,
  origin_y: 0,
  width: 4,
  height: 4,
  doors: [],
  items: [],
  ...overrides,
})

function channelNamed(suffix) {
  return kit.channels.find(c => c.name.endsWith(suffix))
}

describe('dungeonStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    resetKit(kit)
    kit.oracle = null
    kit.activity = { record: vi.fn() }
    kit.responses.dungeons = { data: dungeonRow(), error: null }
  })

  async function loadedStore() {
    const store = useD()
    await store.init('s1', 'd1')
    return store
  }

  test('init loads the dungeon, rooms, corridors, and fog cells', async () => {
    kit.responses.dungeon_rooms = { data: [room('r1')], error: null }
    kit.responses.dungeon_corridors = { data: [{ id: 'co1', dungeon_id: 'd1' }], error: null }
    kit.responses.dungeon_fog_cells = { data: [{ cell_x: 1, cell_y: 2 }], error: null }
    const store = await loadedStore()

    expect(store.dungeon.name).toBe('The Sunken Crypt')
    expect(store.rooms.get('r1').name).toBe('Room r1')
    expect(store.corridors.size).toBe(1)
    expect(store.isCellRevealed(1, 2)).toBe(true)
    expect(store.isCellRevealed(0, 0)).toBe(false)
    expect(store.loading).toBe(false)
    expect(store.loadError).toBeNull()
  })

  test('a failed dungeon load sets loadError', async () => {
    kit.responses.dungeons = { data: null, error: { message: 'not found' } }
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const store = await loadedStore()

    expect(store.loadError).toBe('not found')
    errorSpy.mockRestore()
  })

  test('addRoom swaps the optimistic room for the server row and records undo', async () => {
    kit.api['post /dungeon-rooms'] = body => room('server-room', body)
    const store = await loadedStore()

    await store.addRoom({ name: 'Vault', origin_x: 2, origin_y: 2, width: 3, height: 3 })

    expect(store.rooms.get('server-room')).toBeTruthy()
    expect([...store.rooms.keys()]).toHaveLength(1)
    expect(store.undoStack.at(-1)).toMatchObject({ type: 'delete_room', roomId: 'server-room' })
    expect(kit.activity.record).toHaveBeenCalledWith('added room', 'Vault')
  })

  test('generateRoom draws a stocked, connected, editable room in one create', async () => {
    kit.oracle = { sessionTables: [{ id: 't1', tag: 'dungeon.stocking' }], rollTable: vi.fn() }
    const stockingRoll = vi.fn(() => ({ result: { result: 'Monster - 2 ghouls' } }))
    kit.api['post /oracle-rolls'] = stockingRoll
    kit.api['post /dungeon-rooms'] = body => room('gen-room', body)
    const store = await loadedStore()
    store.rooms.set('r0', room('r0', { origin_x: 10, origin_y: 10, width: 3, height: 3, shape: 'rect', label: 'Room 7', doors: [] }))

    const result = await store.generateRoom()

    // stocking rolled straight through the api against the tagged table
    expect(stockingRoll.mock.calls[0][0]).toMatchObject({ kind: 'table', table_id: 't1' })
    expect(result.stocking).toBe('Monster - 2 ghouls')

    const created = store.rooms.get('gen-room')
    expect(created).toBeTruthy()
    expect(created.notes).toBe('Monster - 2 ghouls')
    // doors ship inside the create payload - no patch race, and at least the
    // connecting door is always there
    expect(created.doors.length).toBeGreaterThanOrEqual(1)
    expect(created.reject_overlapping).toBe(true)
    // label counts from the highest existing number, not the map size
    expect(created.label).toBe('Room 8')
    // one activity line for the whole click
    expect(kit.activity.record).toHaveBeenCalledTimes(1)
    expect(kit.activity.record).toHaveBeenCalledWith('explored into', expect.stringContaining('Monster'))
  })

  test('a 409 from a concurrent generator replans instead of stacking rooms', async () => {
    const attempts = []
    kit.api['post /dungeon-rooms'] = body => {
      attempts.push(body)
      if (attempts.length === 1) throw new kit.ApiError('conflict', 409)
      return room('gen-room', body)
    }
    const store = await loadedStore()
    store.rooms.set('r0', room('r0', { origin_x: 10, origin_y: 10, width: 3, height: 3, shape: 'rect', doors: [] }))

    const result = await store.generateRoom()

    expect(attempts).toHaveLength(2)
    expect(result).toBeTruthy()
    expect(store.rooms.get('gen-room')).toBeTruthy()
    // the failed optimistic room didn't leak into the map
    expect([...store.rooms.values()].filter(r => r.id !== 'r0' && r.id !== 'gen-room')).toHaveLength(0)
  })

  test('generateRoom refuses to run before the dungeon record loads', async () => {
    const store = useD()
    const result = await store.generateRoom()
    expect(result).toBeNull()
    expect(kit.apiClient.post).not.toHaveBeenCalled()
  })

  test('addRoom keeps a foreign edit that arrived before the API response', async () => {
    const store = await loadedStore()
    kit.api['post /dungeon-rooms'] = body => {
      channelNamed(':rooms').emitPostgres('dungeon_rooms', 'UPDATE', room('server-room', { name: 'Renamed Meanwhile', source_client: 'other' }))
      return room('server-room', body)
    }

    await store.addRoom({ name: 'Vault' })

    expect(store.rooms.get('server-room').name).toBe('Renamed Meanwhile')
    expect([...store.rooms.keys()]).toHaveLength(1)
  })

  test('a failed addRoom removes the optimistic room', async () => {
    kit.api['post /dungeon-rooms'] = new kit.ApiError('nope', 500)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const store = await loadedStore()

    await store.addRoom({ name: 'Vault' })

    expect(store.rooms.size).toBe(0)
    expect(store.undoStack).toEqual([])
    errorSpy.mockRestore()
  })

  test('updateRoom records a revert patch and rolls back on failure', async () => {
    kit.responses.dungeon_rooms = { data: [room('r1', { name: 'Old Name' })], error: null }
    const store = await loadedStore()

    await store.updateRoom('r1', { name: 'New Name' })
    expect(store.rooms.get('r1').name).toBe('New Name')
    expect(store.undoStack.at(-1)).toMatchObject({ type: 'update_room', roomId: 'r1', patch: { name: 'Old Name' } })

    kit.api['patch /dungeon-rooms/r1'] = new kit.ApiError('nope', 500)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await store.updateRoom('r1', { name: 'Doomed Edit' })
    expect(store.rooms.get('r1').name).toBe('New Name')
    errorSpy.mockRestore()
  })

  test('undo of an addRoom deletes the room again without re-recording undo', async () => {
    kit.api['post /dungeon-rooms'] = body => room('server-room', body)
    const store = await loadedStore()
    await store.addRoom({ name: 'Vault' })

    await store.undo()

    expect(store.rooms.size).toBe(0)
    expect(store.undoStack).toEqual([])
    expect(kit.apiClient.delete).toHaveBeenCalledWith('/dungeon-rooms/server-room', 'undo_delete_room')
  })

  test('deleteRoom pushes an insert undo carrying the full backup', async () => {
    kit.responses.dungeon_rooms = { data: [room('r1', { name: 'Keep Me' })], error: null }
    const store = await loadedStore()

    await store.deleteRoom('r1')

    expect(store.rooms.size).toBe(0)
    expect(store.undoStack.at(-1)).toMatchObject({ type: 'insert_room', data: { id: 'r1', name: 'Keep Me' } })

    await store.undo()
    expect(store.rooms.get('r1').name).toBe('Keep Me')
  })

  test('undo actions broadcast by other clients join the shared undo stack; own echoes do not', async () => {
    kit.api['post /dungeon-rooms'] = body => room('server-room', body)
    const store = await loadedStore()
    await store.addRoom({ name: 'Vault' })
    const undoChannel = channelNamed(':undo')
    const ownPush = undoChannel.send.mock.calls.find(([m]) => m.event === 'undo_push')[0]

    undoChannel.emitBroadcast('undo_push', ownPush.payload)
    expect(store.undoStack).toHaveLength(1)

    undoChannel.emitBroadcast('undo_push', { type: 'delete_room', roomId: 'other-room', _src: 'other-client' })
    expect(store.undoStack).toHaveLength(2)
    expect(store.undoStack.at(-1)).toEqual({ type: 'delete_room', roomId: 'other-room' })
  })

  test('remote room events apply and a remote delete clears the selection', async () => {
    const store = await loadedStore()
    const roomsChannel = channelNamed(':rooms')

    roomsChannel.emitPostgres('dungeon_rooms', 'INSERT', room('r1', { source_client: 'other' }))
    expect(store.rooms.get('r1')).toBeTruthy()

    store.selectElement('room', 'r1')
    roomsChannel.emitPostgres('dungeon_rooms', 'DELETE', {}, { id: 'r1' })
    expect(store.rooms.size).toBe(0)
    expect(store.selectedElement).toBeNull()
  })

  test('fields being edited locally survive a remote room upsert (edit guard)', async () => {
    kit.responses.dungeon_rooms = { data: [room('r1', { name: 'Local Draft', notes: 'old notes' })], error: null }
    const store = await loadedStore()
    store.beginRoomEdit('r1', ['name'])

    channelNamed(':rooms').emitPostgres('dungeon_rooms', 'UPDATE', room('r1', { name: 'Remote Name', notes: 'new notes', source_client: 'other' }))

    expect(store.rooms.get('r1').name).toBe('Local Draft')
    expect(store.rooms.get('r1').notes).toBe('new notes')

    store.endRoomEdit()
    channelNamed(':rooms').emitPostgres('dungeon_rooms', 'UPDATE', room('r1', { name: 'Remote Name 2', source_client: 'other' }))
    expect(store.rooms.get('r1').name).toBe('Remote Name 2')
  })

  test('own INSERT echoes are suppressed; own UPDATE echoes apply once no write is in flight', async () => {
    kit.responses.dungeon_rooms = { data: [room('r1')], error: null }
    const store = await loadedStore()
    await store.updateRoom('r1', { name: 'Mine' })
    const clientId = kit.apiClient.patch.mock.calls[0][1].source_client
    const roomsChannel = channelNamed(':rooms')

    roomsChannel.emitPostgres('dungeon_rooms', 'INSERT', room('r-echo', { source_client: clientId }))
    expect(store.rooms.has('r-echo')).toBe(false)

    roomsChannel.emitPostgres('dungeon_rooms', 'UPDATE', room('r1', { name: 'Server Truth', source_client: clientId }))
    expect(store.rooms.get('r1').name).toBe('Server Truth')
  })

  test('a foreign update older than my own is corrected by my own echo (no stuck stale row)', async () => {
    kit.responses.dungeon_rooms = { data: [room('r1', { name: 'v0' })], error: null }
    const store = await loadedStore()
    const roomsChannel = channelNamed(':rooms')

    await store.updateRoom('r1', { name: 'v2' })
    const clientId = kit.apiClient.patch.mock.calls[0][1].source_client

    roomsChannel.emitPostgres('dungeon_rooms', 'UPDATE', room('r1', { name: 'v1', source_client: 'other' }))
    expect(store.rooms.get('r1').name).toBe('v1')

    roomsChannel.emitPostgres('dungeon_rooms', 'UPDATE', room('r1', { name: 'v2', source_client: clientId }))
    expect(store.rooms.get('r1').name).toBe('v2')
  })

  test('a failed updateRoom does not roll back over a newer remote row', async () => {
    kit.responses.dungeon_rooms = { data: [room('r1', { name: 'v0' })], error: null }
    const store = await loadedStore()
    kit.api['patch /dungeon-rooms/r1'] = () => {
      channelNamed(':rooms').emitPostgres('dungeon_rooms', 'UPDATE', room('r1', { name: 'Theirs', source_client: 'other' }))
      throw new kit.ApiError('nope', 500)
    }
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await store.updateRoom('r1', { name: 'Doomed Edit' })

    expect(store.rooms.get('r1').name).toBe('Theirs')
    errorSpy.mockRestore()
  })

  test('a failed deleteRoom does not resurrect over a remote re-insert', async () => {
    kit.responses.dungeon_rooms = { data: [room('r1', { name: 'v0' })], error: null }
    const store = await loadedStore()
    kit.api['delete /dungeon-rooms/r1'] = () => {
      channelNamed(':rooms').emitPostgres('dungeon_rooms', 'UPDATE', room('r1', { name: 'Theirs', source_client: 'other' }))
      throw new kit.ApiError('nope', 500)
    }
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await store.deleteRoom('r1')

    expect(store.rooms.get('r1').name).toBe('Theirs')
    errorSpy.mockRestore()
  })

  test('a failed reveal does not roll back a cell another client revealed meanwhile', async () => {
    const store = await loadedStore()
    kit.api['post /dungeon-fog/reveal'] = () => {
      channelNamed(':fog').emitPostgres('dungeon_fog_cells', 'INSERT', { cell_x: 3, cell_y: 3, source_client: 'other' })
      throw new kit.ApiError('nope', 500)
    }
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await store.revealFogCell('d1', 3, 3)

    expect(store.isCellRevealed(3, 3)).toBe(true)
    errorSpy.mockRestore()
  })

  test('a failed bulk reveal rolls back only the unconfirmed cells', async () => {
    const store = await loadedStore()
    kit.api['post /dungeon-fog/reveal-bulk'] = () => {
      channelNamed(':fog').emitPostgres('dungeon_fog_cells', 'INSERT', { cell_x: 1, cell_y: 1, source_client: 'other' })
      throw new kit.ApiError('nope', 500)
    }
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await store.revealFogCells('d1', [{ cellX: 1, cellY: 1 }, { cellX: 2, cellY: 2 }])

    expect(store.isCellRevealed(1, 1)).toBe(true)
    expect(store.isCellRevealed(2, 2)).toBe(false)
    errorSpy.mockRestore()
  })

  test('revealFogCell is optimistic and rolls back when the API rejects', async () => {
    kit.api['post /dungeon-fog/reveal'] = new kit.ApiError('nope', 500)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const store = await loadedStore()

    await store.revealFogCell('d1', 3, 3)

    expect(store.isCellRevealed(3, 3)).toBe(false)
    errorSpy.mockRestore()
  })

  test('bulk fog reveal only sends cells that are still hidden', async () => {
    kit.responses.dungeon_fog_cells = { data: [{ cell_x: 0, cell_y: 0 }], error: null }
    const store = await loadedStore()

    await store.revealFogCells('d1', [{ cellX: 0, cellY: 0 }, { cellX: 1, cellY: 1 }])

    expect(kit.apiClient.post).toHaveBeenCalledWith(
      '/dungeon-fog/reveal-bulk',
      expect.objectContaining({ cells: [{ cell_x: 1, cell_y: 1 }] }),
      'reveal_fog_bulk',
    )
    expect(store.isCellRevealed(1, 1)).toBe(true)
  })

  test('fog INSERT from another client reveals; own echo is suppressed; DELETE hides', async () => {
    kit.api['post /dungeon-fog/reveal'] = {}
    const store = await loadedStore()
    await store.revealFogCell('d1', 9, 9)
    const clientId = kit.apiClient.post.mock.calls[0][1].source_client
    const fogChannel = channelNamed(':fog')

    fogChannel.emitPostgres('dungeon_fog_cells', 'INSERT', { cell_x: 5, cell_y: 5, source_client: 'other' })
    expect(store.isCellRevealed(5, 5)).toBe(true)

    fogChannel.emitPostgres('dungeon_fog_cells', 'INSERT', { cell_x: 6, cell_y: 6, source_client: clientId })
    expect(store.isCellRevealed(6, 6)).toBe(false)

    fogChannel.emitPostgres('dungeon_fog_cells', 'DELETE', {}, { cell_x: 5, cell_y: 5 })
    expect(store.isCellRevealed(5, 5)).toBe(false)
  })

  test('local image tweaks survive a dungeon UPDATE from the server', async () => {
    const store = await loadedStore()
    store.applyDungeonLocalPatch({ mapImageScale: 2.5 })

    channelNamed(':meta').emitPostgres('dungeons', 'UPDATE', dungeonRow({ map_image_scale: 1, name: 'Renamed' }))

    expect(store.dungeon.name).toBe('Renamed')
    expect(store.dungeon.map_image_scale).toBe(2.5)
  })

  test('updateDungeon translates the camelCase patch and clears the matching override', async () => {
    const store = await loadedStore()
    store.applyDungeonLocalPatch({ mapImageScale: 2.5 })

    const ok = await store.updateDungeon({ mapImageScale: 2.5, fogMode: false })

    expect(ok).toBe(true)
    expect(kit.apiClient.patch).toHaveBeenCalledWith('/dungeons/d1', { map_image_scale: 2.5, fog_mode: false }, 'update_dungeon_config')

    channelNamed(':meta').emitPostgres('dungeons', 'UPDATE', dungeonRow({ map_image_scale: 2.5, fog_mode: false }))
    expect(store.dungeon.map_image_scale).toBe(2.5)
    expect(store.fogMode).toBe(false)
  })

  test('doors move between rooms atomically', async () => {
    kit.responses.dungeon_rooms = {
      data: [room('r1', { doors: [{ id: 'door-1', wall: 'n' }] }), room('r2')],
      error: null,
    }
    const store = await loadedStore()

    store.moveDoor('r1', 'door-1', 'r2', { id: 'door-1', wall: 's' })

    expect(store.rooms.get('r1').doors).toEqual([])
    expect(store.rooms.get('r2').doors).toEqual([{ id: 'door-1', wall: 's' }])
  })

  test('room items default to the room center when no position is given', async () => {
    kit.responses.dungeon_rooms = { data: [room('r1', { origin_x: 10, origin_y: 20, width: 4, height: 6 })], error: null }
    const store = await loadedStore()

    store.addRoomItem('r1', 'chest')

    expect(store.rooms.get('r1').items[0]).toMatchObject({ type: 'chest', x: 12, y: 23 })
  })

  test('hideAllFog clears local fog and persists fog_reveal_all=false', async () => {
    kit.responses.dungeon_fog_cells = { data: [{ cell_x: 0, cell_y: 0 }], error: null }
    const store = await loadedStore()

    await store.hideAllFog('d1')

    expect(store.fogCells.size).toBe(0)
    expect(kit.apiClient.post).toHaveBeenCalledWith('/dungeon-fog/clear', { dungeon_id: 'd1' }, 'hide_all_fog')
    expect(kit.apiClient.patch).toHaveBeenCalledWith('/dungeons/d1', { fog_reveal_all: false }, 'update_dungeon_config')
  })

  test('addCorridor swaps the optimistic corridor for the server row and records undo', async () => {
    kit.api['post /dungeon-corridors'] = body => ({ id: 'server-corridor', dungeon_id: 'd1', ...body })
    const store = await loadedStore()

    await store.addCorridor({ x1: 0, y1: 0, x2: 4, y2: 0, points: [{ x: 0, y: 0 }, { x: 4, y: 0 }] })

    expect(store.corridors.get('server-corridor')).toBeTruthy()
    expect([...store.corridors.keys()]).toHaveLength(1)
    expect(store.undoStack.at(-1)).toMatchObject({ type: 'delete_corridor', corridorId: 'server-corridor' })
  })

  test('a failed addCorridor removes the optimistic corridor', async () => {
    kit.api['post /dungeon-corridors'] = new kit.ApiError('nope', 500)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const store = await loadedStore()

    await store.addCorridor({ x1: 0, y1: 0, x2: 4, y2: 0 })

    expect(store.corridors.size).toBe(0)
    expect(store.undoStack).toEqual([])
    errorSpy.mockRestore()
  })

  test('updateCorridor records a revert patch and rolls back on failure', async () => {
    kit.responses.dungeon_corridors = { data: [{ id: 'co1', dungeon_id: 'd1', label: 'old label' }], error: null }
    const store = await loadedStore()

    await store.updateCorridor('co1', { label: 'east passage' })
    expect(store.corridors.get('co1').label).toBe('east passage')
    expect(store.undoStack.at(-1)).toMatchObject({ type: 'update_corridor', corridorId: 'co1', patch: { label: 'old label' } })

    kit.api['patch /dungeon-corridors/co1'] = new kit.ApiError('nope', 500)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await store.updateCorridor('co1', { label: 'doomed edit' })
    expect(store.corridors.get('co1').label).toBe('east passage')
    errorSpy.mockRestore()
  })

  test('deleteCorridor pushes an insert undo and undo restores the corridor', async () => {
    kit.responses.dungeon_corridors = { data: [{ id: 'co1', dungeon_id: 'd1', label: 'keep me' }], error: null }
    const store = await loadedStore()
    store.selectElement('corridor', 'co1')

    await store.deleteCorridor('co1')

    expect(store.corridors.size).toBe(0)
    expect(store.selectedElement).toBeNull()
    expect(store.undoStack.at(-1)).toMatchObject({ type: 'insert_corridor', data: { id: 'co1', label: 'keep me' } })

    await store.undo()
    expect(store.corridors.get('co1').label).toBe('keep me')
    expect(kit.apiClient.post).toHaveBeenCalledWith('/dungeon-corridors', expect.objectContaining({ id: 'co1' }), 'undo_insert_corridor')
  })

  test('corridor postgres events from other clients apply and a remote delete clears the selection', async () => {
    const store = await loadedStore()
    const corridorsChannel = channelNamed(':corridors')

    corridorsChannel.emitPostgres('dungeon_corridors', 'INSERT', { id: 'co1', dungeon_id: 'd1', source_client: 'other' })
    expect(store.corridors.has('co1')).toBe(true)

    store.selectElement('corridor', 'co1')
    corridorsChannel.emitPostgres('dungeon_corridors', 'DELETE', {}, { id: 'co1' })
    expect(store.corridors.size).toBe(0)
    expect(store.selectedElement).toBeNull()
  })

  test('a reconnect refresh re-syncs everything but preserves fields being edited locally', async () => {
    kit.responses.dungeon_rooms = { data: [room('r1', { name: 'Local Draft', notes: 'old notes' })], error: null }
    const store = await loadedStore()
    store.beginRoomEdit('r1', ['name'])

    kit.responses.dungeons = { data: dungeonRow({ name: 'Renamed Crypt' }), error: null }
    kit.responses.dungeon_rooms = { data: [room('r1', { name: 'Server Name', notes: 'server notes' }), room('r2')], error: null }
    kit.responses.dungeon_corridors = { data: [{ id: 'co1', dungeon_id: 'd1' }], error: null }
    kit.responses.dungeon_fog_cells = { data: [{ cell_x: 4, cell_y: 4 }], error: null }
    await channelNamed(':meta').reconnect()

    expect(store.dungeon.name).toBe('Renamed Crypt')
    expect(store.rooms.get('r1').name).toBe('Local Draft')
    expect(store.rooms.get('r1').notes).toBe('server notes')
    expect(store.rooms.get('r2')).toBeTruthy()
    expect(store.corridors.has('co1')).toBe(true)
    expect(store.isCellRevealed(4, 4)).toBe(true)
  })

  test('a stale reconnect refresh cannot clobber state after cleanup and re-init', async () => {
    const store = await loadedStore()
    const staleMeta = channelNamed(':meta')

    let resolveStale
    kit.responses.dungeons = () => new Promise(resolve => (resolveStale = () => resolve({ data: dungeonRow({ name: 'Stale Crypt' }), error: null })))
    const staleRefresh = staleMeta.reconnect()

    store.cleanup()
    kit.responses.dungeons = { data: dungeonRow({ name: 'Fresh Crypt' }), error: null }
    await store.init('s1', 'd1')

    resolveStale()
    await staleRefresh

    expect(store.dungeon.name).toBe('Fresh Crypt')
  })

  test('cleanup removes all eight channels and resets state', async () => {
    const store = await loadedStore()
    store.cleanup()

    expect(kit.channels).toHaveLength(8)
    expect(kit.channels.every(c => c.removed)).toBe(true)
    expect(store.dungeon).toBeNull()
    expect(store.rooms.size).toBe(0)
    expect(store.tokens.size).toBe(0)
    expect(store.icons.size).toBe(0)
    expect(store.undoStack).toEqual([])
  })

  describe('tokens', () => {
    const token = (id, overrides = {}) => ({
      id,
      dungeon_id: 'd1',
      session_id: 's1',
      character_id: `char-${id}`,
      x: 2,
      y: 3,
      ...overrides,
    })

    test('init loads tokens', async () => {
      kit.responses.dungeon_tokens = { data: [token('t1')], error: null }
      const store = await loadedStore()

      expect(store.tokens.get('t1').character_id).toBe('char-t1')
    })

    test('placeToken swaps the optimistic token for the server row', async () => {
      kit.api['post /dungeon-tokens'] = body => token('server-token', body)
      const store = await loadedStore()

      await store.placeToken('char-1', 4, 5)

      expect(store.tokens.get('server-token')).toBeTruthy()
      expect([...store.tokens.keys()]).toHaveLength(1)
      expect(kit.apiClient.post).toHaveBeenCalledWith(
        '/dungeon-tokens',
        expect.objectContaining({ dungeon_id: 'd1', character_id: 'char-1', x: 4, y: 5 }),
        'place_token',
      )
    })

    test('placing a character that already has a token moves it instead', async () => {
      kit.responses.dungeon_tokens = { data: [token('t1', { character_id: 'char-1' })], error: null }
      const store = await loadedStore()

      await store.placeToken('char-1', 8, 9)

      expect(kit.apiClient.post).not.toHaveBeenCalledWith('/dungeon-tokens', expect.anything(), 'place_token')
      expect(kit.apiClient.patch).toHaveBeenCalledWith(
        '/dungeon-tokens/t1',
        expect.objectContaining({ x: 8, y: 9 }),
        'move_token',
      )
      expect(store.tokens.get('t1')).toMatchObject({ x: 8, y: 9 })
      expect(store.tokens.size).toBe(1)
    })

    test('placeStatBlockToken posts the stat block link', async () => {
      kit.api['post /dungeon-tokens'] = body => token('monster-token', { character_id: null, ...body })
      const store = await loadedStore()

      await store.placeStatBlockToken('sb-1', 4, 5)

      expect(store.tokens.get('monster-token')).toMatchObject({ stat_block_id: 'sb-1' })
      expect(kit.apiClient.post).toHaveBeenCalledWith(
        '/dungeon-tokens',
        expect.objectContaining({ dungeon_id: 'd1', stat_block_id: 'sb-1', x: 4, y: 5 }),
        'place_token',
      )
    })

    test('placing a stat block that already has a token moves it instead', async () => {
      kit.responses.dungeon_tokens = {
        data: [token('t1', { character_id: null, stat_block_id: 'sb-1' })],
        error: null,
      }
      const store = await loadedStore()

      await store.placeStatBlockToken('sb-1', 8, 9)

      expect(kit.apiClient.post).not.toHaveBeenCalledWith('/dungeon-tokens', expect.anything(), 'place_token')
      expect(store.tokens.get('t1')).toMatchObject({ x: 8, y: 9 })
      expect(store.tokens.size).toBe(1)
    })

    test('a failed move rolls the token back', async () => {
      kit.responses.dungeon_tokens = { data: [token('t1')], error: null }
      kit.api['patch /dungeon-tokens/t1'] = () => { throw new kit.ApiError('cell is hidden by fog', 400) }
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const store = await loadedStore()

      await store.moveToken('t1', { x: 99, y: 99 })

      expect(store.tokens.get('t1')).toMatchObject({ x: 2, y: 3 })
      errorSpy.mockRestore()
    })

    test('a failed remove restores the token', async () => {
      kit.responses.dungeon_tokens = { data: [token('t1')], error: null }
      kit.api['delete /dungeon-tokens/t1'] = () => { throw new kit.ApiError('forbidden', 403) }
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const store = await loadedStore()

      await store.removeToken('t1')

      expect(store.tokens.get('t1')).toBeTruthy()
      errorSpy.mockRestore()
    })

    test('realtime insert/update/delete from another client applies to the map', async () => {
      const store = await loadedStore()
      const ch = channelNamed(':tokens')

      ch.emitPostgres('dungeon_tokens', 'INSERT', token('t9', { source_client: 'someone-else' }))
      expect(store.tokens.get('t9')).toBeTruthy()

      ch.emitPostgres('dungeon_tokens', 'UPDATE', token('t9', { x: 7, y: 7, source_client: 'someone-else' }))
      expect(store.tokens.get('t9')).toMatchObject({ x: 7, y: 7 })

      store.selectElement('token', 't9')
      ch.emitPostgres('dungeon_tokens', 'DELETE', {}, { id: 't9' })
      expect(store.tokens.has('t9')).toBe(false)
      expect(store.selectedElement).toBeNull()
    })

    test('a fog change refetches the fog-gated collections (tokens and icons)', async () => {
      const store = await loadedStore()
      vi.useFakeTimers()

      // RLS hid these rows until the reveal - they only exist on refetch
      kit.responses.dungeon_tokens = { data: [token('t1')], error: null }
      kit.responses.dungeon_icons = { data: [{ id: 'i1', dungeon_id: 'd1', session_id: 's1', type: 'trap', x: 3, y: 3 }], error: null }
      channelNamed(':fog').emitPostgres('dungeon_fog_cells', 'INSERT', { cell_x: 3, cell_y: 3, source_client: 'other' })

      await vi.advanceTimersByTimeAsync(300)
      vi.useRealTimers()
      await Promise.resolve()

      expect(store.tokens.get('t1')).toBeTruthy()
      expect(store.icons.get('i1')).toMatchObject({ type: 'trap', x: 3, y: 3 })
    })

    test('isCellPlaceable follows fog state', async () => {
      kit.responses.dungeon_fog_cells = { data: [{ cell_x: 1, cell_y: 1 }], error: null }
      const store = await loadedStore()

      expect(store.isCellPlaceable(1, 1)).toBe(true)
      expect(store.isCellPlaceable(5, 5)).toBe(false)

      store.dungeon = { ...store.dungeon, fog_reveal_all: true }
      expect(store.isCellPlaceable(5, 5)).toBe(true)

      store.dungeon = { ...store.dungeon, fog_mode: false, fog_reveal_all: false }
      expect(store.isCellPlaceable(5, 5)).toBe(true)
    })
  })

  describe('icons', () => {
    const icon = (id, overrides = {}) => ({
      id,
      dungeon_id: 'd1',
      session_id: 's1',
      type: 'monster',
      label: null,
      notes: null,
      x: 2,
      y: 3,
      ...overrides,
    })

    test('init loads icons and iconsAtCell filters by position', async () => {
      kit.responses.dungeon_icons = { data: [icon('i1'), icon('i2', { x: 9, y: 9 })], error: null }
      const store = await loadedStore()

      expect(store.icons.size).toBe(2)
      expect(store.iconsAtCell(2, 3).map(i => i.id)).toEqual(['i1'])
    })

    test('addIcon swaps the optimistic icon for the server row', async () => {
      kit.api['post /dungeon-icons'] = body => icon('server-icon', body)
      const store = await loadedStore()

      await store.addIcon('trap', 4, 5)

      expect(store.icons.get('server-icon')).toBeTruthy()
      expect([...store.icons.keys()]).toHaveLength(1)
      expect(kit.apiClient.post).toHaveBeenCalledWith(
        '/dungeon-icons',
        expect.objectContaining({ dungeon_id: 'd1', type: 'trap', x: 4, y: 5 }),
        'place_icon',
      )
    })

    test('a failed addIcon removes the optimistic icon', async () => {
      kit.api['post /dungeon-icons'] = new kit.ApiError('cell is hidden by fog', 400)
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const store = await loadedStore()

      await store.addIcon('trap', 9, 9)

      expect(store.icons.size).toBe(0)
      errorSpy.mockRestore()
    })

    test('a failed updateIcon rolls the icon back', async () => {
      kit.responses.dungeon_icons = { data: [icon('i1')], error: null }
      kit.api['patch /dungeon-icons/i1'] = () => { throw new kit.ApiError('cell is hidden by fog', 400) }
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const store = await loadedStore()

      await store.updateIcon('i1', { x: 99, y: 99 })

      expect(store.icons.get('i1')).toMatchObject({ x: 2, y: 3 })
      errorSpy.mockRestore()
    })

    test('a failed removeIcon restores the icon', async () => {
      kit.responses.dungeon_icons = { data: [icon('i1')], error: null }
      kit.api['delete /dungeon-icons/i1'] = () => { throw new kit.ApiError('forbidden', 403) }
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const store = await loadedStore()

      await store.removeIcon('i1')

      expect(store.icons.get('i1')).toBeTruthy()
      errorSpy.mockRestore()
    })

    test('realtime insert/update/delete from another client applies to the map', async () => {
      const store = await loadedStore()
      const ch = channelNamed(':icons')

      ch.emitPostgres('dungeon_icons', 'INSERT', icon('i9', { source_client: 'someone-else' }))
      expect(store.icons.get('i9')).toBeTruthy()

      ch.emitPostgres('dungeon_icons', 'UPDATE', icon('i9', { label: 'Owlbear den', source_client: 'someone-else' }))
      expect(store.icons.get('i9')).toMatchObject({ label: 'Owlbear den' })

      store.selectElement('icon', 'i9')
      ch.emitPostgres('dungeon_icons', 'DELETE', {}, { id: 'i9' })
      expect(store.icons.has('i9')).toBe(false)
      expect(store.selectedElement).toBeNull()
    })
  })
})
