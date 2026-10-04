import { describe, expect, it } from 'vitest'
import {
  HELL_MAX_ROUNDS,
  burnHellRound,
  enterHellPayload,
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
  it('active while rounds remain, inert at zero or missing', () => {
    expect(isInHell(enterHellPayload(3))).toBe(true)
    expect(isInHell({ hell: { rounds: 3, rounds_left: 1 } })).toBe(true)
    expect(isInHell({ hell: { rounds: 3, rounds_left: 0 } })).toBe(false)
    expect(isInHell({})).toBe(false)
    expect(isInHell({ hell: null })).toBe(false)
    expect(isInHell(null)).toBe(false)
  })
})

describe('hellRoundsLeft', () => {
  it('reads the countdown directly', () => {
    expect(hellRoundsLeft(enterHellPayload(4))).toBe(4)
    expect(hellRoundsLeft({ hell: { rounds: 4, rounds_left: 2 } })).toBe(2)
    expect(hellRoundsLeft({ hell: { rounds: 4, rounds_left: 0 } })).toBe(0)
    expect(hellRoundsLeft({})).toBe(0)
  })
})

describe('enterHellPayload', () => {
  it('clamps the sentence', () => {
    expect(enterHellPayload(99)).toEqual({ hell: { rounds: HELL_MAX_ROUNDS, rounds_left: HELL_MAX_ROUNDS } })
    expect(enterHellPayload('x')).toEqual({ hell: { rounds: 3, rounds_left: 3 } })
  })
})

describe('burnHellRound', () => {
  it('decrements one round at a time and stops at zero', () => {
    let data = enterHellPayload(2)
    data = { ...data, hell: burnHellRound(data) }
    expect(data.hell.rounds_left).toBe(1)
    data = { ...data, hell: burnHellRound(data) }
    expect(data.hell.rounds_left).toBe(0)
    expect(isInHell(data)).toBe(false)
    // a fully-served sentence has nothing left to burn
    expect(burnHellRound(data)).toBeNull()
  })

  it('returns null when there is nothing to burn', () => {
    expect(burnHellRound({})).toBeNull()
  })
})
