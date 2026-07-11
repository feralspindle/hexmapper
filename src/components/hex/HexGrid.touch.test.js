import { describe, expect, test, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import HexGrid from './HexGrid.vue'

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
    props: { isGM: true, fogMode: true, mapGridCols: 4, mapGridRows: 4 },
    attachTo: document.body,
    global: { stubs: { HexCell: true } },
  })
}

// the pan/zoom transform lives on the first <g> inside the svg
function transform(wrapper) {
  return wrapper.find('svg > g').attributes('transform')
}

function parse(t) {
  const translate = /translate\(([-\d.]+), ([-\d.]+)\)/.exec(t)
  const scale = /scale\(([-\d.]+)\)/.exec(t)
  return {
    x: parseFloat(translate[1]),
    y: parseFloat(translate[2]),
    zoom: parseFloat(scale[1]),
  }
}

describe('HexGrid touch gestures', () => {
  test('one-finger drag pans the map', async () => {
    const wrapper = mountGrid()
    const svg = wrapper.find('svg')
    const before = parse(transform(wrapper))

    await svg.trigger('touchstart', { touches: [{ clientX: 100, clientY: 100 }] })
    await svg.trigger('touchmove', { touches: [{ clientX: 160, clientY: 130 }] })
    await svg.trigger('touchend', { touches: [] })

    const after = parse(transform(wrapper))
    expect(after.x).toBeCloseTo(before.x + 60, 1)
    expect(after.y).toBeCloseTo(before.y + 30, 1)
    wrapper.unmount()
  })

  test('a tap below the drag threshold does not pan', async () => {
    const wrapper = mountGrid()
    const svg = wrapper.find('svg')
    const before = parse(transform(wrapper))

    await svg.trigger('touchstart', { touches: [{ clientX: 100, clientY: 100 }] })
    await svg.trigger('touchmove', { touches: [{ clientX: 101, clientY: 101 }] })
    await svg.trigger('touchend', { touches: [] })

    const after = parse(transform(wrapper))
    expect(after.x).toBeCloseTo(before.x, 1)
    expect(after.y).toBeCloseTo(before.y, 1)
    wrapper.unmount()
  })

  test('two-finger pinch zooms the map', async () => {
    const wrapper = mountGrid()
    const svg = wrapper.find('svg')
    const before = parse(transform(wrapper))

    await svg.trigger('touchstart', {
      touches: [
        { clientX: 100, clientY: 100 },
        { clientX: 200, clientY: 100 },
      ],
    })
    // fingers spread to 2x the initial distance -> zoom in ~2x (clamped at 3)
    await svg.trigger('touchmove', {
      touches: [
        { clientX: 50, clientY: 100 },
        { clientX: 250, clientY: 100 },
      ],
    })
    await svg.trigger('touchend', { touches: [] })

    const after = parse(transform(wrapper))
    expect(after.zoom).toBeGreaterThan(before.zoom)
    wrapper.unmount()
  })
})
