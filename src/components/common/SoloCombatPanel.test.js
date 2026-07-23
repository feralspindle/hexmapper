import { beforeEach, describe, expect, test, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import SoloCombatPanel from './SoloCombatPanel.vue'

const mocks = vi.hoisted(() => ({
  session: { initiativeState: { entries: [], active_id: null, round: 1 }, initiativeOp: vi.fn(), addFoesToInitiative: vi.fn() },
  characters: {
    characters: [{ id: 'pc-1', data: { name: 'Mara', armorClass: 15, currentHp: 8, maxHitPoints: 10, stats: { STR: 16 }, conditions: ['poisoned'], attacks: [{ id: 'a-1', raw: 'Sword: +2', damageDie: '1d8+1', statKey: 'STR' }] } }],
    adjustHpForChar: vi.fn(),
    updateFieldForChar: vi.fn(),
  },
  blocks: { monsters: [{ id: 'foe-1', data: { name: 'Goblin', ac: 12, level: 1, maxHp: 4, attacks: 'spear +2 (1d6)', notes: 'Flees when alone.' } }], adjustHp: vi.fn() },
  dice: { rollDice: vi.fn() },
}))

vi.mock('@/stores/sessionStore.js', () => ({ useSessionStore: () => mocks.session }))
vi.mock('@/stores/characterStore.js', async importOriginal => ({ ...(await importOriginal()), useCharacterStore: () => mocks.characters }))
vi.mock('@/stores/statBlockStore.js', () => ({ useStatBlockStore: () => mocks.blocks }))
vi.mock('@/stores/diceStore.js', () => ({ useDiceStore: () => mocks.dice }))
vi.mock('@/stores/compendiumStore.js', () => ({ useCompendiumStore: () => ({ spells: [] }) }))

const foeEntry = (overrides = {}) => ({
  id: 'i-1',
  kind: 'monster',
  name: 'Goblin',
  character_id: null,
  stat_block_id: 'foe-1',
  hp: 3,
  max_hp: 4,
  initiative: 12,
  ...overrides,
})

describe('SoloCombatPanel', () => {
  beforeEach(() => {
    mocks.session.initiativeState = { entries: [], active_id: null, round: 1 }
    mocks.session.initiativeOp.mockReset()
    mocks.session.addFoesToInitiative.mockReset()
    mocks.characters.adjustHpForChar.mockReset()
    mocks.characters.updateFieldForChar.mockReset()
    mocks.dice.rollDice.mockReset()
  })

  test('shows party attacks and stats for foes in the initiative order', () => {
    mocks.session.initiativeState = { entries: [foeEntry()], active_id: null, round: 1 }
    const wrapper = mount(SoloCombatPanel)
    expect(wrapper.text()).toContain('Mara')
    expect(wrapper.text()).toContain('Sword')
    expect(wrapper.text()).toContain('Goblin')
    expect(wrapper.text()).toContain('spear +2 (1d6)')
    expect(wrapper.text()).toContain('Flees when alone.')
  })

  test('codex monsters outside the order stay out of the foe list', () => {
    const wrapper = mount(SoloCombatPanel)
    expect(wrapper.findAll('.combat-card.foe')).toHaveLength(0)
    expect(wrapper.text()).toContain('Add foes above or from the Codex')
  })

  test('two entries from the same stat block get their own cards and hp', () => {
    mocks.session.initiativeState = {
      entries: [
        foeEntry({ id: 'i-1', name: 'Goblin 1', hp: 4 }),
        foeEntry({ id: 'i-2', name: 'Goblin 2', hp: 1 }),
      ],
      active_id: null,
      round: 1,
    }
    const wrapper = mount(SoloCombatPanel)
    const cards = wrapper.findAll('.combat-card.foe')
    expect(cards).toHaveLength(2)
    expect(cards[0].text()).toContain('Goblin 1')
    expect(cards[0].text()).toContain('4/4')
    expect(cards[1].text()).toContain('Goblin 2')
    expect(cards[1].text()).toContain('1/4')
  })

  test('rolls attacks for the character without changing the active sheet', async () => {
    const wrapper = mount(SoloCombatPanel)
    await wrapper.find('.combat-attack').trigger('click')
    expect(mocks.dice.rollDice).toHaveBeenCalledWith({ d20: 1 }, 3, 'Sword', 'pc-1')
  })

  test('adjusts party and foe hp from their cards', async () => {
    mocks.session.initiativeState = { entries: [foeEntry()], active_id: null, round: 1 }
    const wrapper = mount(SoloCombatPanel)
    const damageButtons = wrapper.findAll('button[title="Damage (shift: 5)"]')
    await damageButtons[0].trigger('click')
    await damageButtons[1].trigger('click')
    expect(mocks.characters.adjustHpForChar).toHaveBeenCalledWith('pc-1', -1)
    expect(mocks.session.initiativeOp).toHaveBeenCalledWith('adjust_hp', { entry_id: 'i-1', delta: -1 })
  })

  test('shift-clicking damage hits for five', async () => {
    mocks.session.initiativeState = { entries: [foeEntry()], active_id: null, round: 1 }
    const wrapper = mount(SoloCombatPanel)
    const foeDamage = wrapper.findAll('button[title="Damage (shift: 5)"]')[1]
    await foeDamage.trigger('click', { shiftKey: true })
    expect(mocks.session.initiativeOp).toHaveBeenCalledWith('adjust_hp', { entry_id: 'i-1', delta: -5 })
  })

  test('typing an exact hp value sends set_hp', async () => {
    mocks.session.initiativeState = { entries: [foeEntry()], active_id: null, round: 1 }
    const wrapper = mount(SoloCombatPanel)
    const foeCard = wrapper.find('.combat-card.foe')
    await foeCard.find('button[title="Set exact HP"]').trigger('click')
    const input = foeCard.find('input[aria-label="Set hit points"]')
    await input.setValue('2')
    await input.trigger('keydown.enter')
    expect(mocks.session.initiativeOp).toHaveBeenCalledWith('set_hp', { entry_id: 'i-1', hp: 2 })
  })

  test('foe conditions round-trip through set_conditions', async () => {
    mocks.session.initiativeState = { entries: [foeEntry({ conditions: ['stunned'] })], active_id: null, round: 1 }
    const wrapper = mount(SoloCombatPanel)
    const foeCard = wrapper.find('.combat-card.foe')

    await foeCard.find('select.condition-add').setValue('poisoned')
    expect(mocks.session.initiativeOp).toHaveBeenCalledWith('set_conditions', { entry_id: 'i-1', conditions: ['stunned', 'poisoned'] })

    await foeCard.find('.condition-badge').trigger('click')
    expect(mocks.session.initiativeOp).toHaveBeenCalledWith('set_conditions', { entry_id: 'i-1', conditions: [] })
  })

  test('removing a foe drops it from the order', async () => {
    mocks.session.initiativeState = { entries: [foeEntry()], active_id: null, round: 1 }
    const wrapper = mount(SoloCombatPanel)
    await wrapper.find('.combat-card.foe button[title="Remove from combat"]').trigger('click')
    expect(mocks.session.initiativeOp).toHaveBeenCalledWith('remove', { entry_id: 'i-1' })
  })

  test('the foe toolbar links a codex monster by name and starts hp full', async () => {
    const wrapper = mount(SoloCombatPanel)
    await wrapper.find('.combat-toolbar input').setValue('3 goblins')
    await wrapper.find('.combat-toolbar input').trigger('keydown.enter')
    expect(mocks.session.addFoesToInitiative).toHaveBeenCalledWith({
      name: 'Goblin',
      count: 3,
      statBlockId: 'foe-1',
      hp: 4,
      maxHp: 4,
    })
  })

  test('can remove a condition without opening the character sheet', async () => {
    const wrapper = mount(SoloCombatPanel)
    await wrapper.find('.condition-badge').trigger('click')
    expect(mocks.characters.updateFieldForChar).toHaveBeenCalledWith('pc-1', 'conditions', [])
  })
})
