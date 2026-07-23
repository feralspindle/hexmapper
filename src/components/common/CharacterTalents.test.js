import { describe, expect, test } from 'vitest'
import { mount } from '@vue/test-utils'
import CharacterTalents from './CharacterTalents.vue'

const character = {
  levels: [{ level: 1, talentRolledName: 'StatBonus', talentRolledDesc: '+2 to Strength, Dexterity, or Charisma stat' }],
  bonuses: [
    { sourceType: 'Ancestry', sourceName: 'Half-Orc', sourceCategory: 'Trait', gainedAtLevel: 1, name: 'Mighty', bonusName: 'Plus1AttackAndDamageMelee', bonusTo: 'All Melee Weapons', bonusAmount: 1 },
    { sourceType: 'Class', sourceName: 'Paladin', sourceCategory: 'Talent', gainedAtLevel: 1, name: 'StatBonus', bonusTo: 'CHA:+2', bonusName: 'StatBonus' },
  ],
}

describe('CharacterTalents', () => {
  test('expands an imported talent into its details', async () => {
    const wrapper = mount(CharacterTalents, { props: { character } })
    expect(wrapper.text()).toContain('Mighty')
    expect(wrapper.text()).toContain('Trait')
    await wrapper.findAll('.talent-head')[1].trigger('click')
    expect(wrapper.text()).toContain('Paladin (Class)')
    expect(wrapper.text()).toContain('CHA:+2')
    expect(wrapper.text()).toContain('+2 to Strength, Dexterity, or Charisma stat')
  })

  test('emits the bonus index when an editor removes a talent', async () => {
    const wrapper = mount(CharacterTalents, { props: { character, editable: true } })
    await wrapper.findAll('.talent-head')[1].trigger('click')
    await wrapper.find('.talent-remove').trigger('click')
    expect(wrapper.emitted('remove')[0]).toEqual([1])
  })

  test('hides the remove button for rolled talents without a bonus entry', async () => {
    const wrapper = mount(CharacterTalents, {
      props: { character: { levels: [{ level: 2, talentRolledName: 'Backstab', talentRolledDesc: '+1 backstab dice' }] }, editable: true },
    })
    await wrapper.find('.talent-head').trigger('click')
    expect(wrapper.text()).toContain('+1 backstab dice')
    expect(wrapper.find('.talent-remove').exists()).toBe(false)
  })

  test('shows the empty state only when asked', () => {
    expect(mount(CharacterTalents, { props: { character: {}, showEmpty: true } }).text()).toContain('No talents recorded')
    expect(mount(CharacterTalents, { props: { character: {} } }).text()).toBe('')
  })
})
