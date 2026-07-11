import { describe, expect, test } from 'vitest'
import { rollAverageComparison, withRollStreaks } from './diceStreaks.js'

const roll = (id, overrides = {}) => ({
  id,
  user_id: 'u1',
  display_name: 'Robin',
  pending: { d20: 1 },
  modifier: 0,
  total: 11,
  created_at: `2026-07-04T00:00:0${id.at(-1) ?? 0}Z`,
  ...overrides,
})

describe('diceStreaks', () => {
  test('classifies rolls against their expected average including modifiers', () => {
    expect(rollAverageComparison(roll('high', { total: 14, modifier: 2 }))).toMatchObject({
      average: 12.5,
      delta: 1.5,
      direction: 'high',
    })

    expect(rollAverageComparison(roll('low', { pending: { d6: 2 }, total: 6 }))).toMatchObject({
      average: 7,
      delta: -1,
      direction: 'low',
    })

    expect(rollAverageComparison(roll('even', { pending: { d6: 2 }, total: 7 }))).toMatchObject({
      average: 7,
      delta: 0,
      direction: 'neutral',
    })
  })

  test('uses server-provided stats mean when present', () => {
    expect(rollAverageComparison(roll('stats', {
      pending: { d20: 1 },
      stats: { mean: 8 },
      total: 9,
    }))).toMatchObject({
      average: 8,
      direction: 'high',
    })
  })

  test('adds hot streak metadata starting on the third above-average roll by a user', () => {
    const enriched = withRollStreaks([
      roll('r4', { total: 15 }),
      roll('r3', { total: 12 }),
      roll('r2', { total: 18 }),
      roll('r1', { total: 4 }),
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
      roll('r5', { user_id: 'u1', total: 13 }),
      roll('r4', { user_id: 'u2', total: 3 }),
      roll('r3', { user_id: 'u1', total: 12 }),
      roll('r2', { user_id: 'u2', total: 2 }),
      roll('r1', { user_id: 'u1', total: 11 }),
    ])

    expect(enriched[0].streak).toMatchObject({ kind: 'hot', count: 3 })
    expect(enriched[1].streak).toBeNull()
  })

  test('adds cold streak metadata and neutral rolls break a user streak', () => {
    const enriched = withRollStreaks([
      roll('r5', { total: 3 }),
      roll('r4', { total: 5 }),
      roll('r3', { pending: { d6: 2 }, total: 7 }),
      roll('r2', { total: 4 }),
      roll('r1', { total: 2 }),
    ])

    expect(enriched.map(r => [r.id, r.streak?.kind, r.streak?.count])).toEqual([
      ['r5', undefined, undefined],
      ['r4', undefined, undefined],
      ['r3', undefined, undefined],
      ['r2', undefined, undefined],
      ['r1', undefined, undefined],
    ])

    const cold = withRollStreaks([
      roll('r3', { total: 3 }),
      roll('r2', { total: 4 }),
      roll('r1', { total: 2 }),
    ])

    expect(cold[0].streak).toMatchObject({ kind: 'cold', count: 3 })
  })
})
