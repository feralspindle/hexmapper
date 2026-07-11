import { describe, test, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import CrawlTracker from './CrawlTracker.vue'

const mocks = vi.hoisted(() => ({
  sessionStore: {
    crawlRound: 0,
    crawlCheckEvery: 3,
    advanceCrawlRound: vi.fn(),
    resetCrawlRound: vi.fn(),
    setCrawlCheckEvery: vi.fn(),
  },
}))

vi.mock('@/stores/sessionStore.js', () => ({
  useSessionStore: () => mocks.sessionStore,
}))

describe('CrawlTracker', () => {
  beforeEach(() => {
    mocks.sessionStore.crawlRound = 0
    mocks.sessionStore.crawlCheckEvery = 3
    mocks.sessionStore.advanceCrawlRound.mockReset()
    mocks.sessionStore.resetCrawlRound.mockClear()
    mocks.sessionStore.setCrawlCheckEvery.mockClear()
  })

  test('shows round and rough in-game time', () => {
    mocks.sessionStore.crawlRound = 12
    const wrapper = mount(CrawlTracker)

    expect(wrapper.text()).toContain('round 12')
    expect(wrapper.text()).toContain('2h 0m')
  })

  test('advance surfaces an encounter hit', async () => {
    mocks.sessionStore.advanceCrawlRound.mockResolvedValue({
      encounter: { checked: true, hit: true, die: 1, result: '2 ghouls' },
    })
    const wrapper = mount(CrawlTracker)

    await wrapper.get('[data-testid="crawl-advance"]').trigger('click')
    await new Promise(resolve => setTimeout(resolve))

    expect(wrapper.get('[data-testid="crawl-encounter"]').text()).toContain('2 ghouls')
  })

  test('a clear check shows the die', async () => {
    mocks.sessionStore.advanceCrawlRound.mockResolvedValue({
      encounter: { checked: true, hit: false, die: 4 },
    })
    const wrapper = mount(CrawlTracker)

    await wrapper.get('[data-testid="crawl-advance"]').trigger('click')
    await new Promise(resolve => setTimeout(resolve))

    expect(wrapper.get('[data-testid="crawl-encounter"]').text()).toContain('rolled 4, clear')
  })

  test('config writes through the store', async () => {
    const wrapper = mount(CrawlTracker)

    await wrapper.get('[data-testid="crawl-every"]').setValue('6')
    expect(mocks.sessionStore.setCrawlCheckEvery).toHaveBeenCalledWith(6)
  })
})
