export const HEX_SIZE = 48
export const DEFAULT_GRID_COLS = 90
export const DEFAULT_GRID_ROWS = 40

export function hexToPixel(q, r, size = HEX_SIZE, hexH = null) {
  const h = hexH ?? (Math.sqrt(3) * size)
  const x = size * 1.5 * q
  const y = h * (0.5 * q + r)
  return { x, y }
}

export function pixelToHex(x, y, size = HEX_SIZE, hexH = null) {
  const h = hexH ?? (Math.sqrt(3) * size)
  const q = (2 / 3 * x) / size
  const r = y / h - q / 2
  return axialRound(q, r)
}

function axialRound(q, r) {
  const s = -q - r
  let rq = Math.round(q)
  let rr = Math.round(r)
  let rs = Math.round(s)

  const dq = Math.abs(rq - q)
  const dr = Math.abs(rr - r)
  const ds = Math.abs(rs - s)

  if (dq > dr && dq > ds) {
    rq = -rr - rs
  } else if (dr > ds) {
    rr = -rq - rs
  }
  return { q: rq, r: rr }
}

export function hexCorners(cx, cy, size = HEX_SIZE, hexH = null) {
  const hW = size
  const hH = (hexH ?? (Math.sqrt(3) * size)) / 2
  return [
    { x: cx + hW,      y: cy       },
    { x: cx + hW / 2,  y: cy + hH },
    { x: cx - hW / 2,  y: cy + hH },
    { x: cx - hW,      y: cy       },
    { x: cx - hW / 2,  y: cy - hH },
    { x: cx + hW / 2,  y: cy - hH },
  ]
}

export function cornersToPoints(corners) {
  return corners.map(c => `${c.x},${c.y}`).join(' ')
}

export function hexesInRange(cols, rows) {
  const result = []
  for (let q = 0; q < cols; q++) {
    const qOffset = Math.floor(q / 2)
    for (let r = -qOffset; r < rows - qOffset; r++) {
      result.push({ q, r })
    }
  }
  return result
}

export function hexWidth(size = HEX_SIZE) {
  return size * 2
}

export function hexHeight(size = HEX_SIZE) {
  return Math.sqrt(3) * size
}
