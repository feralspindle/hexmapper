import { beforeEach, describe, expect, test, vi } from 'vitest'
import { shallowMount } from '@vue/test-utils'
import HexRightPanel from './HexRightPanel.vue'

const mocks = vi.hoisted(() => ({
  hexStore: {
    selectedHex: null,
  },
  diceStore: {
    pendingRoll: null,
  },
  sessionStore: {
    playMode: 'gm',
    isGM: true,
  },
}))

vi.mock('@/stores/hexStore.js', () => ({
  useHexStore: () => mocks.hexStore,
}))

vi.mock('@/stores/diceStore.js', () => ({
  useDiceStore: () => mocks.diceStore,
}))

vi.mock('@/stores/sessionStore.js', () => ({
  useSessionStore: () => mocks.sessionStore,
}))

function mountPanel() {
  return shallowMount(HexRightPanel, {
    global: {
      stubs: {
        DungeonDiceSection: true,
        DungeonSessionSection: true,
        HexInspectorSection: true,
        DungeonPhotosSection: true,
        OraclePanel: true,
      },
    },
  })
}

describe('HexRightPanel', () => {
  beforeEach(() => {
    mocks.hexStore.selectedHex = null
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
