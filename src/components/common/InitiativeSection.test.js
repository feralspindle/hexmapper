import { describe, test, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import InitiativeSection from './InitiativeSection.vue'

const mocks = vi.hoisted(() => ({
  sessionStore: {
    initiativeState: { entries: [], active_id: null, round: 1 },
    initiativeOp: vi.fn(),
    addFoesToInitiative: vi.fn(),
  },
  characterStore: {
    characters: [],
  },
  statBlockStore: {
    monsters: [],
  },
}))

vi.mock('@/stores/sessionStore.js', () => ({
  useSessionStore: () => mocks.sessionStore,
}))
vi.mock('@/stores/characterStore.js', () => ({
  useCharacterStore: () => mocks.characterStore,
}))
vi.mock('@/stores/statBlockStore.js', () => ({
  useStatBlockStore: () => mocks.statBlockStore,
}))

const entry = (overrides = {}) => ({
  id: 'e1',
  kind: 'monster',
  name: 'Goblin 1',
  character_id: null,
  initiative: 12,
  ...overrides,
})

describe('InitiativeSection', () => {
  beforeEach(() => {
    mocks.sessionStore.initiativeState = { entries: [], active_id: null, round: 1 }
    mocks.characterStore.characters = []
    mocks.statBlockStore.monsters = []
    mocks.sessionStore.initiativeOp.mockReset()
    mocks.sessionStore.addFoesToInitiative.mockReset()
  })

  test('renders the order sorted by initiative, active row highlighted', () => {
    mocks.sessionStore.initiativeState = {
      entries: [
        entry({ id: 'low', name: 'Brey', initiative: 4 }),
        entry({ id: 'high', name: 'Ranna', initiative: 19, kind: 'pc' }),
      ],
      active_id: 'high',
      round: 2,
    }
    const wrapper = mount(InitiativeSection)

    const rows = wrapper.findAll('[data-testid="initiative-entry"]')
    expect(rows[0].text()).toContain('Ranna')
    expect(rows[0].classes()).toContain('init-row--active')
    expect(rows[1].text()).toContain('Brey')
    expect(wrapper.text()).toContain('round 2')
  })

  test('"3 goblins" adds three foes', async () => {
    const wrapper = mount(InitiativeSection)

    await wrapper.get('[data-testid="initiative-monster-input"]').setValue('3 goblins')
    await wrapper.get('[data-testid="initiative-add-monsters"]').trigger('click')

    expect(mocks.sessionStore.addFoesToInitiative).toHaveBeenCalledWith({
      name: 'goblins',
      count: 3,
      statBlockId: null,
      hp: null,
      maxHp: null,
    })
  })

  test('a bare name becomes a single foe', async () => {
    const wrapper = mount(InitiativeSection)

    await wrapper.get('[data-testid="initiative-monster-input"]').setValue('ogre')
    await wrapper.get('[data-testid="initiative-add-monsters"]').trigger('click')

    expect(mocks.sessionStore.addFoesToInitiative).toHaveBeenCalledWith({
      name: 'ogre',
      count: 1,
      statBlockId: null,
      hp: null,
      maxHp: null,
    })
  })

  test('a name matching a codex monster links it and starts hp full', async () => {
    mocks.statBlockStore.monsters = [{ id: 'b1', data: { name: 'Goblin', maxHp: 4 } }]
    const wrapper = mount(InitiativeSection)

    await wrapper.get('[data-testid="initiative-monster-input"]').setValue('2 goblins')
    await wrapper.get('[data-testid="initiative-add-monsters"]').trigger('click')

    expect(mocks.sessionStore.addFoesToInitiative).toHaveBeenCalledWith({
      name: 'Goblin',
      count: 2,
      statBlockId: 'b1',
      hp: 4,
      maxHp: 4,
    })
  })

  test('add party skips characters already in the order', async () => {
    mocks.characterStore.characters = [
      { id: 'c1', data: { name: 'Ranna', initiative: 15 } },
      { id: 'c2', data: { name: 'Brey' } },
    ]
    mocks.sessionStore.initiativeState = {
      entries: [entry({ id: 'e1', kind: 'pc', character_id: 'c1', name: 'Ranna' })],
      active_id: null,
      round: 1,
    }
    const wrapper = mount(InitiativeSection)

    await wrapper.get('[data-testid="initiative-add-party"]').trigger('click')
    await new Promise(resolve => setTimeout(resolve))

    expect(mocks.sessionStore.initiativeOp).toHaveBeenCalledTimes(1)
    expect(mocks.sessionStore.initiativeOp).toHaveBeenCalledWith('add', {
      kind: 'pc',
      name: 'Brey',
      character_id: 'c2',
      initiative: null,
    })
  })

  test('advance is disabled with an empty order', () => {
    const wrapper = mount(InitiativeSection)
    expect(wrapper.get('[data-testid="initiative-advance"]').attributes('disabled')).toBeDefined()
  })

  test('dropping a pc sends d4 + con mod rounds, floored at 1', async () => {
    mocks.characterStore.characters = [{ id: 'c1', data: { name: 'Brey', stats: { CON: 6 } } }]
    mocks.sessionStore.initiativeState = {
      entries: [entry({ id: 'e1', kind: 'pc', character_id: 'c1', name: 'Brey' })],
      active_id: null,
      round: 1,
    }
    const wrapper = mount(InitiativeSection)

    await wrapper.get('[data-testid="initiative-drop"]').trigger('click')

    const [op, payload] = mocks.sessionStore.initiativeOp.mock.calls[0]
    expect(op).toBe('death_start')
    // con 6 -> mod -2, d4 1..4 -> raw -1..2, floored at 1 -> always 1 or 2
    expect(payload.entry_id).toBe('e1')
    expect(payload.rounds).toBeGreaterThanOrEqual(1)
    expect(payload.rounds).toBeLessThanOrEqual(2)
  })

  test('a dying entry shows the countdown and a stabilize button', async () => {
    mocks.sessionStore.initiativeState = {
      entries: [entry({ id: 'e1', kind: 'pc', name: 'Brey', death: { total: 3, left: 2, dead: false } })],
      active_id: null,
      round: 1,
    }
    const wrapper = mount(InitiativeSection)

    expect(wrapper.get('[data-testid="initiative-dying"]').text()).toContain('2')
    await wrapper.get('[data-testid="initiative-stabilize"]').trigger('click')
    expect(mocks.sessionStore.initiativeOp).toHaveBeenCalledWith('death_clear', { entry_id: 'e1' })
  })

  test('a dead entry reads dead and monsters get no drop button', () => {
    mocks.sessionStore.initiativeState = {
      entries: [
        entry({ id: 'e1', kind: 'pc', name: 'Brey', death: { total: 2, left: 0, dead: true } }),
        entry({ id: 'e2', kind: 'monster', name: 'Goblin 1' }),
      ],
      active_id: null,
      round: 1,
    }
    const wrapper = mount(InitiativeSection)

    expect(wrapper.get('[data-testid="initiative-dead"]').text()).toContain('dead')
    expect(wrapper.findAll('[data-testid="initiative-drop"]')).toHaveLength(0)
  })
})
