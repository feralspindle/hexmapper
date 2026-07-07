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
})
