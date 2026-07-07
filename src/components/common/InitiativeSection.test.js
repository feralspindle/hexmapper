import { describe, test, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import InitiativeSection from './InitiativeSection.vue'

const mocks = vi.hoisted(() => ({
  sessionStore: {
    initiativeState: { entries: [], active_id: null, round: 1 },
    initiativeOp: vi.fn(),
  },
  characterStore: {
    characters: [],
  },
}))

vi.mock('@/stores/sessionStore.js', () => ({
  useSessionStore: () => mocks.sessionStore,
}))
vi.mock('@/stores/characterStore.js', () => ({
  useCharacterStore: () => mocks.characterStore,
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
    mocks.sessionStore.initiativeOp.mockReset()
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

  test('"3 goblins" becomes an add_group op', async () => {
    const wrapper = mount(InitiativeSection)

    await wrapper.get('[data-testid="initiative-monster-input"]').setValue('3 goblins')
    await wrapper.get('[data-testid="initiative-add-monsters"]').trigger('click')

    expect(mocks.sessionStore.initiativeOp).toHaveBeenCalledWith('add_group', { name: 'goblins', count: 3 })
  })

  test('a bare name becomes a single monster add', async () => {
    const wrapper = mount(InitiativeSection)

    await wrapper.get('[data-testid="initiative-monster-input"]').setValue('ogre')
    await wrapper.get('[data-testid="initiative-add-monsters"]').trigger('click')

    expect(mocks.sessionStore.initiativeOp).toHaveBeenCalledWith('add', { kind: 'monster', name: 'ogre' })
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
})
