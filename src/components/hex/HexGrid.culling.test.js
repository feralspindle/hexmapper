import { describe, expect, test, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import HexGrid from './HexGrid.vue'
import { DEFAULT_GRID_COLS, DEFAULT_GRID_ROWS } from '@/composables/useHexGeometry.js'

globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.mock('@/stores/hexStore.js', () => ({
  useHexStore: () => ({
    hexCells: new Map(),
    childMapsByHexId: new Map(),
    selectedHex: null,
    partyHex: null,
  }),
}))

vi.mock('@/stores/mapStore.js', () => ({
  useMapStore: () => ({
    childMapsByHexId: new Map(),
  }),
}))

function mountGrid() {
  return mount(HexGrid, {
    props: { isGM: true, fogMode: true },
    attachTo: document.body,
    global: { stubs: { HexCell: true } },
  })
}

function mountedKeys(wrapper) {
  return new Set(wrapper.findAll('hex-cell-stub').map(c => `${c.attributes('q')}:${c.attributes('r')}`))
}

describe('HexGrid viewport culling', () => {
  test('renders only cells near the viewport, not the whole logical grid', () => {
    const wrapper = mountGrid()
    const cells = wrapper.findAll('hex-cell-stub')

    expect(cells.length).toBeGreaterThan(0)
    expect(cells.length).toBeLessThan(DEFAULT_GRID_COLS * DEFAULT_GRID_ROWS)
    expect(mountedKeys(wrapper).has('0:0')).toBe(true)
    wrapper.unmount()
  })

  test('panning far away swaps the mounted cells and culls the origin', async () => {
    const wrapper = mountGrid()
    const svg = wrapper.find('svg')
    const before = mountedKeys(wrapper)

    await svg.trigger('touchstart', { touches: [{ clientX: 0, clientY: 0 }] })
    await svg.trigger('touchmove', { touches: [{ clientX: -1500, clientY: -800 }] })
    await svg.trigger('touchend', { touches: [] })

    const after = mountedKeys(wrapper)
    expect(after.size).toBeGreaterThan(0)
    expect(after.has('0:0')).toBe(false)
    expect([...after].some(key => before.has(key))).toBe(false)
    wrapper.unmount()
  })
})
