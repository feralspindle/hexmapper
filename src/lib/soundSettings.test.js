import { describe, test, expect, beforeEach, vi } from 'vitest'

describe('soundSettings', () => {
  beforeEach(() => {
    vi.resetModules()
    localStorage.clear()
  })

  test('sound defaults to enabled', async () => {
    const { soundEnabled } = await import('./soundSettings.js')
    expect(soundEnabled.value).toBe(true)
  })

  test('a stored opt-out is respected on load', async () => {
    localStorage.setItem('dm.soundEnabled', 'false')
    const { soundEnabled } = await import('./soundSettings.js')
    expect(soundEnabled.value).toBe(false)
  })

  test('toggleSound flips and persists the preference', async () => {
    const { soundEnabled, toggleSound } = await import('./soundSettings.js')

    toggleSound()
    expect(soundEnabled.value).toBe(false)
    expect(localStorage.getItem('dm.soundEnabled')).toBe('false')

    toggleSound()
    expect(soundEnabled.value).toBe(true)
    expect(localStorage.getItem('dm.soundEnabled')).toBe('true')
  })
})
