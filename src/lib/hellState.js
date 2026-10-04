// amulet hell state. the condemned manually burns rounds (the initiative
// round counter is solo-play only), so the sentence is a plain countdown the
// owner decrements - one writer, no races, and zero just reads as expired.
// hell = { rounds, rounds_left } on the character sheet blob.

export const HELL_CONDITION = 'in hell'
export const HELL_MAX_ROUNDS = 20

export function normalizeHellRounds(value, fallback = 3) {
  const n = Math.round(Number(value))
  if (!Number.isFinite(n)) return fallback
  return Math.max(1, Math.min(HELL_MAX_ROUNDS, n))
}

function roundsLeftOf(data) {
  const left = Number(data?.hell?.rounds_left)
  return Number.isFinite(left) ? Math.max(0, left) : 0
}

export function isInHell(data) {
  return roundsLeftOf(data) > 0
}

export function hellRoundsLeft(data) {
  return isInHell(data) ? roundsLeftOf(data) : 0
}

export function enterHellPayload(rounds) {
  const n = normalizeHellRounds(rounds)
  return { hell: { rounds: n, rounds_left: n } }
}

// one manual round tick; rounds_left floors at 0 (0 == done, caller clears)
export function burnHellRound(data) {
  const left = roundsLeftOf(data)
  if (!left) return null
  return { ...data.hell, rounds_left: left - 1 }
}
