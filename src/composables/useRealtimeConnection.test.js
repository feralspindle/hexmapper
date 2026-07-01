import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest'
import { useRealtimeConnection } from './useRealtimeConnection.js'

function emit(connected) {
  window.dispatchEvent(new CustomEvent('hexmap:realtime-status', { detail: { connected } }))
}

describe('useRealtimeConnection', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    emit(true)
  })

  afterEach(() => {
    emit(true)
    vi.useRealTimers()
  })

  test('shows the banner only after the disconnect persists past the grace window', () => {
    const { showDisconnected } = useRealtimeConnection()
    emit(false)
    expect(showDisconnected.value).toBe(false)
    vi.advanceTimersByTime(7999)
    expect(showDisconnected.value).toBe(false)
    vi.advanceTimersByTime(2)
    expect(showDisconnected.value).toBe(true)
  })

  test('a reconnect within the grace window never shows the banner', () => {
    const { showDisconnected } = useRealtimeConnection()
    emit(false)
    vi.advanceTimersByTime(3000)
    emit(true)
    vi.advanceTimersByTime(10000)
    expect(showDisconnected.value).toBe(false)
  })

  test('reconnecting hides a banner that was already showing', () => {
    const { showDisconnected } = useRealtimeConnection()
    emit(false)
    vi.advanceTimersByTime(8001)
    expect(showDisconnected.value).toBe(true)
    emit(true)
    expect(showDisconnected.value).toBe(false)
  })
})
