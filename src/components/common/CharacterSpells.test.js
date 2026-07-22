import { describe, expect, test, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import CharacterSpells from './CharacterSpells.vue'

const spells = vi.hoisted(() => [{
  id: 'spell-1',
  name: 'Antimagic Shell',
  data: {
    tier: 5,
    class: 'wizard',
    duration: 'Focus',
    range: 'Self',
    description: 'An invisible, near-sized cube of null-magic appears centered on you.',
  },
}])

vi.mock('@/stores/compendiumStore.js', () => ({ useCompendiumStore: () => ({ spells }) }))

describe('CharacterSpells', () => {
  test('expands a known spell into its complete reference details', async () => {
    const wrapper = mount(CharacterSpells, { props: { character: { spellsKnown: 'ANTIMAGIC SHELL' } } })
    expect(wrapper.text()).toContain('Antimagic Shell')
    expect(wrapper.text()).toContain('Tier 5')
    await wrapper.find('.spell-head').trigger('click')
    expect(wrapper.text()).toContain('wizard')
    expect(wrapper.text()).toContain('Focus')
    expect(wrapper.text()).toContain('Self')
    expect(wrapper.text()).toContain('An invisible, near-sized cube of null-magic appears centered on you.')
  })

  test('keeps unmatched imported spell names visible', async () => {
    const wrapper = mount(CharacterSpells, { props: { character: { spellsKnown: 'Unknown Spell' } } })
    await wrapper.find('.spell-head').trigger('click')
    expect(wrapper.text()).toContain('Unknown Spell')
    expect(wrapper.text()).toContain('No matching spell in the Codex')
  })
})
