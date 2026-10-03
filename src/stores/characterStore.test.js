import { describe, expect, it } from 'vitest'
import { effectiveAttackBonus, fmtSigned, parseAttack, statMod } from './characterStore.js'

const STATS = { STR: 16, DEX: 9, CON: 10, INT: 12, WIS: 8, CHA: 14 }

describe('effectiveAttackBonus', () => {
  it('stat modifier alone when no labeled modifiers', () => {
    const atk = { ...parseAttack('Longsword: +5 flaming'), statKey: 'STR' }
    expect(effectiveAttackBonus(atk, STATS)).toBe(3)
  })

  it('stacks labeled modifiers on the linked stat', () => {
    const atk = {
      ...parseAttack('Longsword: +9 (ignored while stat linked)'),
      statKey: 'STR',
      modifiers: [
        { id: 'a', label: 'talent', value: 2 },
        { id: 'b', label: 'debuff', value: -1 },
      ],
    }
    expect(effectiveAttackBonus(atk, STATS)).toBe(4)
  })

  it('sums labeled modifiers when no stat is linked', () => {
    const atk = {
      ...parseAttack('Bite: +7'),
      statKey: null,
      modifiers: [
        { id: 'a', label: 'rage', value: 2 },
        { id: 'b', label: 'bless', value: 1 },
      ],
    }
    expect(effectiveAttackBonus(atk, STATS)).toBe(3)
  })

  it('description bonus only when no stat and no modifiers', () => {
    expect(effectiveAttackBonus(parseAttack('Dagger: +2 sneaky'), STATS)).toBe(2)
    expect(effectiveAttackBonus(parseAttack('Clumsy swing'), STATS)).toBe(0)
  })

  it('ignores a stat key with no matching stat', () => {
    const atk = {
      ...parseAttack('Ray: +1'),
      statKey: 'STR',
      modifiers: [{ id: 'a', label: 'focus', value: 1 }],
    }
    expect(effectiveAttackBonus(atk, {})).toBe(1)
  })

  it('tolerates junk modifier values', () => {
    const atk = {
      ...parseAttack('Slam: +1'),
      statKey: null,
      modifiers: [
        { id: 'a', label: 'weird', value: '3' },
        { id: 'b', label: 'broken', value: null },
      ],
    }
    expect(effectiveAttackBonus(atk, STATS)).toBe(3)
  })
})

describe('fmtSigned', () => {
  it('formats positives with a plus and negatives with a minus', () => {
    expect(fmtSigned(4)).toBe('+4')
    expect(fmtSigned(-1)).toBe('-1')
    expect(fmtSigned(0)).toBe('+0')
    expect(fmtSigned('2.4')).toBe('+2')
  })
})

describe('statMod', () => {
  it('shadowdark ability math', () => {
    expect(statMod(16)).toBe(3)
    expect(statMod(9)).toBe(-1)
    expect(statMod(10)).toBe(0)
  })
})
