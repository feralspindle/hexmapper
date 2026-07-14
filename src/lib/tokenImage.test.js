import { describe, test, expect } from 'vitest'
import { squareCropRect, downscaleSteps } from './tokenImage.js'

describe('tokenImage', () => {
  test('squareCropRect centers the crop on the long axis', () => {
    expect(squareCropRect(800, 500)).toEqual({ sx: 150, sy: 0, side: 500 })
    expect(squareCropRect(500, 800)).toEqual({ sx: 0, sy: 150, side: 500 })
    expect(squareCropRect(256, 256)).toEqual({ sx: 0, sy: 0, side: 256 })
  })

  test('downscaleSteps halves toward the target and lands exactly on it', () => {
    expect(downscaleSteps(800, 256)).toEqual([400, 256])
    expect(downscaleSteps(3000, 256)).toEqual([1500, 750, 375, 256])
    expect(downscaleSteps(500, 256)).toEqual([256])
    expect(downscaleSteps(256, 256)).toEqual([256])
  })

  test('every step ratio stays at or under 2x', () => {
    for (const from of [257, 500, 1024, 2048, 5000]) {
      let prev = from
      for (const size of downscaleSteps(from, 256)) {
        expect(prev / size).toBeLessThanOrEqual(2)
        prev = size
      }
      expect(prev).toBe(256)
    }
  })
})
