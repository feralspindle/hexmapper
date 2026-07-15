import { describe, test, expect } from 'vitest'
import { COMMON_CONDITIONS, conditionBadge, normalizeCondition } from './conditions.js'

describe('conditions', () => {
  test('common conditions resolve to their preset badge', () => {
    const badge = conditionBadge('poisoned')
    expect(badge.custom).toBe(false)
    expect(badge.color).toBe(COMMON_CONDITIONS.find(c => c.name === 'poisoned').color)
  })

  test('lookup is case- and whitespace-insensitive', () => {
    expect(conditionBadge(' Paralyzed ').custom).toBe(false)
  })

  test('custom conditions get a stable color', () => {
    const first = conditionBadge('in hell')
    const second = conditionBadge('in hell')
    expect(first.custom).toBe(true)
    expect(first.color).toBe(second.color)
  })

  test('distinct custom names usually differ in color', () => {
    const colors = new Set(
      ['in hell', 'petrified toe', 'owlbear scent', 'time displaced'].map(n => conditionBadge(n).color),
    )
    expect(colors.size).toBeGreaterThan(1)
  })

  test('normalizeCondition trims, lowercases, and caps length', () => {
    expect(normalizeCondition('  In Hell  ')).toBe('in hell')
    expect(normalizeCondition('x'.repeat(100))).toHaveLength(40)
    expect(normalizeCondition(null)).toBe('')
  })
})
