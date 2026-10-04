export function fftInPlace(re, im, invert = false) {
  const n = re.length
  if (n < 2 || (n & (n - 1)) !== 0) throw new Error('fft length must be a power of two')
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) {
      const tr = re[i]; re[i] = re[j]; re[j] = tr
      const ti = im[i]; im[i] = im[j]; im[j] = ti
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const half = len >> 1
    const ang = (invert ? 2 : -2) * Math.PI / len
    const wr = Math.cos(ang)
    const wi = Math.sin(ang)
    for (let i = 0; i < n; i += len) {
      let cr = 1
      let ci = 0
      for (let k = 0; k < half; k++) {
        const a = i + k
        const b = a + half
        const vr = re[b] * cr - im[b] * ci
        const vi = re[b] * ci + im[b] * cr
        re[b] = re[a] - vr
        im[b] = im[a] - vi
        re[a] += vr
        im[a] += vi
        const ncr = cr * wr - ci * wi
        ci = cr * wi + ci * wr
        cr = ncr
      }
    }
  }
  if (invert) {
    for (let i = 0; i < n; i++) {
      re[i] /= n
      im[i] /= n
    }
  }
}

export function fft2dInPlace(re, im, n, invert = false) {
  for (let y = 0; y < n; y++) {
    fftInPlace(re.subarray(y * n, y * n + n), im.subarray(y * n, y * n + n), invert)
  }
  const colRe = new Float64Array(n)
  const colIm = new Float64Array(n)
  for (let x = 0; x < n; x++) {
    for (let y = 0; y < n; y++) {
      colRe[y] = re[y * n + x]
      colIm[y] = im[y * n + x]
    }
    fftInPlace(colRe, colIm, invert)
    for (let y = 0; y < n; y++) {
      re[y * n + x] = colRe[y]
      im[y * n + x] = colIm[y]
    }
  }
}
