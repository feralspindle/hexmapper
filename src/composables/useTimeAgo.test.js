import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'

async function freshTimeAgo() {
  vi.resetModules()
  const { useTimeAgo } = await import('./useTimeAgo.js')
  let api
  const wrapper = mount({
    setup() {
      api = useTimeAgo()
      return () => null
    },
  })
  return { wrapper, api }
}

describe('useTimeAgo', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-04T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test('formats the full range of ages', async () => {
    const { wrapper, api } = await freshTimeAgo()
    const at = seconds => new Date(Date.parse('2026-07-04T12:00:00Z') - seconds * 1000).toISOString()

    expect(api.timeAgo(at(5))).toBe('just now')
    expect(api.timeAgo(at(30))).toBe('30s ago')
    expect(api.timeAgo(at(90))).toBe('1m ago')
    expect(api.timeAgo(at(59 * 60))).toBe('59m ago')
    expect(api.timeAgo(at(3 * 3600))).toBe('3h ago')
    wrapper.unmount()
  })

  test('the shared clock ticks forward every 15s', async () => {
    const { wrapper, api } = await freshTimeAgo()
    const ts = new Date('2026-07-04T11:59:55Z').toISOString()

    expect(api.timeAgo(ts)).toBe('just now')
    await vi.advanceTimersByTimeAsync(15000)
    expect(api.timeAgo(ts)).toBe('20s ago')
    wrapper.unmount()
  })

  test('the interval stops when the last subscriber unmounts', async () => {
    vi.resetModules()
    const { useTimeAgo } = await import('./useTimeAgo.js')
    const mountOne = () => mount({
      setup() {
        useTimeAgo()
        return () => null
      },
    })
    const a = mountOne()
    const b = mountOne()

    a.unmount()
    expect(vi.getTimerCount()).toBeGreaterThan(0)

    b.unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})
