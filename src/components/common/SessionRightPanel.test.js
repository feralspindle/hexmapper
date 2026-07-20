import { beforeEach, describe, expect, test, vi } from 'vitest'
import { nextTick } from 'vue'
import { shallowMount } from '@vue/test-utils'
import SessionRightPanel from './SessionRightPanel.vue'

const mocks = vi.hoisted(() => ({
  diceStore: {
    pendingRoll: null,
  },
}))

vi.mock('@/stores/diceStore.js', async () => {
  const { reactive } = await import('vue')
  mocks.diceStore = reactive(mocks.diceStore)
  return { useDiceStore: () => mocks.diceStore }
})

const StubInspector = { name: 'StubInspector', template: '<div class="stub-inspector" />' }

function mountPanel(props = {}) {
  return shallowMount(SessionRightPanel, {
    props: { inspector: StubInspector, ...props },
    global: {
      stubs: {
        DungeonDiceSection: true,
        DungeonSessionSection: true,
        DungeonPhotosSection: true,
      },
    },
  })
}

describe('SessionRightPanel', () => {
  beforeEach(() => {
    mocks.diceStore.pendingRoll = null
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
