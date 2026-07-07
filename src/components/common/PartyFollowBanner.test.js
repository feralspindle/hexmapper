import { beforeEach, describe, expect, test, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import PartyFollowBanner from './PartyFollowBanner.vue'
import { usePartyFollow } from '@/composables/usePartyFollow.js'

const mocks = vi.hoisted(() => ({
  hexStore: { navigateToDungeon: vi.fn() },
}))

vi.mock('@/stores/hexStore.js', () => ({
  useHexStore: () => mocks.hexStore,
}))

const find = (wrapper, testid) => wrapper.find(`[data-testid="${testid}"]`)

describe('PartyFollowBanner', () => {
  beforeEach(() => {
    usePartyFollow().dismiss()
    mocks.hexStore.navigateToDungeon = vi.fn()
  })

  test('hidden while there is no invite', () => {
    const wrapper = mount(PartyFollowBanner)
    expect(find(wrapper, 'party-follow-banner').exists()).toBe(false)
  })

  test('shows the dungeon name and joins on click', async () => {
    usePartyFollow().push({ dungeonId: 'd1', name: 'Barrowmaze' })
    const wrapper = mount(PartyFollowBanner)

    expect(wrapper.text()).toContain('The party has entered')
    expect(wrapper.text()).toContain('Barrowmaze')

    await find(wrapper, 'party-follow-join').trigger('click')
    expect(mocks.hexStore.navigateToDungeon).toHaveBeenCalledWith('d1')
    expect(usePartyFollow().invite.value).toBeNull()
  })

  test('falls back to a generic name when none was sent', () => {
    usePartyFollow().push({ dungeonId: 'd1', name: null })
    const wrapper = mount(PartyFollowBanner)
    expect(wrapper.text()).toContain('a dungeon')
  })

  test('dismiss clears the invite without navigating', async () => {
    usePartyFollow().push({ dungeonId: 'd1', name: 'Barrowmaze' })
    const wrapper = mount(PartyFollowBanner)

    await find(wrapper, 'party-follow-dismiss').trigger('click')
    expect(usePartyFollow().invite.value).toBeNull()
    expect(mocks.hexStore.navigateToDungeon).not.toHaveBeenCalled()
  })
})
