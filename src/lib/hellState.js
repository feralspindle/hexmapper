// amulet hell state. hell is derived, never ticked: the character stores
// { rounds, started_round } and liveness is computed against the session's
// initiative round counter, so no client has to mutate anything each round
// and racing writers are impossible. expired state is inert (it just stops
// showing) and gets cleared lazily by the owner's sheet.

export const HELL_CONDITION = 'in hell'
export const HELL_MAX_ROUNDS = 20

export function normalizeHellRounds(value, fallback = 3) {
  const n = Math.round(Number(value))
  if (!Number.isFinite(n)) return fallback
  return Math.max(1, Math.min(HELL_MAX_ROUNDS, n))
}

export function isHellState(data) {
  const hell = data?.hell
  return !!hell && normalizeHellRounds(hell.rounds, 0) > 0
}

export function hellElapsedRounds(data, currentRound) {
  if (!isHellState(data)) return 0
  const started = Number(data.hell.started_round)
  const now = Number(currentRound)
  if (!Number.isFinite(started) || !Number.isFinite(now)) return 0
  return Math.max(0, now - started)
}

export function isInHell(data, currentRound) {
  if (!isHellState(data)) return false
  return hellElapsedRounds(data, currentRound) < normalizeHellRounds(data.hell.rounds, 0)
}

export function hellRoundsLeft(data, currentRound) {
  if (!isInHell(data, currentRound)) return 0
  return normalizeHellRounds(data.hell.rounds, 0) - hellElapsedRounds(data, currentRound)
}

// the round counter reads when hell expires (for "back at round N" copy)
export function hellReturnRound(data) {
  if (!isHellState(data)) return null
  const started = Number(data.hell.started_round)
  if (!Number.isFinite(started)) return null
  return started + normalizeHellRounds(data.hell.rounds, 0)
}

export function enterHellPayload(rounds, currentRound) {
  return {
    hell: {
      rounds: normalizeHellRounds(rounds),
      started_round: Math.max(1, Math.round(Number(currentRound) || 1)),
    },
  }
}
