import {
  toGrayscale,
  detectHexGrid,
  latticeFromParams,
  liftAnchorNear,
  reduceAnchor,
  refineAnchorOnField,
  alignmentPatchFromDetection,
} from '@/lib/hexGridDetect.js'

const SAMPLE_TARGET = 1024
const REFINE_CROP = 1024

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('could not load the map image'))
    img.src = url
  })
}

function makeCanvas(width, height) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  return { canvas, ctx }
}

// halving steps for the same reason as tokenImage: a single big downscale
// aliases the thin grid lines detection depends on. every stage uses one
// uniform scale factor so x and y stay exactly isotropic.
function drawScaled(img, naturalWidth, naturalHeight, scale) {
  const stages = []
  let s = scale
  while (s < 0.5) {
    stages.push(0.5)
    s *= 2
  }
  stages.push(s)
  let source = img
  let cw = naturalWidth
  let ch = naturalHeight
  for (const f of stages) {
    const dw = cw * f
    const dh = ch * f
    const { canvas, ctx } = makeCanvas(Math.ceil(dw), Math.ceil(dh))
    ctx.drawImage(source, 0, 0, cw, ch, 0, 0, dw, dh)
    source = canvas
    cw = dw
    ch = dh
  }
  return { canvas: source, width: Math.floor(cw), height: Math.floor(ch) }
}

function grayscaleFromCanvas(canvas, width, height) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  const data = ctx.getImageData(0, 0, width, height).data
  return toGrayscale(data, width, height)
}

function refineAtNaturalRes(img, naturalWidth, naturalHeight, det, sampleScale) {
  const cs = Math.min(REFINE_CROP, naturalWidth, naturalHeight)
  const ox = Math.floor((naturalWidth - cs) / 2)
  const oy = Math.floor((naturalHeight - cs) / 2)
  const { canvas, ctx } = makeCanvas(cs, cs)
  ctx.drawImage(img, ox, oy, cs, cs, 0, 0, cs, cs)
  const gray = grayscaleFromCanvas(canvas, cs, cs)
  const { a1, a2 } = latticeFromParams(det)
  const start = liftAnchorNear(
    { x: det.anchorX - ox, y: det.anchorY - oy },
    a1, a2,
    { x: cs / 2, y: cs / 2 },
  )
  const maxDist = Math.max(3, 1.5 / sampleScale)
  const refined = refineAnchorOnField(gray, cs, cs, det, start, maxDist)
  const anchor = reduceAnchor({ x: refined.x + ox, y: refined.y + oy }, a1, a2)
  return { ...det, anchorX: anchor.x, anchorY: anchor.y }
}

const yieldToPaint = () => new Promise(resolve => setTimeout(resolve, 0))

export async function autoAlignFromImage(url, view = {}) {
  const img = await loadImage(url)
  const naturalWidth = img.naturalWidth
  const naturalHeight = img.naturalHeight
  if (!naturalWidth || !naturalHeight) return null
  await yieldToPaint()
  const scale = Math.min(1, SAMPLE_TARGET / Math.min(naturalWidth, naturalHeight))
  const sampled = drawScaled(img, naturalWidth, naturalHeight, scale)
  const gray = grayscaleFromCanvas(sampled.canvas, sampled.width, sampled.height)
  await yieldToPaint()
  const det = detectHexGrid(gray, sampled.width, sampled.height)
  if (!det) return null
  let natural = {
    hexWidth: det.hexWidth / scale,
    hexHeight: det.hexHeight / scale,
    rotation: det.rotation,
    anchorX: det.anchorX / scale,
    anchorY: det.anchorY / scale,
  }
  if (scale < 1) {
    await yieldToPaint()
    natural = refineAtNaturalRes(img, naturalWidth, naturalHeight, natural, scale)
  }
  return alignmentPatchFromDetection(natural, {
    naturalWidth,
    naturalHeight,
    imageScale: view.imageScale,
    imageRotation: view.imageRotation,
    imageOffsetX: view.imageOffsetX,
    imageOffsetY: view.imageOffsetY,
  })
}
