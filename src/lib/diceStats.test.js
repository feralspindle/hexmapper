import { describe, expect, test } from 'vitest'
import { splitTonight, rankPlayers, rankSkills, bestPlayerPerSkill, longestStreaks, usableRoll, formatZ, ordinal } from './diceStats.js'

const stats = (z, overrides = {}) => ({
  mean: 10.5,
  std_dev: 5.766,
  z_score: z,
  percentile_rank: 50 + z * 10,
  category: z > 0.05 ? 'above' : z < -0.05 ? 'below' : 'average',
  ...overrides,
})

let seq = 0
const roll = (overrides = {}) => ({
  id: `r${seq++}`,
  user_id: 'u1',
  display_name: 'Robin',
  character_id: null,
  label: null,
  total: 11,
  stats: stats(0.5),
  created_at: '2026-07-04T20:00:00Z',
  ...overrides,
})

const at = (iso) => ({ created_at: iso })

describe('usableRoll', () => {
  test('rejects rolls with no stats, zero spread, or non-finite z', () => {
    expect(usableRoll(roll({ stats: null }))).toBe(false)
    expect(usableRoll(roll({ stats: stats(0, { std_dev: 0 }) }))).toBe(false)
    expect(usableRoll(roll({ stats: stats(Number.NaN) }))).toBe(false)
    expect(usableRoll(roll())).toBe(true)
  })
})

describe('splitTonight', () => {
  test('cuts tonight at the first gap over the threshold (newest-first)', () => {
    const rolls = [
      roll(at('2026-07-04T22:00:00Z')),
      roll(at('2026-07-04T21:00:00Z')),
      roll(at('2026-07-04T15:00:00Z')),
      roll(at('2026-07-04T14:00:00Z')),
    ]
    const { tonight, all } = splitTonight(rolls)
    expect(tonight).toHaveLength(2)
    expect(all).toHaveLength(4)
  })

  test('a gap of exactly the threshold stays in tonight; over it cuts', () => {
    const exact = [roll(at('2026-07-04T20:00:00Z')), roll(at('2026-07-04T16:00:00Z'))]
    expect(splitTonight(exact, 4).tonight).toHaveLength(2)

    const over = [roll(at('2026-07-04T20:00:01Z')), roll(at('2026-07-04T16:00:00Z'))]
    expect(splitTonight(over, 4).tonight).toHaveLength(1)
  })

  test('no gap means every roll is tonight', () => {
    const rolls = [roll(at('2026-07-04T20:00:00Z')), roll(at('2026-07-04T19:00:00Z'))]
    expect(splitTonight(rolls).tonight).toHaveLength(2)
  })

  test('empty input', () => {
    expect(splitTonight([])).toEqual({ tonight: [], all: [] })
    expect(splitTonight(undefined).tonight).toEqual([])
  })
})

describe('rankPlayers', () => {
  test('ranks by average z-score, ignoring unusable rolls', () => {
    const rolls = [
      roll({ user_id: 'u1', display_name: 'Robin', stats: stats(1.0) }),
      roll({ user_id: 'u1', display_name: 'Robin', stats: stats(0.0) }),
      roll({ user_id: 'u1', display_name: 'Robin', stats: stats(0, { std_dev: 0 }) }),
      roll({ user_id: 'u2', display_name: 'Sam', stats: stats(0.2) }),
      roll({ user_id: 'u2', display_name: 'Sam', stats: null }),
    ]
    const ranked = rankPlayers(rolls)
    expect(ranked.map(r => [r.userId, r.count, r.avgZ])).toEqual([
      ['u1', 2, 0.5],
      ['u2', 1, 0.2],
    ])
  })

  test('flags the GM by ownerId and takes name/character from the newest roll', () => {
    const rolls = [
      roll({ user_id: 'gm', display_name: 'Hannah', character_id: 'c9', stats: stats(0.3) }),
      roll({ user_id: 'gm', display_name: 'Hannah-old', character_id: null, stats: stats(0.1) }),
    ]
    const [gm] = rankPlayers(rolls, { ownerId: 'gm' })
    expect(gm.isGM).toBe(true)
    expect(gm.displayName).toBe('Hannah')
    expect(gm.characterId).toBe('c9')
    expect(gm.aboveShare).toBe(1)
  })

  test('empty when no usable rolls', () => {
    expect(rankPlayers([roll({ stats: null })])).toEqual([])
  })
})

describe('rankSkills', () => {
  test('groups by label best-to-worst, bucketing blank labels as unlabeled', () => {
    const rolls = [
      roll({ label: 'Stealth', stats: stats(1.2) }),
      roll({ label: 'Stealth', stats: stats(0.8) }),
      roll({ label: 'Perception', stats: stats(-0.5) }),
      roll({ label: '  ', stats: stats(0.1) }),
    ]
    const skills = rankSkills(rolls)
    expect(skills.map(s => [s.label, s.count, Number(s.avgZ.toFixed(2))])).toEqual([
      ['Stealth', 2, 1.0],
      [null, 1, 0.1],
      ['Perception', 1, -0.5],
    ])
  })
})

describe('formatZ and ordinal', () => {
  test('formatZ signs and fixes to 2 decimals with a real minus glyph', () => {
    expect(formatZ(0.823)).toBe('+0.82σ')
    expect(formatZ(-0.12)).toBe('−0.12σ')
    expect(formatZ(0)).toBe('+0.00σ')
  })

  test('ordinal handles the teens and the 1/2/3 suffixes', () => {
    expect(ordinal(73)).toBe('73rd')
    expect(ordinal(51)).toBe('51st')
    expect(ordinal(42)).toBe('42nd')
    expect(ordinal(11)).toBe('11th')
    expect(ordinal(13)).toBe('13th')
    expect(ordinal(50.4)).toBe('50th')
  })
})

describe('longestStreaks', () => {
  const hi = (over = {}) => roll({ stats: stats(1), ...over })
  const lo = (over = {}) => roll({ stats: stats(-1), ...over })
  const avg = (over = {}) => roll({ stats: stats(0), ...over })

  test('reports the longest hot and cold run, needing at least the minimum', () => {
    const rolls = [
      hi({ user_id: 'u1', display_name: 'Robin' }),
      hi({ user_id: 'u1', display_name: 'Robin' }),
      hi({ user_id: 'u1', display_name: 'Robin' }),
      hi({ user_id: 'u1', display_name: 'Robin' }),
      lo({ user_id: 'u2', display_name: 'Sam' }),
      lo({ user_id: 'u2', display_name: 'Sam' }),
      lo({ user_id: 'u2', display_name: 'Sam' }),
    ]
    const { hot, cold } = longestStreaks(rolls)
    expect(hot).toMatchObject({ userId: 'u1', displayName: 'Robin', count: 4 })
    expect(cold).toMatchObject({ userId: 'u2', count: 3 })
  })

  test('an average roll breaks the run', () => {
    const rolls = [hi(), hi(), hi(), avg(), hi(), hi()]
    expect(longestStreaks(rolls).hot.count).toBe(3)
  })

  test('runs shorter than the minimum are not reported', () => {
    expect(longestStreaks([hi(), hi(), lo(), lo()])).toEqual({ hot: null, cold: null })
  })

  test('a statless roll is skipped without breaking a run', () => {
    const rolls = [hi(), hi(), roll({ stats: null }), hi()]
    expect(longestStreaks(rolls).hot.count).toBe(3)
  })

  test('tracks runs per user, ignoring interleaved rolls from others', () => {
    const rolls = [
      hi({ user_id: 'u1' }), lo({ user_id: 'u2' }),
      hi({ user_id: 'u1' }), lo({ user_id: 'u2' }),
      hi({ user_id: 'u1' }), lo({ user_id: 'u2' }),
    ]
    const { hot, cold } = longestStreaks(rolls)
    expect(hot).toMatchObject({ userId: 'u1', count: 3 })
    expect(cold).toMatchObject({ userId: 'u2', count: 3 })
  })

  test('empty input', () => {
    expect(longestStreaks([])).toEqual({ hot: null, cold: null })
  })
})

describe('bestPlayerPerSkill', () => {
  test('picks the top player per label by average z', () => {
    const rolls = [
      roll({ user_id: 'u1', display_name: 'Robin', label: 'Stealth', stats: stats(0.2) }),
      roll({ user_id: 'u2', display_name: 'Sam', label: 'Stealth', stats: stats(1.5) }),
      roll({ user_id: 'u1', display_name: 'Robin', label: 'Attack', stats: stats(0.9) }),
    ]
    const best = bestPlayerPerSkill(rolls)
    expect(best.map(b => [b.label, b.displayName, b.avgZ])).toEqual([
      ['Stealth', 'Sam', 1.5],
      ['Attack', 'Robin', 0.9],
    ])
  })
})
