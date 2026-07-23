import { beforeEach, describe, expect, test, vi } from 'vitest'
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

const session = vi.hoisted(() => ({ playMode: 'gm_less' }))
vi.mock('@/stores/sessionStore.js', () => ({ useSessionStore: () => session }))

describe('CharacterSpells', () => {
  beforeEach(() => {
    session.playMode = 'gm_less'
  })
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

  test('never mentions the Codex in gm-led sessions', async () => {
    session.playMode = 'gm'
    const wrapper = mount(CharacterSpells, { props: { character: { spellsKnown: 'Unknown Spell' } } })
    await wrapper.find('.spell-head').trigger('click')
    expect(wrapper.text()).not.toContain('Codex')
    expect(wrapper.text()).toContain('No spell details recorded')
  })

  test('emits the spell name when an editor removes a spell', async () => {
    const wrapper = mount(CharacterSpells, { props: { character: { spellsKnown: 'ANTIMAGIC SHELL' }, editable: true } })
    await wrapper.find('.spell-head').trigger('click')
    await wrapper.find('.spell-remove').trigger('click')
    expect(wrapper.emitted('remove')[0]).toEqual(['Antimagic Shell'])
  })

  test('lets an editor save details for an unmatched spell', async () => {
    const wrapper = mount(CharacterSpells, { props: { character: { spellsKnown: 'Unknown Spell' }, editable: true } })
    await wrapper.find('.spell-head').trigger('click')
    const inputs = wrapper.findAll('.spell-manual input')
    await inputs[0].setValue('2')
    await inputs[1].setValue('wizard')
    await wrapper.find('.spell-manual textarea').setValue('A player-authored effect.')
    await wrapper.find('.spell-manual').trigger('submit')
    expect(wrapper.emitted('save-details')[0][0]).toEqual({
      name: 'Unknown Spell',
      data: { tier: '2', class: 'wizard', description: 'A player-authored effect.' },
    })
  })

  test('renders saved manual details for an unmatched spell', async () => {
    const wrapper = mount(CharacterSpells, {
      props: { character: { spellsKnown: 'Unknown Spell', spellDetails: { 'Unknown Spell': { tier: 2, range: 'Near', description: 'A custom effect.' } } } },
    })
    expect(wrapper.text()).toContain('Tier 2')
    await wrapper.find('.spell-head').trigger('click')
    expect(wrapper.text()).toContain('Near')
    expect(wrapper.text()).toContain('A custom effect.')
    expect(wrapper.text()).not.toContain('No matching spell in the Codex')
    expect(wrapper.find('.spell-manual').exists()).toBe(false)
  })

  test('lets an editor revise saved manual details', async () => {
    const wrapper = mount(CharacterSpells, {
      props: { character: { spellsKnown: 'Unknown Spell', spellDetails: { 'Unknown Spell': { tier: '2' } } }, editable: true },
    })
    await wrapper.find('.spell-head').trigger('click')
    expect(wrapper.find('.spell-manual input').element.value).toBe('2')
  })
})
