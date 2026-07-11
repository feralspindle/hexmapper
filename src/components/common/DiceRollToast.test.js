import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { reactive, nextTick } from 'vue'

const kit = vi.hoisted(() => ({ dice: null }))

vi.mock('@/stores/diceStore.js', () => ({
  useDiceStore: () => kit.dice,
}))
vi.mock('@/composables/useGMLabel.js', () => ({
  useGMLabel: () => ({ gmName: (_id, name) => name }),
}))

import DiceRollToast from './DiceRollToast.vue'

const roll = (id, overrides = {}) => ({
  id,
  total: 15,
  pending: { d20: 1 },
  results: [{ die: 'd20', value: 15 }],
  modifier: 0,
  display_name: 'Robin',
  ...overrides,
})

async function pushRoll(rollEntry) {
  kit.dice.latestRoll = rollEntry
  await nextTick()
}

describe('DiceRollToast', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    kit.dice = reactive({ latestRoll: null })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test('shows the roll with total, formula, and roller name, then auto-dismisses after 5s', async () => {
    const wrapper = mount(DiceRollToast)
    await pushRoll(roll('r1'))

    expect(wrapper.text()).toContain('15')
    expect(wrapper.text()).toContain('1d20')
    expect(wrapper.text()).toContain('Robin')

    await vi.advanceTimersByTimeAsync(5100)
    expect(wrapper.findAll('.ds-roll-toast')).toHaveLength(0)
    wrapper.unmount()
  })

  test('the same roll id never produces a second toast', async () => {
    const wrapper = mount(DiceRollToast)
    await pushRoll(roll('r1'))
    kit.dice.latestRoll = null
    await nextTick()
    await pushRoll(roll('r1'))

    expect(wrapper.findAll('.ds-roll-toast')).toHaveLength(1)
    wrapper.unmount()
  })

  test('a natural 20 on a single d20 is a CRIT and a natural 1 is a FAIL', async () => {
    const wrapper = mount(DiceRollToast)

    await pushRoll(roll('crit', { total: 20, results: [{ die: 'd20', value: 20 }] }))
    expect(wrapper.text()).toContain('CRIT!')

    await pushRoll(roll('fumble', { total: 1, results: [{ die: 'd20', value: 1 }] }))
    expect(wrapper.text()).toContain('FAIL')
    wrapper.unmount()
  })

  test('a 20 rolled among multiple dice is not a crit', async () => {
    const wrapper = mount(DiceRollToast)
    await pushRoll(roll('multi', {
      pending: { d20: 2 },
      results: [{ die: 'd20', value: 20 }, { die: 'd20', value: 3 }],
      total: 23,
    }))

    expect(wrapper.text()).not.toContain('CRIT!')
    wrapper.unmount()
  })

  test('a negative modifier renders in the formula', async () => {
    const wrapper = mount(DiceRollToast)
    await pushRoll(roll('mod', { modifier: -2, total: 13 }))

    expect(wrapper.text()).toContain('1d20-2')
    wrapper.unmount()
  })

  test('at most five toasts stack at once', async () => {
    const wrapper = mount(DiceRollToast)
    for (let i = 0; i < 7; i++) {
      await pushRoll(roll(`r${i}`))
    }

    expect(wrapper.findAll('.ds-roll-toast')).toHaveLength(5)
    wrapper.unmount()
  })
})
