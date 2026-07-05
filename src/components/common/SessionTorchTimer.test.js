import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { reactive, nextTick } from 'vue'

const kit = vi.hoisted(() => ({ session: null }))

vi.mock('@/stores/sessionStore.js', () => ({
  useSessionStore: () => kit.session,
}))

import SessionTorchTimer from './SessionTorchTimer.vue'

const NOW = Date.parse('2026-07-04T20:00:00Z')

function makeSession(overrides = {}) {
  const session = reactive({
    sessionId: 's1',
    isGM: true,
    torchRunning: false,
    torchElapsedMs: 0,
    torchStartedAt: null,
    torchStart: vi.fn(() => {
      session.torchRunning = true
      session.torchStartedAt = new Date(Date.now()).toISOString()
      return Promise.resolve()
    }),
    torchPause: vi.fn(() => {
      session.torchRunning = false
      return Promise.resolve()
    }),
    torchReset: vi.fn(() => {
      session.torchElapsedMs = 0
      return Promise.resolve()
    }),
    ...overrides,
  })
  return session
}

describe('SessionTorchTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    kit.session = makeSession()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test('an idle fresh torch shows the full 60 minutes', async () => {
    const wrapper = mount(SessionTorchTimer)
    await nextTick()
    expect(wrapper.text()).toContain('60:00')
    wrapper.unmount()
  })

  test('a running torch counts down from base elapsed plus wall time since start', async () => {
    kit.session.torchRunning = true
    kit.session.torchElapsedMs = 5 * 60 * 1000
    kit.session.torchStartedAt = new Date(NOW - 5 * 60 * 1000).toISOString()
    const wrapper = mount(SessionTorchTimer)
    await nextTick()

    expect(wrapper.text()).toContain('50:00')

    await vi.advanceTimersByTimeAsync(60 * 1000)
    expect(wrapper.text()).toContain('49:00')
    wrapper.unmount()
  })

  test('a paused torch holds its remaining time as wall time passes', async () => {
    kit.session.torchElapsedMs = 10 * 60 * 1000
    const wrapper = mount(SessionTorchTimer)
    await nextTick()

    expect(wrapper.text()).toContain('50:00')
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000)
    expect(wrapper.text()).toContain('50:00')
    wrapper.unmount()
  })

  test('the torch expires at 60 minutes and the toggle stops working', async () => {
    kit.session.torchRunning = true
    kit.session.torchElapsedMs = 59 * 60 * 1000 + 59_500
    kit.session.torchStartedAt = new Date(NOW).toISOString()
    const wrapper = mount(SessionTorchTimer)
    await nextTick()

    await vi.advanceTimersByTimeAsync(2000)
    expect(wrapper.text()).toContain('00:00')
    expect(wrapper.find('.ra-skull').exists()).toBe(true)

    await wrapper.findAll('button')[0].trigger('click')
    expect(kit.session.torchStart).not.toHaveBeenCalled()
    expect(kit.session.torchPause).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  test('toggle starts an idle torch and pauses a running one', async () => {
    const wrapper = mount(SessionTorchTimer)
    await nextTick()

    await wrapper.findAll('button')[0].trigger('click')
    expect(kit.session.torchStart).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(1000)
    await wrapper.findAll('button')[0].trigger('click')
    expect(kit.session.torchPause).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  test('lighting a new torch resets and restarts when paused', async () => {
    kit.session.torchElapsedMs = 30 * 60 * 1000
    const wrapper = mount(SessionTorchTimer)
    await nextTick()

    await wrapper.findAll('button')[1].trigger('click')
    await vi.advanceTimersByTimeAsync(600)

    expect(kit.session.torchReset).toHaveBeenCalledTimes(1)
    expect(kit.session.torchStart).toHaveBeenCalledTimes(1)
    expect(wrapper.text()).toContain('59:59')
    wrapper.unmount()
  })

  test('players see the torch state but not the countdown digits', async () => {
    kit.session.isGM = false
    kit.session.torchRunning = true
    kit.session.torchStartedAt = new Date(NOW).toISOString()
    const wrapper = mount(SessionTorchTimer)
    await nextTick()

    expect(wrapper.text()).not.toMatch(/\d{2}:\d{2}/)
    expect(wrapper.find('.ra-torch').exists()).toBe(true)
    wrapper.unmount()
  })
})
