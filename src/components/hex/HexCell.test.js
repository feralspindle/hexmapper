import { describe, test, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { useUserPrefsStore } from '@/stores/userPrefsStore.js'
import HexCell from './HexCell.vue'

const mountCell = (props = {}) =>
  mount(HexCell, { props: { q: 0, r: 0, ...props } })

describe('HexCell', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })
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

  test('explicit hidden cell overrides map reveal-all for players', () => {
    const wrapper = mountCell({
      isGM: false,
      fogMode: true,
      mapFogRevealAll: true,
      cell: { revealed: false, terrain_type: 'water', label: 'Secret Lake' },
    })
    expect(wrapper.find('polygon.hex-cell-poly').attributes('fill')).toBe('#111827')
    expect(wrapper.text()).not.toContain('Secret Lake')
  })

  test('missing cell is visible when map reveal-all is on', () => {
    const wrapper = mountCell({
      isGM: false,
      fogMode: true,
      mapFogRevealAll: true,
      cell: null,
    })
    expect(wrapper.find('polygon.hex-cell-poly').attributes('fill')).not.toBe('#111827')
  })

  const landmark = JSON.stringify([{ id: 'm1', kind: 'landmark', label: 'Old Tower' }])

  test.each([
    ['fog', { fogMode: true }],
    ['image', { imageMode: true, mapFogRevealAll: true }],
  ])('markers render on a revealed hex in %s mode with a legibility shadow', (_, modeProps) => {
    const wrapper = mountCell({
      isGM: false,
      ...modeProps,
      cell: { revealed: true, marker_color: landmark },
    })
    expect(wrapper.attributes('data-marker-count')).toBe('1')
    expect(wrapper.text()).toContain('Old Tower')
    const label = wrapper.findAll('text').find(t => t.text() === 'Old Tower')
    expect(label.attributes('fill')).toBe('var(--ink, #1a0f06)')
  })

  test('markers stay hidden from players on an unrevealed fog hex', () => {
    const wrapper = mountCell({
      isGM: false,
      fogMode: true,
      cell: { revealed: false, marker_color: landmark },
    })
    expect(wrapper.text()).not.toContain('Old Tower')
  })

  test('markers stay hidden on an unexplored hex even for the GM', () => {
    const wrapper = mountCell({
      isGM: true,
      cell: { revealed: true, explored: false, marker_color: landmark },
    })
    expect(wrapper.text()).not.toContain('Old Tower')
  })

  test('markers and GM badges disappear when the player pref hides them', () => {
    useUserPrefsStore().setShowHexMarkers(false)
    const gmMarkers = JSON.stringify([{ id: 'g1', kind: 'trap', label: '' }])
    const wrapper = mountCell({
      isGM: true,
      cell: { marker_color: landmark, gm_markers: gmMarkers },
    })
    expect(wrapper.find('[data-testid="hex-marker-icon"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Old Tower')
  })

  test('marker label keeps its ink fill in blank mode', () => {
    const wrapper = mountCell({
      isGM: true,
      cell: { marker_color: landmark },
    })
    const label = wrapper.findAll('text').find(t => t.text() === 'Old Tower')
    expect(label.attributes('fill')).toBe('var(--ink, #1a0f06)')
  })

  test('note indicator renders only when the cell has notes', () => {
    const withNotes = mountCell({
      isGM: false,
      fogMode: true,
      cell: { revealed: true, note_count: 2 },
    })
    expect(withNotes.find('[data-testid="hex-note-indicator"]').exists()).toBe(true)
    expect(withNotes.attributes('data-note-count')).toBe('2')

    const withoutNotes = mountCell({
      isGM: false,
      fogMode: true,
      cell: { revealed: true, note_count: 0 },
    })
    expect(withoutNotes.find('[data-testid="hex-note-indicator"]').exists()).toBe(false)
    expect(withoutNotes.attributes('data-note-count')).toBe('0')
  })

  test('note indicator stays hidden from players on an unrevealed hex', () => {
    const wrapper = mountCell({
      isGM: false,
      fogMode: true,
      cell: { revealed: false, note_count: 2 },
    })
    expect(wrapper.find('[data-testid="hex-note-indicator"]').exists()).toBe(false)
  })
})
