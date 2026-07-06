import { describe, test, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import HexLeftToolbar from './HexLeftToolbar.vue'

const mountToolbar = (props = {}) => mount(HexLeftToolbar, { props })

const has = (wrapper, testid) => wrapper.find(`[data-testid="${testid}"]`).exists()

// The GM-only reveal/hide/map tools are the UI half of the hex-visibility security
// posture: a player must never be able to reveal or hide hexes, or open map image
// settings. These assert the controls are absent from the DOM for players, not just
// hidden - an absent control can't be clicked or driven by a script.
describe('HexLeftToolbar GM gating', () => {
  test('fog-of-war GM sees reveal, hide, reveal-all, hide-all and map settings', () => {
    const wrapper = mountToolbar({ hexMode: 'fow', isGM: true })
    for (const id of ['hex-tool-reveal', 'hex-tool-hide', 'hex-reveal-all', 'hex-hide-all', 'hex-map-settings']) {
      expect(has(wrapper, id), `GM should see ${id}`).toBe(true)
    }
  })

  test('fog-of-war player sees none of the GM reveal or map controls', () => {
    const wrapper = mountToolbar({ hexMode: 'fow', isGM: false })
    for (const id of ['hex-tool-reveal', 'hex-tool-hide', 'hex-reveal-all', 'hex-hide-all', 'hex-map-settings', 'hex-exploration-mode']) {
      expect(has(wrapper, id), `player should not see ${id}`).toBe(false)
    }
  })

  test('blank map gates map settings to the GM but leaves terrain tools for players', () => {
    const gm = mountToolbar({ hexMode: 'blank', isGM: true })
    expect(has(gm, 'hex-map-settings')).toBe(true)

    const player = mountToolbar({ hexMode: 'blank', isGM: false })
    expect(has(player, 'hex-map-settings')).toBe(false)
    // Painting and marking are player-usable on blank maps, so they stay.
    expect(has(player, 'hex-tool-paint')).toBe(true)
    expect(has(player, 'hex-tool-marker')).toBe(true)
  })

  test('exploration toggle only renders when it is available', () => {
    const without = mountToolbar({ hexMode: 'fow', isGM: true, explorationAvailable: false })
    expect(has(without, 'hex-exploration-mode')).toBe(false)

    const withIt = mountToolbar({ hexMode: 'fow', isGM: true, explorationAvailable: true })
    expect(has(withIt, 'hex-exploration-mode')).toBe(true)
  })

  test('view, party and sound controls render for everyone regardless of role', () => {
    const player = mountToolbar({ hexMode: 'fow', isGM: false })
    for (const id of ['hex-tool-select', 'hex-tool-pan', 'hex-party-toggle', 'hex-vault-toggle', 'hex-sound-toggle']) {
      expect(has(player, id), `everyone should see ${id}`).toBe(true)
    }
  })
})

describe('HexLeftToolbar tool events', () => {
  test('GM reveal and hide buttons emit their tool selection', async () => {
    const wrapper = mountToolbar({ hexMode: 'fow', isGM: true })
    await wrapper.get('[data-testid="hex-tool-reveal"]').trigger('click')
    await wrapper.get('[data-testid="hex-tool-hide"]').trigger('click')
    expect(wrapper.emitted('tool')).toEqual([['reveal'], ['hide']])
  })

  test('reveal-all and hide-all emit their own events', async () => {
    const wrapper = mountToolbar({ hexMode: 'fow', isGM: true })
    await wrapper.get('[data-testid="hex-reveal-all"]').trigger('click')
    await wrapper.get('[data-testid="hex-hide-all"]').trigger('click')
    expect(wrapper.emitted('reveal-all')).toHaveLength(1)
    expect(wrapper.emitted('hide-all')).toHaveLength(1)
  })
})
