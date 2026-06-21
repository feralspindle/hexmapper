import { describe, test, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import HexCell from './HexCell.vue'

const mountCell = (props = {}) =>
  mount(HexCell, { props: { q: 0, r: 0, ...props } })

describe('HexCell', () => {
  test('renders a hex polygon and emits click', async () => {
    const wrapper = mountCell({ isGM: true })
    expect(wrapper.find('polygon.hex-cell-poly').exists()).toBe(true)

    await wrapper.find('g.hex-cell').trigger('click')
    expect(wrapper.emitted('click')).toHaveLength(1)
  })

  test('emits contextmenu', async () => {
    const wrapper = mountCell({ isGM: true })
    await wrapper.find('g.hex-cell').trigger('contextmenu')
    expect(wrapper.emitted('contextmenu')).toHaveLength(1)
  })

  test('hides cell contents from players when fog is on and the cell is unrevealed', () => {
    const wrapper = mountCell({
      isGM: false,
      fogMode: true,
      cell: { revealed: false, terrain_type: 'water', label: 'Secret Lake' },
    })
    const fill = wrapper.find('polygon.hex-cell-poly').attributes('fill')
    expect(fill).toBe('#111827')
    expect(wrapper.text()).not.toContain('Secret Lake')
  })

  test('paints the terrain color for the GM in blank mode', () => {
    const wrapper = mountCell({
      isGM: true,
      cell: { terrain_type: 'water' },
    })
    expect(wrapper.find('polygon.hex-cell-poly').attributes('fill')).toBe('#4a90b8')
  })

  test('shows the cell label to players when revealed', () => {
    const wrapper = mountCell({
      isGM: false,
      fogMode: true,
      cell: { revealed: true, label: 'Bree' },
    })
    expect(wrapper.text()).toContain('Bree')
  })
})
