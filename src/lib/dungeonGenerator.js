// dungeon generator (#50): rooms reveal themselves as you explore. pure
// planning functions, rng injected so tests can seed it. geometry is ordinary
// room data - generated rooms are as editable as hand-drawn ones.

// weighted stocking fallback for sessions without a dungeon.stocking table
export const STOCKING_FALLBACK = [
  { weight: 4, result: 'Empty' },
  { weight: 3, result: 'Monster - roll or pick one, it heard you coming' },
  { weight: 2, result: 'Trap - pit, dart, gas, glyph, or the floor itself' },
  { weight: 2, result: 'Treasure, guarded or hidden' },
  { weight: 1, result: 'Something special - shaft down, talking statue, portal, prisoner' },
]

export function weightedPick(rows, rng) {
  const total = rows.reduce((sum, row) => sum + (row.weight ?? 1), 0)
  let roll = rng() * total
  for (const row of rows) {
    roll -= row.weight ?? 1
    if (roll < 0) return row
  }
  return rows[rows.length - 1]
}

function intBetween(rng, min, max) {
  return min + Math.floor(rng() * (max - min + 1))
}

export function overlaps(a, b, margin = 0) {
  return (
    a.origin_x < b.origin_x + b.width + margin &&
    a.origin_x + a.width + margin > b.origin_x &&
    a.origin_y < b.origin_y + b.height + margin &&
    a.origin_y + a.height + margin > b.origin_y
  )
}

const WALLS = ['n', 's', 'e', 'w']
const OPPOSITE = { n: 's', s: 'n', e: 'w', w: 'e' }

// length of the wall segment two flush rooms actually share. jitter against a
// narrow source can leave rooms touching only at a corner - a zero-length
// span means the doors would open into solid wall
export function wallOverlapSpan(source, wall, room) {
  if (wall === 'n' || wall === 's') {
    return Math.min(source.origin_x + source.width, room.origin_x + room.width)
      - Math.max(source.origin_x, room.origin_x)
  }
  return Math.min(source.origin_y + source.height, room.origin_y + room.height)
    - Math.max(source.origin_y, room.origin_y)
}

// candidate room placed flush against `source` on `wall`, roughly centered on
// the source's midline with some jitter
function candidateAgainst(source, wall, width, height, rng) {
  const jitter = intBetween(rng, -1, 1)
  switch (wall) {
    case 'n':
      return {
        origin_x: source.origin_x + Math.floor((source.width - width) / 2) + jitter,
        origin_y: source.origin_y - height,
        width,
        height,
      }
    case 's':
      return {
        origin_x: source.origin_x + Math.floor((source.width - width) / 2) + jitter,
        origin_y: source.origin_y + source.height,
        width,
        height,
      }
    case 'w':
      return {
        origin_x: source.origin_x - width,
        origin_y: source.origin_y + Math.floor((source.height - height) / 2) + jitter,
        width,
        height,
      }
    default:
      return {
        origin_x: source.origin_x + source.width,
        origin_y: source.origin_y + Math.floor((source.height - height) / 2) + jitter,
        width,
        height,
      }
  }
}

// door offsets on the shared wall, at the midpoint of the overlap span
function sharedDoors(source, wall, room) {
  if (wall === 'n' || wall === 's') {
    const lo = Math.max(source.origin_x, room.origin_x)
    const hi = Math.min(source.origin_x + source.width, room.origin_x + room.width)
    const mid = (lo + hi) / 2
    return {
      source: { wall, offset: clamp01((mid - source.origin_x) / source.width) },
      room: { wall: OPPOSITE[wall], offset: clamp01((mid - room.origin_x) / room.width) },
    }
  }
  const lo = Math.max(source.origin_y, room.origin_y)
  const hi = Math.min(source.origin_y + source.height, room.origin_y + room.height)
  const mid = (lo + hi) / 2
  return {
    source: { wall, offset: clamp01((mid - source.origin_y) / source.height) },
    room: { wall: OPPOSITE[wall], offset: clamp01((mid - room.origin_y) / room.height) },
  }
}

function clamp01(value) {
  return Math.min(0.95, Math.max(0.05, value))
}

// plan one new room: size d4+1 square-ish, flush against a random existing
// rect room with a connecting door on the shared wall, plus 0-2 extra exits
// waiting to be explored. first room lands at the origin.
export function generateRoomPlan(existingRooms, rng = Math.random) {
  const width = intBetween(rng, 2, 5)
  const height = intBetween(rng, 2, 5)
  const rects = existingRooms.filter(r => (r.shape ?? 'rect') === 'rect')

  if (!rects.length) {
    return {
      room: { origin_x: 10, origin_y: 10, width, height, shape: 'rect' },
      roomDoors: [{ wall: WALLS[intBetween(rng, 0, 3)], offset: 0.5 }],
      sourceDoor: null,
    }
  }

  for (let attempt = 0; attempt < 16; attempt += 1) {
    const source = rects[intBetween(rng, 0, rects.length - 1)]
    const wall = WALLS[intBetween(rng, 0, 3)]
    const candidate = candidateAgainst(source, wall, width, height, rng)
    if (existingRooms.some(existing => overlaps(candidate, existing))) continue
    // corner-touch is not adjacency - the connecting door needs a real wall
    if (wallOverlapSpan(source, wall, candidate) < 1) continue

    const doors = sharedDoors(source, wall, candidate)
    const roomDoors = [doors.room]
    const extraExits = intBetween(rng, 0, 2)
    const free = WALLS.filter(w => w !== doors.room.wall)
    for (let i = 0; i < extraExits; i += 1) {
      roomDoors.push({
        wall: free[intBetween(rng, 0, free.length - 1)],
        offset: clamp01(0.25 + rng() * 0.5),
      })
    }
    return {
      room: { ...candidate, shape: 'rect' },
      roomDoors,
      sourceDoor: { roomId: source.id, door: doors.source },
    }
  }

  // every candidate collided: fall out past the right edge of the dungeon
  const rightmost = Math.max(...existingRooms.map(r => r.origin_x + (r.width ?? 2)))
  const anchor = rects[0]
  return {
    room: { origin_x: rightmost + 2, origin_y: anchor.origin_y, width, height, shape: 'rect' },
    roomDoors: [{ wall: 'w', offset: 0.5 }],
    sourceDoor: null,
  }
}
