import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { reactive, nextTick } from 'vue'
import DungeonInspector from './DungeonInspector.vue'

const mocks = vi.hoisted(() => ({
  dungeonStore: null,
  notesStore: {
    notes: [],
    loading: false,
    initForDungeonElement: vi.fn(),
    initForDungeonCell: vi.fn(),
    addNote: vi.fn(),
    updateNote: vi.fn(),
    deleteNote: vi.fn(),
  },
  authStore: { user: { id: 'u1' } },
  sessionStore: { sessionId: 's1' },
  activityStore: { record: vi.fn() },
}))

vi.mock('@/stores/dungeonStore.js', () => ({ useD: () => mocks.dungeonStore }))
vi.mock('@/stores/notesStore.js', () => ({ useNotesStore: () => mocks.notesStore }))
vi.mock('@/stores/authStore.js', () => ({ useAuthStore: () => mocks.authStore }))
vi.mock('@/stores/sessionStore.js', () => ({ useSessionStore: () => mocks.sessionStore }))
vi.mock('@/stores/activityStore.js', () => ({ useActivityStore: () => mocks.activityStore }))
vi.mock('@/composables/useConfirmDialog.js', () => ({ useConfirmDialog: () => ({ confirm: vi.fn() }) }))
vi.mock('@/composables/usePlayerColor.js', () => ({ playerColorFor: () => '#888' }))
vi.mock('@/composables/useTimeAgo.js', () => ({ useTimeAgo: () => ({ timeAgo: () => 'now' }) }))

const item = (overrides = {}) => ({
  id: 'i1', type: 'chest', x: 1, y: 1, label: '', notes: 'old', ...overrides,
})

const room = (overrides = {}) => ({
  id: 'r1', label: 'Cellar', origin_x: 0, origin_y: 0, width: 4, height: 3,
  items: [item()], ...overrides,
})

const icon = (overrides = {}) => ({
  id: 'ic1', type: 'door', x: 2, y: 2, label: '', notes: 'old', ...overrides,
})

function mountWithRoom() {
  mocks.dungeonStore.rooms.set('r1', room())
  mocks.dungeonStore.selectedElement = { type: 'room', id: 'r1' }
  return mount(DungeonInspector)
}

function mountWithIcon() {
  mocks.dungeonStore.icons.set('ic1', icon())
  mocks.dungeonStore.selectedElement = { type: 'cell', x: 2, y: 2 }
  return mount(DungeonInspector)
}

describe('DungeonInspector item and icon field editing', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mocks.dungeonStore = reactive({
      selectedElement: null,
      rooms: new Map(),
      corridors: new Map(),
      tokens: new Map(),
      icons: new Map(),
      fogMode: false,
      dungeon: { id: 'd1' },
      iconsAtCell: (x, y) => [...mocks.dungeonStore.icons.values()].filter(i => i.x === x && i.y === y),
      updateRoom: vi.fn(),
      updateCorridor: vi.fn(),
      updateRoomItem: vi.fn(),
      updateIcon: vi.fn(),
      removeRoomItem: vi.fn(),
      removeIcon: vi.fn(),
    })
    mocks.notesStore.notes = []
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test('a realtime echo does not clobber the notes field mid-typing', async () => {
    const wrapper = mountWithRoom()
    const notes = wrapper.get('.ds-content-card textarea')

    await notes.setValue('old and more typing')
    mocks.dungeonStore.rooms.set('r1', room({ items: [item({ notes: 'old' })] }))
    await nextTick()

    expect(notes.element.value).toBe('old and more typing')
  })

  test('debounce fires one merged patch with the room captured at type time', async () => {
    const wrapper = mountWithRoom()

    await wrapper.get('.ds-content-card input.ds-content-name-input').setValue('gilded chest')
    await wrapper.get('.ds-content-card textarea').setValue('trapped, probably')
    vi.advanceTimersByTime(400)

    expect(mocks.dungeonStore.updateRoomItem).toHaveBeenCalledTimes(1)
    expect(mocks.dungeonStore.updateRoomItem).toHaveBeenCalledWith('r1', 'i1', {
      label: 'gilded chest',
      notes: 'trapped, probably',
    })
  })

  test('blur flushes immediately and hands display back to the store', async () => {
    const wrapper = mountWithRoom()
    const notes = wrapper.get('.ds-content-card textarea')

    await notes.setValue('typed')
    await notes.trigger('blur')
    expect(mocks.dungeonStore.updateRoomItem).toHaveBeenCalledWith('r1', 'i1', { notes: 'typed' })

    mocks.dungeonStore.rooms.set('r1', room({ items: [item({ notes: 'from server' })] }))
    await nextTick()
    expect(notes.element.value).toBe('from server')
  })

  test('changing selection flushes the pending patch', async () => {
    const wrapper = mountWithRoom()

    await wrapper.get('.ds-content-card textarea').setValue('half a thought')
    mocks.dungeonStore.selectedElement = null
    await nextTick()

    expect(mocks.dungeonStore.updateRoomItem).toHaveBeenCalledWith('r1', 'i1', { notes: 'half a thought' })
  })

  test('icon fields get the same draft protection and debounced save', async () => {
    const wrapper = mountWithIcon()
    const notes = wrapper.get('.ds-content-card textarea')

    await notes.setValue('old but longer')
    mocks.dungeonStore.icons.set('ic1', icon({ notes: 'old' }))
    await nextTick()
    expect(notes.element.value).toBe('old but longer')

    vi.advanceTimersByTime(400)
    expect(mocks.dungeonStore.updateIcon).toHaveBeenCalledWith('ic1', { notes: 'old but longer' })
  })
})
