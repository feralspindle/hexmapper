import { beforeEach, describe, expect, test, vi } from 'vitest'
import { shallowMount } from '@vue/test-utils'
import DungeonRightPanel from './DungeonRightPanel.vue'

const mocks = vi.hoisted(() => ({
  dungeonStore: {
    selectedElement: null,
  },
  diceStore: {
    pendingRoll: null,
  },
  sessionStore: {
    playMode: 'gm',
    isGM: true,
  },
}))

vi.mock('@/stores/dungeonStore.js', () => ({
  useD: () => mocks.dungeonStore,
}))

vi.mock('@/stores/diceStore.js', () => ({
  useDiceStore: () => mocks.diceStore,
}))

vi.mock('@/stores/sessionStore.js', () => ({
  useSessionStore: () => mocks.sessionStore,
}))

function mountPanel() {
  return shallowMount(DungeonRightPanel, {
    global: {
      stubs: {
        DungeonInspector: true,
        DungeonDiceSection: true,
        DungeonSessionSection: true,
        DungeonPhotosSection: true,
        OraclePanel: true,
      },
    },
  })
}

describe('DungeonRightPanel', () => {
  beforeEach(() => {
    mocks.dungeonStore.selectedElement = null
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
})
