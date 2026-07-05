import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { reactive, nextTick } from 'vue'

const kit = vi.hoisted(() => ({ dungeon: null, session: null }))

vi.mock('@/stores/dungeonStore.js', () => ({
  useD: () => kit.dungeon,
}))
vi.mock('@/stores/sessionStore.js', () => ({
  useSessionStore: () => kit.session,
}))

import TorchTimer from './TorchTimer.vue'

const NOW = Date.parse('2026-07-04T20:00:00Z')

describe('dungeon TorchTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    kit.session = { isGM: true }
    kit.dungeon = reactive({
      dungeon: { id: 'd1', torch_running: false, torch_elapsed_ms: 0, torch_started_at: null },
      torchStart: vi.fn(() => Promise.resolve()),
      torchPause: vi.fn(() => Promise.resolve()),
      torchReset: vi.fn(() => Promise.resolve()),
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test('counts down from the dungeon torch fields while running', async () => {
    kit.dungeon.dungeon.torch_running = true
    kit.dungeon.dungeon.torch_elapsed_ms = 20 * 60 * 1000
    kit.dungeon.dungeon.torch_started_at = new Date(NOW - 60 * 1000).toISOString()
    const wrapper = mount(TorchTimer)
    await nextTick()

    expect(wrapper.text()).toContain('39:00')
    await vi.advanceTimersByTimeAsync(60 * 1000)
    expect(wrapper.text()).toContain('38:00')
    wrapper.unmount()
  })

  test('with no dungeon loaded the controls are disabled and show a full torch', async () => {
    kit.dungeon.dungeon = null
    const wrapper = mount(TorchTimer)
    await nextTick()

    expect(wrapper.text()).toContain('60:00')
    expect(wrapper.findAll('button')[0].attributes('disabled')).toBeDefined()
    wrapper.unmount()
  })

  test('toggle pauses a running torch and starts a stopped one', async () => {
    const wrapper = mount(TorchTimer)
    await nextTick()

    await wrapper.findAll('button')[0].trigger('click')
    expect(kit.dungeon.torchStart).toHaveBeenCalledTimes(1)

    kit.dungeon.dungeon.torch_running = true
    await wrapper.findAll('button')[0].trigger('click')
    expect(kit.dungeon.torchPause).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  test('an expired torch shows 00:00 and refuses to toggle', async () => {
    kit.dungeon.dungeon.torch_elapsed_ms = 61 * 60 * 1000
    const wrapper = mount(TorchTimer)
    await nextTick()

    expect(wrapper.text()).toContain('00:00')
    await wrapper.findAll('button')[0].trigger('click')
    expect(kit.dungeon.torchStart).not.toHaveBeenCalled()

    await wrapper.findAll('button')[1].trigger('click')
    expect(kit.dungeon.torchReset).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })
})
