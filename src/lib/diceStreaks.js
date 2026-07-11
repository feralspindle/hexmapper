const DICE_PATTERN = /^d(\d+)$/
const MIN_STREAK = 3

function finiteNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function rollAverage(roll) {
  const statsMean = finiteNumber(roll?.stats?.mean)
  if (statsMean != null) return statsMean

  let diceAverage = 0
  let diceCount = 0

  for (const [die, rawCount] of Object.entries(roll?.pending ?? {})) {
    const count = finiteNumber(rawCount)
    if (count == null || count <= 0) continue

    const match = DICE_PATTERN.exec(die)
    if (!match) continue

    const sides = finiteNumber(match[1])
    if (sides == null || sides < 1) continue

    diceAverage += count * ((sides + 1) / 2)
    diceCount += count
  }

  if (!diceCount) return null

  return diceAverage + (finiteNumber(roll?.modifier) ?? 0)
}

export function rollAverageComparison(roll) {
  const average = rollAverage(roll)
  const total = finiteNumber(roll?.total)
  if (average == null || total == null) {
    return { average, delta: null, direction: 'neutral' }
  }

  const delta = total - average
  if (delta > 0) return { average, delta, direction: 'high' }
  if (delta < 0) return { average, delta, direction: 'low' }
  return { average, delta, direction: 'neutral' }
}

export function withRollStreaks(rolls, minStreak = MIN_STREAK) {
  const newestFirst = Array.isArray(rolls) ? rolls : []
  const userStreaks = new Map()
  const chronological = [...newestFirst].reverse()
  const enriched = []

  for (const roll of chronological) {
    const comparison = rollAverageComparison(roll)
    const userKey = roll?.user_id ?? roll?.display_name ?? 'unknown'
    const previous = userStreaks.get(userKey) ?? { direction: null, count: 0 }
    let next = { direction: null, count: 0 }

    if (comparison.direction === 'high' || comparison.direction === 'low') {
      next = {
        direction: comparison.direction,
        count: previous.direction === comparison.direction ? previous.count + 1 : 1,
      }
    }

    userStreaks.set(userKey, next)

    const streak = next.count >= minStreak
      ? {
          kind: next.direction === 'high' ? 'hot' : 'cold',
          direction: next.direction,
          count: next.count,
        }
      : null

    enriched.push({
      ...roll,
      averageComparison: comparison,
      streak,
    })
  }

  return enriched.reverse()
}
