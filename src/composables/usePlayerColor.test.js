import { describe, test, expect, beforeEach, vi } from 'vitest'

const prefs = vi.hoisted(() => ({ palette: 'candle' }))

vi.mock('@/stores/userPrefsStore.js', () => ({
  useUserPrefsStore: () => prefs,
}))

import { playerColorFor, playerTextColorFor } from './usePlayerColor.js'

describe('playerColorFor', () => {
  beforeEach(() => {
    prefs.palette = 'candle'
  })

  test('is deterministic for the same user id', () => {
    expect(playerColorFor('user-abc')).toBe(playerColorFor('user-abc'))
  })

  test('returns a valid hex color from the active palette', () => {
    expect(playerColorFor('user-abc')).toMatch(/^#[0-9a-f]{6}$/)
  })

  test('changes with the selected palette', () => {
    const candle = playerColorFor('user-abc')
    prefs.palette = 'ember'
    const ember = playerColorFor('user-abc')
    expect(candle).not.toBe(ember)
  })

  test('an unknown palette falls back to candle', () => {
    const candle = playerColorFor('user-abc')
    prefs.palette = 'not-a-palette'
    expect(playerColorFor('user-abc')).toBe(candle)
  })

  test('handles a missing user id without throwing', () => {
    expect(playerColorFor(null)).toMatch(/^#[0-9a-f]{6}$/)
    expect(playerColorFor(undefined)).toMatch(/^#[0-9a-f]{6}$/)
  })

  test('uses a separate contrast-safe color for text', () => {
    expect(playerTextColorFor('user-abc')).toMatch(/^#[0-9a-f]{6}$/)
    expect(playerTextColorFor('user-abc')).not.toBe(playerColorFor('user-abc'))
  })
})
