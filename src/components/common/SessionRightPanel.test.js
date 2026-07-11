import { beforeEach, describe, expect, test, vi } from 'vitest'
import { nextTick } from 'vue'
import { shallowMount } from '@vue/test-utils'
import SessionRightPanel from './SessionRightPanel.vue'
import TravelSection from './TravelSection.vue'
import InitiativeSection from './InitiativeSection.vue'
import CrawlTracker from './CrawlTracker.vue'
import LightsSection from './LightsSection.vue'

const mocks = vi.hoisted(() => ({
  diceStore: {
    pendingRoll: null,
  },
  sessionStore: {
    playMode: 'gm',
    isGM: true,
  },
}))

vi.mock('@/stores/diceStore.js', async () => {
  const { reactive } = await import('vue')
  mocks.diceStore = reactive(mocks.diceStore)
  return { useDiceStore: () => mocks.diceStore }
})

vi.mock('@/stores/sessionStore.js', () => ({
  useSessionStore: () => mocks.sessionStore,
}))

const StubInspector = { name: 'StubInspector', template: '<div class="stub-inspector" />' }

function mountPanel(props = {}) {
  return shallowMount(SessionRightPanel, {
    props: { inspector: StubInspector, ...props },
    global: {
      stubs: {
        DungeonDiceSection: true,
        DungeonSessionSection: true,
        DungeonPhotosSection: true,
        OraclePanel: true,
      },
    },
  })
}

describe('SessionRightPanel', () => {
  beforeEach(() => {
    mocks.diceStore.pendingRoll = null
    mocks.sessionStore.playMode = 'gm'
    mocks.sessionStore.isGM = true
  })

  test('shows the oracle tab in solo/co-op mode', () => {
    mocks.sessionStore.playMode = 'gm_less'
    const wrapper = mountPanel()

    expect(wrapper.text()).toContain('Oracle')
  })

  test('hides the oracle tab in gm-led mode for gm and players alike', () => {
    const gmWrapper = mountPanel()
    expect(gmWrapper.text()).not.toContain('Oracle')

    mocks.sessionStore.isGM = false
    const playerWrapper = mountPanel()
    expect(playerWrapper.text()).not.toContain('Oracle')
  })

  test('shows initiative, crawl, and lights only in solo/co-op mode', () => {
    const gmWrapper = mountPanel()
    expect(gmWrapper.findComponent(InitiativeSection).exists()).toBe(false)
    expect(gmWrapper.findComponent(CrawlTracker).exists()).toBe(false)
    expect(gmWrapper.findComponent(LightsSection).exists()).toBe(false)

    mocks.sessionStore.playMode = 'gm_less'
    const soloWrapper = mountPanel()
    expect(soloWrapper.findComponent(InitiativeSection).exists()).toBe(true)
    expect(soloWrapper.findComponent(CrawlTracker).exists()).toBe(true)
    expect(soloWrapper.findComponent(LightsSection).exists()).toBe(true)
  })

  test('travel needs both show-travel and solo/co-op mode', () => {
    const gmWrapper = mountPanel({ showTravel: true })
    expect(gmWrapper.findComponent(TravelSection).exists()).toBe(false)

    mocks.sessionStore.playMode = 'gm_less'
    expect(mountPanel({ showTravel: false }).findComponent(TravelSection).exists()).toBe(false)
    expect(mountPanel({ showTravel: true }).findComponent(TravelSection).exists()).toBe(true)
  })

  test('a new selection switches to the inspect tab', async () => {
    const wrapper = mountPanel({ selected: null })

    await wrapper.setProps({ selected: { id: 'hex-1' } })
    await nextTick()

    const tabs = wrapper.findAll('.ds-panel-tab')
    expect(tabs.at(-1).classes()).toContain('active')
  })

  test('a pending roll switches back to the dice tab', async () => {
    const wrapper = mountPanel({ selected: null })
    await wrapper.setProps({ selected: { id: 'el-1' } })
    await nextTick()
    expect(wrapper.findAll('.ds-panel-tab').at(-1).classes()).toContain('active')

    mocks.diceStore.pendingRoll = { pending: { d20: 1 } }
    await nextTick()

    expect(wrapper.findAll('.ds-panel-tab').at(0).classes()).toContain('active')
  })
})
