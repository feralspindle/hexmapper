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

  test('keeps oracle available for the gm in gm-led mode', () => {
    const wrapper = mountPanel()

    expect(wrapper.text()).toContain('Oracle')
  })

  test('hides oracle from players until solo/co-op mode is active', () => {
    mocks.sessionStore.isGM = false
    const gmLedWrapper = mountPanel()

    expect(gmLedWrapper.text()).not.toContain('Oracle')

    mocks.sessionStore.playMode = 'gm_less'
    const coopWrapper = mountPanel()

    expect(coopWrapper.text()).toContain('Oracle')
  })
})
