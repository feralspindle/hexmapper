import { beforeEach, describe, expect, test, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import HexInspectorSection from './HexInspectorSection.vue'

const mocks = vi.hoisted(() => ({
  hexStore: {},
  mapStore: {},
  notesStore: {},
  sessionStore: {},
  authStore: {},
}))

vi.mock('@/stores/hexStore.js', async (importOriginal) => {
  const actual = await importOriginal()
  const { reactive } = await import('vue')
  mocks.hexStore = reactive(mocks.hexStore)
  return { ...actual, useHexStore: () => mocks.hexStore }
})

vi.mock('@/stores/mapStore.js', () => ({
  useMapStore: () => mocks.mapStore,
}))

vi.mock('@/stores/notesStore.js', () => ({
  useNotesStore: () => mocks.notesStore,
}))

vi.mock('@/stores/sessionStore.js', () => ({
  useSessionStore: () => mocks.sessionStore,
}))

vi.mock('@/stores/authStore.js', () => ({
  useAuthStore: () => mocks.authStore,
}))

const has = (wrapper, testid) => wrapper.find(`[data-testid="${testid}"]`).exists()

describe('HexInspectorSection', () => {
  beforeEach(() => {
    Object.assign(mocks.hexStore, {
      selectedHex: { q: 1, r: 2 },
      selectedCell: { id: 'cell-1', label: '', revealed: true },
      hexDungeons: [],
      dungeonsLoading: false,
      partyHex: null,
      fetchDungeonsForHex: vi.fn(),
      deleteHex: vi.fn(),
      upsertHex: vi.fn(() => Promise.resolve()),
    })
    Object.assign(mocks.mapStore, {
      childMapsByHexId: new Map(),
      mapFogRevealAll: false,
      mapExplorationMode: false,
    })
    Object.assign(mocks.notesStore, {
      notes: [],
      loading: false,
      initForHex: vi.fn(),
      cleanup: vi.fn(),
    })
    Object.assign(mocks.sessionStore, {
      isGM: true,
      hexMode: 'full',
      playMode: 'gm',
      sessionId: 'sess-1',
    })
    Object.assign(mocks.authStore, {
      user: { id: 'user-1' },
    })
  })

  test('gm sees the clear hex data button', () => {
    const wrapper = mount(HexInspectorSection)
    expect(has(wrapper, 'clear-hex')).toBe(true)
  })

  test('players do not see the clear hex data button', () => {
    mocks.sessionStore.isGM = false
    const wrapper = mount(HexInspectorSection)
    expect(has(wrapper, 'clear-hex')).toBe(false)
  })

  const labelInput = wrapper => wrapper.find('input[placeholder="e.g. Thornwood Village"]')

  test('a store update cannot rewind the name while a save is in flight', async () => {
    vi.useFakeTimers()
    mocks.hexStore.upsertHex = vi.fn(() => new Promise(() => {}))
    const wrapper = mount(HexInspectorSection)

    await labelInput(wrapper).setValue('Thornw')
    vi.advanceTimersByTime(600)
    expect(mocks.hexStore.upsertHex).toHaveBeenCalledWith(1, 2, { label: 'Thornw', terrain_type: null })

    mocks.hexStore.selectedCell = { id: 'cell-1', label: 'Thornw', revealed: true }
    await wrapper.vm.$nextTick()
    expect(labelInput(wrapper).element.value).toBe('Thornw')
    vi.useRealTimers()
  })

  test('typing on while the previous save echoes back keeps every keystroke', async () => {
    vi.useFakeTimers()
    mocks.hexStore.upsertHex = vi.fn(() => new Promise(() => {}))
    const wrapper = mount(HexInspectorSection)

    await labelInput(wrapper).setValue('Thornw')
    vi.advanceTimersByTime(600)
    await labelInput(wrapper).setValue('Thornwood')

    mocks.hexStore.selectedCell = { id: 'cell-1', label: 'Thornw', revealed: true }
    await wrapper.vm.$nextTick()
    expect(labelInput(wrapper).element.value).toBe('Thornwood')
    vi.useRealTimers()
  })

  test('a remote edit refreshes the name when nothing is being typed', async () => {
    const wrapper = mount(HexInspectorSection)

    mocks.hexStore.selectedCell = { id: 'cell-1', label: 'Ruins of Vel', revealed: true }
    await wrapper.vm.$nextTick()
    expect(labelInput(wrapper).element.value).toBe('Ruins of Vel')
  })
})
