import { beforeEach, describe, expect, test, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import SoloCombatPanel from './SoloCombatPanel.vue'

const mocks = vi.hoisted(() => ({
  session: { initiativeState: { entries: [], active_id: null, round: 1 }, initiativeOp: vi.fn() },
  characters: {
    characters: [{ id: 'pc-1', data: { name: 'Mara', armorClass: 15, currentHp: 8, maxHitPoints: 10, stats: { STR: 16 }, conditions: ['poisoned'], attacks: [{ id: 'a-1', raw: 'Sword: +2', damageDie: '1d8+1', statKey: 'STR' }] } }],
    adjustHpForChar: vi.fn(),
    updateFieldForChar: vi.fn(),
  },
  blocks: { monsters: [{ id: 'foe-1', data: { name: 'Goblin', ac: 12, level: 1, currentHp: 3, maxHp: 4, attacks: 'spear +2 (1d6)', notes: 'Flees when alone.' } }], adjustHp: vi.fn() },
  dice: { rollDice: vi.fn() },
}))

vi.mock('@/stores/sessionStore.js', () => ({ useSessionStore: () => mocks.session }))
vi.mock('@/stores/characterStore.js', async importOriginal => ({ ...(await importOriginal()), useCharacterStore: () => mocks.characters }))
vi.mock('@/stores/statBlockStore.js', () => ({ useStatBlockStore: () => mocks.blocks }))
vi.mock('@/stores/diceStore.js', () => ({ useDiceStore: () => mocks.dice }))
vi.mock('@/stores/compendiumStore.js', () => ({ useCompendiumStore: () => ({ spells: [] }) }))

describe('SoloCombatPanel', () => {
  beforeEach(() => {
    mocks.session.initiativeState = { entries: [], active_id: null, round: 1 }
    mocks.session.initiativeOp.mockReset()
    mocks.characters.adjustHpForChar.mockReset()
    mocks.characters.updateFieldForChar.mockReset()
    mocks.blocks.adjustHp.mockReset()
    mocks.dice.rollDice.mockReset()
  })

  test('shows party attacks and monster combat details together', () => {
    const wrapper = mount(SoloCombatPanel)
    expect(wrapper.text()).toContain('Mara')
    expect(wrapper.text()).toContain('Sword')
    expect(wrapper.text()).toContain('Goblin')
    expect(wrapper.text()).toContain('spear +2 (1d6)')
    expect(wrapper.text()).toContain('Flees when alone.')
  })

  test('rolls attacks for the character without changing the active sheet', async () => {
    const wrapper = mount(SoloCombatPanel)
    await wrapper.find('.combat-attack').trigger('click')
    expect(mocks.dice.rollDice).toHaveBeenCalledWith({ d20: 1 }, 3, 'Sword', 'pc-1')
  })

  test('adjusts party and foe hp from their cards', async () => {
    const wrapper = mount(SoloCombatPanel)
    const damageButtons = wrapper.findAll('button[title="Damage"]')
    await damageButtons[0].trigger('click')
    await damageButtons[1].trigger('click')
    expect(mocks.characters.adjustHpForChar).toHaveBeenCalledWith('pc-1', -1)
    expect(mocks.blocks.adjustHp).toHaveBeenCalledWith('foe-1', -1)
  })

  test('can remove a condition without opening the character sheet', async () => {
    const wrapper = mount(SoloCombatPanel)
    await wrapper.find('.condition-badge').trigger('click')
    expect(mocks.characters.updateFieldForChar).toHaveBeenCalledWith('pc-1', 'conditions', [])
  })
})
