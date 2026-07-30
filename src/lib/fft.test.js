import { describe, it, expect } from 'vitest'
import { fftInPlace, fft2dInPlace } from '@/lib/fft.js'

describe('fftInPlace', () => {
  it('rejects non power-of-two lengths', () => {
    expect(() => fftInPlace(new Float64Array(6), new Float64Array(6))).toThrow()
  })

  it('roundtrips forward then inverse', () => {
    const n = 64
    const re = new Float64Array(n)
    const im = new Float64Array(n)
    for (let i = 0; i < n; i++) re[i] = Math.sin(i * 0.7) + 0.3 * i
    const orig = Float64Array.from(re)
    fftInPlace(re, im)
    fftInPlace(re, im, true)
    for (let i = 0; i < n; i++) {
      expect(re[i]).toBeCloseTo(orig[i], 8)
      expect(im[i]).toBeCloseTo(0, 8)
    }
  })

  it('puts a pure sinusoid energy in the right bin', () => {
    const n = 128
    const k = 5
    const re = new Float64Array(n)
    const im = new Float64Array(n)
    for (let i = 0; i < n; i++) re[i] = Math.cos((2 * Math.PI * k * i) / n)
    fftInPlace(re, im)
    const mag = Array.from({ length: n }, (_, i) => Math.hypot(re[i], im[i]))
    const top = mag.indexOf(Math.max(...mag))
    expect(top === k || top === n - k).toBe(true)
    expect(mag[k]).toBeCloseTo(n / 2, 6)
  })
})

describe('fft2dInPlace', () => {
  it('roundtrips a 2d field', () => {
    const n = 16
    const re = new Float64Array(n * n)
    const im = new Float64Array(n * n)
    for (let i = 0; i < re.length; i++) re[i] = ((i * 31) % 17) - 8
    const orig = Float64Array.from(re)
    fft2dInPlace(re, im, n)
    fft2dInPlace(re, im, n, true)
    for (let i = 0; i < re.length; i++) {
      expect(re[i]).toBeCloseTo(orig[i], 8)
      expect(im[i]).toBeCloseTo(0, 8)
    }
  })
})
