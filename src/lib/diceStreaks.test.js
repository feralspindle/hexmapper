import { describe, expect, test } from 'vitest'
import { withRollStreaks } from './diceStreaks.js'

const stats = (category, overrides = {}) => ({
  mean: 10.5,
  std_dev: 5.766,
  percentile_rank: 50,
  category,
  ...overrides,
})

const roll = (id, category, overrides = {}) => ({
  id,
  user_id: 'u1',
  display_name: 'Robin',
  pending: { d20: 1 },
  modifier: 0,
  total: 11,
  stats: category ? stats(category) : null,
  created_at: `2026-07-04T00:00:0${id.at(-1) ?? 0}Z`,
  ...overrides,
})

describe('diceStreaks', () => {
  test('adds hot streak metadata starting on the third above-average roll by a user', () => {
    const enriched = withRollStreaks([
      roll('r4', 'above'),
      roll('r3', 'above'),
      roll('r2', 'above'),
      roll('r1', 'below'),
    ])

    expect(enriched.map(r => [r.id, r.streak?.kind, r.streak?.count])).toEqual([
      ['r4', 'hot', 3],
      ['r3', undefined, undefined],
      ['r2', undefined, undefined],
      ['r1', undefined, undefined],
    ])
  })

  test('tracks streaks per user and ignores interleaved rolls from other users', () => {
    const enriched = withRollStreaks([
      roll('r5', 'above', { user_id: 'u1' }),
      roll('r4', 'below', { user_id: 'u2' }),
      roll('r3', 'above', { user_id: 'u1' }),
      roll('r2', 'below', { user_id: 'u2' }),
      roll('r1', 'above', { user_id: 'u1' }),
    ])

    expect(enriched[0].streak).toMatchObject({ kind: 'hot', count: 3 })
    expect(enriched[1].streak).toBeUndefined()
  })

  test('an average roll (server ±0.5 band) breaks a streak', () => {
    const enriched = withRollStreaks([
      roll('r5', 'below'),
      roll('r4', 'below'),
      roll('r3', 'average', { pending: { d6: 2 }, total: 7, stats: stats('average', { mean: 7 }) }),
      roll('r2', 'below'),
      roll('r1', 'below'),
    ])

    expect(enriched.map(r => [r.id, r.streak?.kind, r.streak?.count])).toEqual([
      ['r5', undefined, undefined],
      ['r4', undefined, undefined],
      ['r3', undefined, undefined],
      ['r2', undefined, undefined],
      ['r1', undefined, undefined],
    ])

    const cold = withRollStreaks([
      roll('r3', 'below'),
      roll('r2', 'below'),
      roll('r1', 'below'),
    ])

    expect(cold[0].streak).toMatchObject({ kind: 'cold', count: 3 })
  })

  test('deterministic rolls (std_dev 0, like flat d1 damage) neither extend nor break a streak', () => {
    const enriched = withRollStreaks([
      roll('r4', 'above'),
      roll('r3', 'average', { pending: { d1: 1 }, total: 4, stats: stats('average', { mean: 4, std_dev: 0 }) }),
      roll('r2', 'above'),
      roll('r1', 'above'),
    ])

    expect(enriched[0].streak).toMatchObject({ kind: 'hot', count: 3 })
    expect(enriched[1].streak).toBeUndefined()
  })

  test('rolls without server stats are skipped and never reset a streak', () => {
    const enriched = withRollStreaks([
      roll('r4', 'above'),
      roll('r3', null),
      roll('r2', 'above'),
      roll('r1', 'above'),
    ])

    expect(enriched[0].streak).toMatchObject({ kind: 'hot', count: 3 })
    expect(enriched[1].streak).toBeUndefined()
  })

  test('returns the original roll objects untouched when no streak applies', () => {
    const quiet = roll('r1', 'above')
    const enriched = withRollStreaks([quiet])

    expect(enriched[0]).toBe(quiet)
    expect(quiet.streak).toBeUndefined()
  })
})
