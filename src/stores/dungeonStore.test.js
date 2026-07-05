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
    expect(channelNamed(':changes').send).toHaveBeenCalledWith(expect.objectContaining({ event: 'room_upsert' }))
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

  test('room change broadcasts from other clients apply and clear a deleted selection', async () => {
    const store = await loadedStore()
    const changes = channelNamed(':changes')

    changes.emitBroadcast('room_upsert', { room: room('r1'), _src: 'other-client' })
    expect(store.rooms.get('r1')).toBeTruthy()

    store.selectElement('room', 'r1')
    changes.emitBroadcast('room_delete', { roomId: 'r1', _src: 'other-client' })
    expect(store.rooms.size).toBe(0)
    expect(store.selectedElement).toBeNull()
  })

  test('fields being edited locally survive a remote room upsert (edit guard)', async () => {
    kit.responses.dungeon_rooms = { data: [room('r1', { name: 'Local Draft', notes: 'old notes' })], error: null }
    const store = await loadedStore()
    store.beginRoomEdit('r1', ['name'])

    channelNamed(':changes').emitBroadcast('room_upsert', {
      room: room('r1', { name: 'Remote Name', notes: 'new notes' }),
      _src: 'other-client',
    })

    expect(store.rooms.get('r1').name).toBe('Local Draft')
    expect(store.rooms.get('r1').notes).toBe('new notes')

    store.endRoomEdit()
    channelNamed(':changes').emitBroadcast('room_upsert', {
      room: room('r1', { name: 'Remote Name 2' }),
      _src: 'other-client',
    })
    expect(store.rooms.get('r1').name).toBe('Remote Name 2')
  })

  test('room postgres events respect the source_client echo guard', async () => {
    const store = await loadedStore()
    const roomsChannel = channelNamed(':rooms')

    roomsChannel.emitPostgres('dungeon_rooms', 'INSERT', room('r-other', { source_client: 'other' }))
    expect(store.rooms.has('r-other')).toBe(true)

    roomsChannel.emitPostgres('dungeon_rooms', 'DELETE', {}, { id: 'r-other' })
    expect(store.rooms.has('r-other')).toBe(false)
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
    expect(channelNamed(':changes').send).toHaveBeenCalledWith(expect.objectContaining({ event: 'corridor_upsert' }))
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

  test('corridor broadcasts and postgres events from other clients apply with echo guards', async () => {
    const store = await loadedStore()

    channelNamed(':changes').emitBroadcast('corridor_upsert', {
      corridor: { id: 'co1', dungeon_id: 'd1' },
      _src: 'other-client',
    })
    expect(store.corridors.has('co1')).toBe(true)

    store.selectElement('corridor', 'co1')
    channelNamed(':changes').emitBroadcast('corridor_delete', { corridorId: 'co1', _src: 'other-client' })
    expect(store.corridors.size).toBe(0)
    expect(store.selectedElement).toBeNull()

    const corridorsChannel = channelNamed(':corridors')
    corridorsChannel.emitPostgres('dungeon_corridors', 'INSERT', { id: 'co2', dungeon_id: 'd1', source_client: 'other' })
    expect(store.corridors.has('co2')).toBe(true)

    corridorsChannel.emitPostgres('dungeon_corridors', 'DELETE', {}, { id: 'co2' })
    expect(store.corridors.has('co2')).toBe(false)
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

  test('cleanup removes all seven channels and resets state', async () => {
    const store = await loadedStore()
    store.cleanup()

    expect(kit.channels).toHaveLength(7)
    expect(kit.channels.every(c => c.removed)).toBe(true)
    expect(store.dungeon).toBeNull()
    expect(store.rooms.size).toBe(0)
    expect(store.undoStack).toEqual([])
  })
})
