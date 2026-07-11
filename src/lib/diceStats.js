import { rollDirection, MIN_STREAK } from '@/lib/diceStreaks.js'

const GAP_HOURS = 4
const MS_PER_HOUR = 3600 * 1000

// a roll carries luck information only when the server attached distribution
// stats with real spread. flat d1 damage (std_dev 0) and legacy rows (no stats)
// tell us nothing about how lucky a player is and must stay out of the averages.
// mirrors rollDirection in diceStreaks.js.
export function usableRoll(roll) {
  const stats = roll?.stats
  if (!stats || typeof stats !== 'object') return false
  if (!(Number(stats.std_dev) > 0)) return false
  return Number.isFinite(Number(stats.z_score))
}

function rollTime(roll) {
  return new Date(roll?.created_at ?? 0).getTime()
}

// rolls arrive newest-first (diceStore order). "tonight" runs from the newest
// roll back to the first gap of more than gapHours between adjacent rolls, so a
// play session is caught whole even across midnight.
export function splitTonight(rolls, gapHours = GAP_HOURS) {
  const all = Array.isArray(rolls) ? rolls : []
  const threshold = gapHours * MS_PER_HOUR

  let cut = all.length
  for (let i = 0; i < all.length - 1; i++) {
    if (rollTime(all[i]) - rollTime(all[i + 1]) > threshold) {
      cut = i + 1
      break
    }
  }

  return { tonight: all.slice(0, cut), all }
}

function newBucket() {
  return { count: 0, sumZ: 0, sumPct: 0, aboveCount: 0 }
}

function addRoll(bucket, roll) {
  bucket.count += 1
  bucket.sumZ += Number(roll.stats.z_score)
  bucket.sumPct += Number(roll.stats.percentile_rank)
  if (roll.stats.category === 'above') bucket.aboveCount += 1
}

function skillKey(roll) {
  const label = typeof roll?.label === 'string' ? roll.label.trim() : ''
  return label || null
}

export function rankPlayers(rolls, { ownerId = null } = {}) {
  const source = Array.isArray(rolls) ? rolls : []
  const byUser = new Map()

  for (const roll of source) {
    if (!usableRoll(roll)) continue
    let entry = byUser.get(roll.user_id)
    if (!entry) {
      entry = {
        userId: roll.user_id,
        displayName: roll.display_name,
        characterId: roll.character_id ?? null,
        isGM: !!ownerId && roll.user_id === ownerId,
        ...newBucket(),
      }
      byUser.set(roll.user_id, entry)
    }
    addRoll(entry, roll)
  }

  return [...byUser.values()]
    .map(({ sumZ, sumPct, aboveCount, count, ...rest }) => ({
      ...rest,
      count,
      avgZ: sumZ / count,
      avgPercentile: sumPct / count,
      aboveShare: aboveCount / count,
    }))
    .sort((a, b) => b.avgZ - a.avgZ || b.count - a.count || a.displayName.localeCompare(b.displayName))
}

export function rankSkills(rolls) {
  const source = Array.isArray(rolls) ? rolls : []
  const byLabel = new Map()

  for (const roll of source) {
    if (!usableRoll(roll)) continue
    const label = skillKey(roll)
    let entry = byLabel.get(label)
    if (!entry) {
      entry = { label, ...newBucket() }
      byLabel.set(label, entry)
    }
    addRoll(entry, roll)
  }

  return [...byLabel.values()]
    .map(({ sumZ, count, label }) => ({ label, count, avgZ: sumZ / count }))
    .sort((a, b) => b.avgZ - a.avgZ)
}

export function formatZ(z) {
  return `${z >= 0 ? '+' : '−'}${Math.abs(z).toFixed(2)}σ`
}

export function ordinal(value) {
  const n = Math.round(value)
  const tens = n % 100
  if (tens >= 11 && tens <= 13) return `${n}th`
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`
}

export function bestPlayerPerSkill(rolls) {
  const source = Array.isArray(rolls) ? rolls : []
  const byLabel = new Map()

  for (const roll of source) {
    if (!usableRoll(roll)) continue
    const label = skillKey(roll)
    let players = byLabel.get(label)
    if (!players) {
      players = new Map()
      byLabel.set(label, players)
    }
    let entry = players.get(roll.user_id)
    if (!entry) {
      entry = { userId: roll.user_id, displayName: roll.display_name, ...newBucket() }
      players.set(roll.user_id, entry)
    }
    addRoll(entry, roll)
  }

  const result = []
  for (const [label, players] of byLabel) {
    let best = null
    for (const p of players.values()) {
      const avgZ = p.sumZ / p.count
      if (!best || avgZ > best.avgZ) best = { label, userId: p.userId, displayName: p.displayName, avgZ, count: p.count }
    }
    if (best) result.push(best)
  }

  return result.sort((a, b) => b.avgZ - a.avgZ)
}

// the longest run of consecutive above-average (hot) and below-average (cold)
// rolls any single player put together, using the same direction rules as the
// per-roll streak badges: an average roll breaks a run, a statless roll is
// skipped without breaking it. only runs that reached a real streak (minStreak)
// are reported. returns { hot, cold }, each { userId, displayName, count } or null.
export function longestStreaks(rolls, minStreak = MIN_STREAK) {
  const source = Array.isArray(rolls) ? rolls : []
  const running = new Map()
  let hot = null
  let cold = null

  // walk oldest to newest so each roll extends its user's running run
  for (let i = source.length - 1; i >= 0; i--) {
    const roll = source[i]
    const direction = rollDirection(roll)
    const previous = running.get(roll?.user_id) ?? { direction: null, count: 0 }

    let next = previous
    if (direction === 'high' || direction === 'low') {
      next = { direction, count: previous.direction === direction ? previous.count + 1 : 1 }
    } else if (direction === 'average') {
      next = { direction: null, count: 0 }
    }
    running.set(roll?.user_id, next)

    if (next.count >= minStreak) {
      const entry = { userId: roll.user_id, displayName: roll.display_name, count: next.count }
      if (direction === 'high' && (!hot || entry.count > hot.count)) hot = entry
      if (direction === 'low' && (!cold || entry.count > cold.count)) cold = entry
    }
  }

  return { hot, cold }
}
