import { describe, test, expect } from 'vitest'
import { generateRoomPlan, weightedPick, overlaps, wallOverlapSpan, STOCKING_FALLBACK } from './dungeonGenerator.js'

// mulberry32 so runs are reproducible
function seeded(seed) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

describe('dungeonGenerator', () => {
  test('the first room lands with one door and sane size', () => {
    const plan = generateRoomPlan([], seeded(1))

    expect(plan.room.width).toBeGreaterThanOrEqual(2)
    expect(plan.room.width).toBeLessThanOrEqual(5)
    expect(plan.room.height).toBeGreaterThanOrEqual(2)
    expect(plan.room.height).toBeLessThanOrEqual(5)
    expect(plan.roomDoors).toHaveLength(1)
    expect(plan.sourceDoor).toBeNull()
  })

  test('thirty generated rooms never overlap and stay connected', () => {
    const rng = seeded(7)
    const rooms = []
    let connected = 0
    for (let i = 0; i < 30; i += 1) {
      const plan = generateRoomPlan(rooms, rng)
      for (const existing of rooms) {
        expect(overlaps(plan.room, existing)).toBe(false)
      }
      if (plan.sourceDoor) {
        connected += 1
        expect(rooms.some(r => r.id === plan.sourceDoor.roomId)).toBe(true)
      }
      rooms.push({ id: `r${i}`, shape: 'rect', ...plan.room })
    }
    // everything after the first room should connect to something except the
    // rare fully-boxed-in fallback
    expect(connected).toBeGreaterThanOrEqual(25)
  })

  test('door offsets always land on the wall', () => {
    const rng = seeded(42)
    const rooms = []
    for (let i = 0; i < 20; i += 1) {
      const plan = generateRoomPlan(rooms, rng)
      for (const door of plan.roomDoors) {
        expect(['n', 's', 'e', 'w']).toContain(door.wall)
        expect(door.offset).toBeGreaterThan(0)
        expect(door.offset).toBeLessThan(1)
      }
      if (plan.sourceDoor) {
        expect(plan.sourceDoor.door.offset).toBeGreaterThan(0)
        expect(plan.sourceDoor.door.offset).toBeLessThan(1)
      }
      rooms.push({ id: `r${i}`, shape: 'rect', ...plan.room })
    }
  })

  test('a 1-wide hand-drawn source never yields a corner-touching room', () => {
    // jitter against a 1-cell source used to place rooms sharing only a
    // corner - doors into solid wall. every accepted plan must share at
    // least one full wall cell with its source.
    const source = { id: 'thin', shape: 'rect', origin_x: 10, origin_y: 10, width: 1, height: 1 }
    const rng = seeded(3)
    for (let i = 0; i < 200; i += 1) {
      const plan = generateRoomPlan([source], rng)
      if (!plan.sourceDoor) continue
      const wall = plan.sourceDoor.door.wall
      expect(wallOverlapSpan(source, wall, plan.room)).toBeGreaterThanOrEqual(1)
    }
  })

  test('stocking fallback picks respect the weights', () => {
    // rng returning 0 always lands the heaviest first row
    expect(weightedPick(STOCKING_FALLBACK, () => 0).result).toBe('Empty')
    // rng near 1 lands the last row
    expect(weightedPick(STOCKING_FALLBACK, () => 0.999).result).toContain('special')
  })
})
