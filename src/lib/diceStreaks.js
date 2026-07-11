export const MIN_STREAK = 3

// direction of a roll relative to its theoretical distribution, read from the
// server-computed stats (ttrpg-dice-engine DistributionPosition). the server
// already bands outcomes within half a point of the mean as 'average', so a
// 10 or 11 on a d20 is average, not hot or cold.
//
// returns 'high' | 'low' | 'average' | null. null means the roll carries no
// luck information — no stats (legacy row, engine failure) or a deterministic
// roll like flat d1 damage (std_dev 0) — and should leave streaks untouched.
export function rollDirection(roll) {
  const stats = roll?.stats
  if (!stats || typeof stats !== 'object') return null
  if (!(Number(stats.std_dev) > 0)) return null
  if (stats.category === 'above') return 'high'
  if (stats.category === 'below') return 'low'
  if (stats.category === 'average') return 'average'
  return null
}

export function withRollStreaks(rolls, minStreak = MIN_STREAK) {
  const newestFirst = Array.isArray(rolls) ? rolls : []
  const userStreaks = new Map()
  const enriched = new Array(newestFirst.length)

  // walk oldest to newest so each roll extends its user's running streak
  for (let i = newestFirst.length - 1; i >= 0; i--) {
    const roll = newestFirst[i]
    const direction = rollDirection(roll)
    const previous = userStreaks.get(roll?.user_id) ?? { direction: null, count: 0 }

    let next = previous
    if (direction === 'high' || direction === 'low') {
      next = {
        direction,
        count: previous.direction === direction ? previous.count + 1 : 1,
      }
    } else if (direction === 'average') {
      // an average roll is real evidence of unremarkable luck: it ends a streak
      next = { direction: null, count: 0 }
    }
    userStreaks.set(roll?.user_id, next)

    // only rolls that extended the streak wear the badge — a skipped roll
    // keeps the streak alive but is not itself hot or cold
    const streak = (direction === 'high' || direction === 'low') && next.count >= minStreak
      ? { kind: direction === 'high' ? 'hot' : 'cold', count: next.count }
      : null

    enriched[i] = streak ? { ...roll, streak } : roll
  }

  return enriched
}
