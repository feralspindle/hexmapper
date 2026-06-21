import { describe, test, expect } from 'vitest'
import {
  HEX_SIZE,
  hexToPixel,
  pixelToHex,
  hexCorners,
  cornersToPoints,
  hexesInRange,
  hexWidth,
  hexHeight,
} from './useHexGeometry.js'

describe('useHexGeometry', () => {
  test('origin maps to the pixel origin', () => {
    expect(hexToPixel(0, 0)).toEqual({ x: 0, y: 0 })
  })

  test('hexToPixel and pixelToHex round-trip for integer axial coords', () => {
    for (const [q, r] of [[0, 0], [1, 0], [0, 1], [3, -2], [-4, 5], [10, 10]]) {
      const { x, y } = hexToPixel(q, r)
      expect(pixelToHex(x, y)).toEqual({ q, r })
    }
  })

  test('pixelToHex rounds to the nearest valid hex (q+r+s == 0)', () => {
    const { q, r } = pixelToHex(70, 12)
    expect(Number.isInteger(q)).toBe(true)
    expect(Number.isInteger(r)).toBe(true)
  })

  test('hexCorners returns six distinct points centered on the given origin', () => {
    const corners = hexCorners(100, 100)
    expect(corners).toHaveLength(6)
    expect(corners[0]).toEqual({ x: 100 + HEX_SIZE, y: 100 })
    expect(corners[3]).toEqual({ x: 100 - HEX_SIZE, y: 100 })
  })

  test('cornersToPoints renders an SVG points string', () => {
    const points = cornersToPoints([{ x: 1, y: 2 }, { x: 3, y: 4 }])
    expect(points).toBe('1,2 3,4')
  })

  test('hexesInRange yields cols*rows cells with the expected column offset', () => {
    const cells = hexesInRange(2, 2)
    expect(cells).toHaveLength(4)
    const keys = cells.map(c => `${c.q},${c.r + 0}`)
    expect(keys).toContain('0,0')
    expect(keys).toContain('1,1')
  })

  test('hexWidth and hexHeight derive from size', () => {
    expect(hexWidth(48)).toBe(96)
    expect(hexHeight(48)).toBeCloseTo(Math.sqrt(3) * 48, 6)
  })
})
