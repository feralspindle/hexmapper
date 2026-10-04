import { describe, it, expect } from 'vitest'
import { hexToPixel, hexCorners } from '@/composables/useHexGeometry.js'
import {
  detectHexGrid,
  latticeFromParams,
  alignmentPatchFromDetection,
} from '@/lib/hexGridDetect.js'

function mulberry32(seed) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function splat(img, w, h, x, y, weight, value, bg) {
  if (x < 0 || y < 0 || x >= w || y >= h) return
  const i = y * w + x
  img[i] = Math.max(img[i], bg + (value - bg) * Math.min(1, weight))
}

function drawLine(img, w, h, x0, y0, x1, y1, value, bg) {
  const len = Math.hypot(x1 - x0, y1 - y0)
  const steps = Math.max(2, Math.ceil(len * 3))
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const x = x0 + (x1 - x0) * t
    const y = y0 + (y1 - y0) * t
    const xi = Math.floor(x)
    const yi = Math.floor(y)
    const fx = x - xi
    const fy = y - yi
    splat(img, w, h, xi, yi, (1 - fx) * (1 - fy), value, bg)
    splat(img, w, h, xi + 1, yi, fx * (1 - fy), value, bg)
    splat(img, w, h, xi, yi + 1, (1 - fx) * fy, value, bg)
    splat(img, w, h, xi + 1, yi + 1, fx * fy, value, bg)
  }
}

function renderHexGrid(width, height, opts) {
  const {
    hexWidth,
    hexHeight,
    rotation = 0,
    anchorX = 0,
    anchorY = 0,
    line = 220,
    bg = 40,
    noise = 0,
    seed = 7,
  } = opts
  const img = new Float32Array(width * height).fill(bg)
  if (noise > 0) {
    const rand = mulberry32(seed)
    for (let i = 0; i < img.length; i++) img[i] += (rand() - 0.5) * 2 * noise
  }
  const rad = (rotation * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const size = hexWidth / 2
  const span = Math.ceil(Math.max(width, height) / Math.min(0.75 * hexWidth, hexHeight)) + 3
  const corners = hexCorners(0, 0, size, hexHeight)
  for (let q = -span; q <= span; q++) {
    for (let r = -2 * span; r <= 2 * span; r++) {
      const { x, y } = hexToPixel(q, r, size, hexHeight)
      const cx = anchorX + x * cos - y * sin
      const cy = anchorY + x * sin + y * cos
      if (cx < -hexWidth || cx > width + hexWidth || cy < -hexWidth || cy > height + hexWidth) continue
      for (let e = 0; e < 6; e++) {
        const a = corners[e]
        const b = corners[(e + 1) % 6]
        drawLine(
          img, width, height,
          cx + a.x * cos - a.y * sin, cy + a.x * sin + a.y * cos,
          cx + b.x * cos - b.y * sin, cy + b.x * sin + b.y * cos,
          line, bg,
        )
      }
    }
  }
  return img
}

function anchorResidualPx(det, trueParams, trueAnchor) {
  const { a1, a2 } = latticeFromParams(trueParams)
  const det2 = a2.x * a1.y - a1.x * a2.y
  const dx = det.anchorX - trueAnchor.x
  const dy = det.anchorY - trueAnchor.y
  const u = (dx * a1.y - a1.x * dy) / det2
  const v = (a2.x * dy - dx * a2.y) / det2
  const fu = u - Math.round(u)
  const fv = v - Math.round(v)
  return Math.hypot(fu * a2.x + fv * a1.x, fu * a2.y + fv * a1.y)
}

describe('detectHexGrid', () => {
  it('recovers a straight regular grid with sub-pixel width', () => {
    const params = { hexWidth: 64.4, hexHeight: (Math.sqrt(3) / 2) * 64.4, rotation: 0 }
    const anchor = { x: 17.3, y: 9.8 }
    const img = renderHexGrid(512, 512, { ...params, anchorX: anchor.x, anchorY: anchor.y, noise: 6 })
    const det = detectHexGrid(img, 512, 512)
    expect(det).not.toBeNull()
    expect(Math.abs(det.hexWidth - params.hexWidth)).toBeLessThan(0.005 * params.hexWidth)
    expect(Math.abs(det.hexHeight - params.hexHeight)).toBeLessThan(0.005 * params.hexHeight)
    expect(Math.abs(det.rotation)).toBeLessThan(0.4)
    expect(anchorResidualPx(det, params, anchor)).toBeLessThan(1.5)
  })

  it('recovers a rotated grid', () => {
    const params = { hexWidth: 58, hexHeight: (Math.sqrt(3) / 2) * 58, rotation: 3 }
    const anchor = { x: 5.5, y: 30.2 }
    const img = renderHexGrid(512, 512, { ...params, anchorX: anchor.x, anchorY: anchor.y, noise: 6 })
    const det = detectHexGrid(img, 512, 512)
    expect(det).not.toBeNull()
    expect(Math.abs(det.rotation - 3)).toBeLessThan(0.5)
    expect(Math.abs(det.hexWidth - 58)).toBeLessThan(0.01 * 58)
    expect(anchorResidualPx(det, params, anchor)).toBeLessThan(1.5)
  })

  it('recovers a vertically stretched grid', () => {
    const params = { hexWidth: 70, hexHeight: 0.92 * (Math.sqrt(3) / 2) * 70, rotation: 0 }
    const anchor = { x: 0, y: 0 }
    const img = renderHexGrid(512, 512, { ...params, anchorX: anchor.x, anchorY: anchor.y })
    const det = detectHexGrid(img, 512, 512)
    expect(det).not.toBeNull()
    expect(Math.abs(det.hexWidth - params.hexWidth)).toBeLessThan(0.01 * params.hexWidth)
    expect(Math.abs(det.hexHeight - params.hexHeight)).toBeLessThan(0.01 * params.hexHeight)
  })

  it('returns null on pure noise', () => {
    const rand = mulberry32(1234)
    const img = new Float32Array(512 * 512)
    for (let i = 0; i < img.length; i++) img[i] = rand() * 255
    expect(detectHexGrid(img, 512, 512)).toBeNull()
  })

  it('returns null on a square grid', () => {
    const img = new Float32Array(512 * 512).fill(40)
    for (let k = 0; k < 512; k += 48) {
      drawLine(img, 512, 512, k, 0, k, 511, 220, 40)
      drawLine(img, 512, 512, 0, k, 511, k, 220, 40)
    }
    expect(detectHexGrid(img, 512, 512)).toBeNull()
  })

  it('returns null on images too small to window', () => {
    const img = new Float32Array(64 * 64).fill(40)
    expect(detectHexGrid(img, 64, 64)).toBeNull()
  })
})

describe('alignmentPatchFromDetection', () => {
  it('passes through the identity view', () => {
    const patch = alignmentPatchFromDetection(
      { hexWidth: 64.27, hexHeight: 55.66, rotation: 0, anchorX: 10, anchorY: 20 },
      { naturalWidth: 1000, naturalHeight: 800, imageScale: 1, imageRotation: 0, imageOffsetX: 0, imageOffsetY: 0 },
    )
    expect(patch.mapHexWidth).toBeCloseTo(64.27, 6)
    expect(patch.mapHexHeight).toBeCloseTo(55.66, 6)
    expect(patch.mapGridRotation).toBe(0)
    expect(patch.mapGridOffsetX).toBe(10)
    expect(patch.mapGridOffsetY).toBe(20)
  })

  it('lands a hex center on the detected anchor under scale, rotation, and offset', () => {
    const det = { hexWidth: 90.5, hexHeight: 78.4, rotation: 2, anchorX: 33, anchorY: 41 }
    const view = {
      naturalWidth: 2000,
      naturalHeight: 1400,
      imageScale: 0.5,
      imageRotation: 7,
      imageOffsetX: 12,
      imageOffsetY: -9,
    }
    const patch = alignmentPatchFromDetection(det, view)
    expect(patch.mapGridRotation).toBe(9)

    const cx = (view.naturalWidth * view.imageScale) / 2
    const cy = (view.naturalHeight * view.imageScale) / 2
    const rot = (p, deg) => {
      const rad = (deg * Math.PI) / 180
      const x = p.x - cx
      const y = p.y - cy
      return { x: cx + x * Math.cos(rad) - y * Math.sin(rad), y: cy + x * Math.sin(rad) + y * Math.cos(rad) }
    }
    const scaledAnchor = { x: det.anchorX * view.imageScale, y: det.anchorY * view.imageScale }
    const anchorWorld = rot(scaledAnchor, view.imageRotation)
    anchorWorld.x += view.imageOffsetX
    anchorWorld.y += view.imageOffsetY

    let minDist = Infinity
    for (let q = -3; q <= 3; q++) {
      for (let r = -3; r <= 3; r++) {
        const p = hexToPixel(q, r, patch.mapHexWidth / 2, patch.mapHexHeight)
        const world = rot(p, patch.mapGridRotation)
        const dist = Math.hypot(world.x + patch.mapGridOffsetX - anchorWorld.x, world.y + patch.mapGridOffsetY - anchorWorld.y)
        minDist = Math.min(minDist, dist)
      }
    }
    expect(minDist).toBeLessThan(1.5)
  })
})
