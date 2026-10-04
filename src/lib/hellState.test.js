import { describe, expect, it } from 'vitest'
import {
  HELL_MAX_ROUNDS,
  enterHellPayload,
  hellReturnRound,
  hellRoundsLeft,
  isInHell,
  normalizeHellRounds,
} from './hellState.js'

describe('normalizeHellRounds', () => {
  it('clamps to 1..20 and defaults junk to the fallback', () => {
    expect(normalizeHellRounds(3)).toBe(3)
    expect(normalizeHellRounds(0)).toBe(1)
    expect(normalizeHellRounds(-4)).toBe(1)
    expect(normalizeHellRounds(999)).toBe(HELL_MAX_ROUNDS)
    expect(normalizeHellRounds('nope', 3)).toBe(3)
    expect(normalizeHellRounds(undefined, 5)).toBe(5)
  })
})

describe('isInHell', () => {
  it('active until the rounds elapse, then inert', () => {
    const data = enterHellPayload(3, 2)
    expect(isInHell(data, 2)).toBe(true)
    expect(isInHell(data, 4)).toBe(true)
    expect(isInHell(data, 5)).toBe(false)
  })

  it('missing or empty state is not hell', () => {
    expect(isInHell(null, 3)).toBe(false)
    expect(isInHell({}, 3)).toBe(false)
    expect(isInHell({ hell: null }, 3)).toBe(false)
    expect(isInHell({ hell: { rounds: 0, started_round: 1 } }, 3)).toBe(false)
  })

  it('a round reset never counts negative elapsed', () => {
    const data = enterHellPayload(2, 5)
    expect(isInHell(data, 1)).toBe(true)
    expect(hellRoundsLeft(data, 1)).toBe(2)
  })
})

describe('hellRoundsLeft', () => {
  it('counts down as rounds advance', () => {
    const data = enterHellPayload(3, 1)
    expect(hellRoundsLeft(data, 1)).toBe(3)
    expect(hellRoundsLeft(data, 2)).toBe(2)
    expect(hellRoundsLeft(data, 3)).toBe(1)
    expect(hellRoundsLeft(data, 4)).toBe(0)
  })
})

describe('hellReturnRound', () => {
  it('is the round the sentence ends', () => {
    expect(hellReturnRound(enterHellPayload(3, 2))).toBe(5)
    expect(hellReturnRound({})).toBeNull()
  })
})

describe('enterHellPayload', () => {
  it('clamps rounds and the starting round', () => {
    expect(enterHellPayload(99, 3)).toEqual({ hell: { rounds: HELL_MAX_ROUNDS, started_round: 3 } })
    expect(enterHellPayload(2, 'x')).toEqual({ hell: { rounds: 2, started_round: 1 } })
  })
})
