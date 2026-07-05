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
  useAuthStore: () => ({ user: { id: 'me' }, displayName: 'Me' }),
}))
vi.mock('@/stores/activityStore.js', () => ({
  useActivityStore: () => ({ record: vi.fn() }),
}))

import { useNotesStore } from './notesStore.js'

const note = (id, overrides = {}) => ({
  id,
  user_id: 'someone-else',
  body: `note ${id}`,
  created_at: `2026-07-04T10:00:0${id.at(-1) ?? 0}Z`,
  ...overrides,
})

describe('notesStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    resetKit(kit)
  })

  test('initForHex loads notes and subscribes to that hex only', async () => {
    kit.responses.hex_notes = { data: [note('n1')], error: null }
    const store = useNotesStore()
    await store.initForHex('hex-1', 's1')

    expect(store.notes.map(n => n.id)).toEqual(['n1'])
    expect(kit.channels).toHaveLength(1)
    expect(kit.channels[0].handlers[0].filter.filter).toBe('hex_cell_id=eq.hex-1')
  })

  test('re-init for the same hex does not resubscribe', async () => {
    const store = useNotesStore()
    await store.initForHex('hex-1', 's1')
    await store.initForHex('hex-1', 's1')

    expect(kit.channels).toHaveLength(1)
  })

  test('switching from hex to dungeon element replaces the channel and notes', async () => {
    kit.responses.hex_notes = { data: [note('hex-note')], error: null }
    kit.responses.dungeon_element_notes = { data: [note('room-note')], error: null }
    const store = useNotesStore()
    await store.initForHex('hex-1', 's1')
    await store.initForDungeonElement('room-1', 'room', 's1')

    expect(kit.channels[0].removed).toBe(true)
    expect(store.notes.map(n => n.id)).toEqual(['room-note'])
  })

  test('realtime events apply INSERT/UPDATE from others and every DELETE, skipping own echoes', async () => {
    kit.responses.hex_notes = { data: [note('n1')], error: null }
    const store = useNotesStore()
    await store.initForHex('hex-1', 's1')
    const channel = kit.channels[0]

    channel.emitPostgres('hex_notes', 'INSERT', note('mine', { user_id: 'me' }))
    expect(store.notes.map(n => n.id)).toEqual(['n1'])

    channel.emitPostgres('hex_notes', 'INSERT', note('n2'))
    channel.emitPostgres('hex_notes', 'UPDATE', note('n1', { body: 'edited' }))
    expect(store.notes.find(n => n.id === 'n1').body).toBe('edited')

    channel.emitPostgres('hex_notes', 'DELETE', {}, { id: 'n2' })
    expect(store.notes.map(n => n.id)).toEqual(['n1'])
  })

  test('addNote is optimistic and swaps in the server row', async () => {
    kit.api['post /hex-notes'] = body => note('server-note', { body: body.body, user_id: 'me' })
    const store = useNotesStore()
    await store.initForHex('hex-1', 's1')

    await store.addNote('  hello  ')

    expect(store.notes).toHaveLength(1)
    expect(store.notes[0]).toMatchObject({ id: 'server-note', body: 'hello' })
  })

  test('a failed addNote rolls the optimistic note back', async () => {
    kit.api['post /hex-notes'] = new kit.ApiError('nope', 500)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const store = useNotesStore()
    await store.initForHex('hex-1', 's1')

    await store.addNote('hello')

    expect(store.notes).toEqual([])
    errorSpy.mockRestore()
  })

  test('dungeon element notes post to the dungeon endpoint with the element type', async () => {
    kit.api['post /dungeon-element-notes'] = body => note('server-note', body)
    const store = useNotesStore()
    await store.initForDungeonElement('room-1', 'room', 's1')

    await store.addNote('a secret door')

    expect(kit.apiClient.post).toHaveBeenCalledWith('/dungeon-element-notes', {
      element_id: 'room-1',
      element_type: 'room',
      session_id: 's1',
      body: 'a secret door',
    })
  })

  test('updateNote restores the previous body on failure', async () => {
    kit.responses.hex_notes = { data: [note('n1', { body: 'original' })], error: null }
    kit.api['patch /hex-notes/n1'] = new kit.ApiError('nope', 500)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const store = useNotesStore()
    await store.initForHex('hex-1', 's1')

    await store.updateNote('n1', 'changed')

    expect(store.notes[0].body).toBe('original')
    errorSpy.mockRestore()
  })

  test('deleteNote restores the note in order on failure', async () => {
    kit.responses.hex_notes = { data: [note('n1'), note('n2')], error: null }
    kit.api['delete /hex-notes/n1'] = new kit.ApiError('nope', 500)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const store = useNotesStore()
    await store.initForHex('hex-1', 's1')

    await store.deleteNote('n1')

    expect(store.notes.map(n => n.id)).toEqual(['n1', 'n2'])
    errorSpy.mockRestore()
  })

  test('initForHex(null) just clears state', async () => {
    kit.responses.hex_notes = { data: [note('n1')], error: null }
    const store = useNotesStore()
    await store.initForHex('hex-1', 's1')
    await store.initForHex(null, 's1')

    expect(store.notes).toEqual([])
    expect(kit.channels[0].removed).toBe(true)
  })
})
