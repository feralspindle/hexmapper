import { beforeEach, describe, expect, test, vi } from 'vitest'
import { shallowMount } from '@vue/test-utils'
import SoloToolkitPanel from './SoloToolkitPanel.vue'
import TravelSection from './TravelSection.vue'
import InitiativeSection from './InitiativeSection.vue'
import CrawlTracker from './CrawlTracker.vue'
import LightsSection from './LightsSection.vue'
import ImportKeysSection from './ImportKeysSection.vue'
import SoloCombatPanel from './SoloCombatPanel.vue'
import { useSoloToolkit } from '@/composables/useSoloToolkit.js'

const mocks = vi.hoisted(() => ({
  sessionStore: {
    playMode: 'gm_less',
    isGM: true,
  },
}))

vi.mock('@/stores/sessionStore.js', () => ({
  useSessionStore: () => mocks.sessionStore,
}))

function mountPanel(props = {}) {
  return shallowMount(SoloToolkitPanel, { props })
}

describe('SoloToolkitPanel', () => {
  beforeEach(() => {
    mocks.sessionStore.playMode = 'gm_less'
    mocks.sessionStore.isGM = true
    useSoloToolkit().open()
  })

  test('renders nothing until opened', () => {
    useSoloToolkit().close()
    expect(mountPanel().find('.stk-panel').exists()).toBe(false)
  })

  test('renders nothing in gm-led mode even when open', () => {
    mocks.sessionStore.playMode = 'gm'
    expect(mountPanel().find('.stk-panel').exists()).toBe(false)
  })

  test('shows combat, oracle, codex, and trackers tabs in solo/co-op mode', () => {
    const wrapper = mountPanel()
    expect(wrapper.text()).toContain('Combat')
    expect(wrapper.text()).toContain('Oracle')
    expect(wrapper.text()).toContain('Codex')
    expect(wrapper.text()).toContain('Trackers')
    expect(wrapper.findComponent(InitiativeSection).exists()).toBe(true)
    expect(wrapper.findComponent(CrawlTracker).exists()).toBe(true)
    expect(wrapper.findComponent(LightsSection).exists()).toBe(true)
    expect(wrapper.findComponent(SoloCombatPanel).exists()).toBe(true)
  })

  test('opens on the combat tab', () => {
    const wrapper = mountPanel()
    expect(wrapper.findComponent(SoloCombatPanel).element.parentElement.style.display).not.toBe('none')
  })

  test('travel tracker needs the show-travel prop', () => {
    expect(mountPanel().findComponent(TravelSection).exists()).toBe(false)
    expect(mountPanel({ showTravel: true }).findComponent(TravelSection).exists()).toBe(true)
  })

  test('import keys are gm-only', () => {
    mocks.sessionStore.isGM = false
    expect(mountPanel().findComponent(ImportKeysSection).exists()).toBe(false)

    mocks.sessionStore.isGM = true
    expect(mountPanel().findComponent(ImportKeysSection).exists()).toBe(true)
  })

  test('the close button hides the panel', async () => {
    const wrapper = mountPanel()
    await wrapper.find('[data-testid="toolkit-panel-close"]').trigger('click')
    expect(wrapper.find('.stk-panel').exists()).toBe(false)
  })
})
