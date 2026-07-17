// Token portraits live in the private reference-photos bucket (members can
// upload there; session-maps insert is GM-only). Only the storage path is
// persisted, on character.data.tokenImagePath.

import { supabase } from '@/lib/supabase'
import { referencePhotoUrl } from '@/lib/referencePhotoUrl.js'

const BUCKET = 'reference-photos'
const MAX_BYTES = 5 * 1024 * 1024
const EXT_BY_TYPE = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' }
const THUMB_SIZE = 256

export function squareCropRect(width, height) {
  const side = Math.min(width, height)
  return { sx: (width - side) / 2, sy: (height - side) / 2, side }
}

// halving steps down to the target - a single big downscale turns detailed
// line art into aliased noise, especially in safari's svg image rendering
export function downscaleSteps(from, to) {
  const steps = []
  let size = from
  while (size / 2 > to) {
    size = Math.ceil(size / 2)
    steps.push(size)
  }
  steps.push(to)
  return steps
}

// center-crop to a square and shrink to THUMB_SIZE at upload time, so the
// token circle renders a small pre-cropped image instead of the browser
// mushing an arbitrary-size original into ~40px. gifs pass through to keep
// animation; canvas would flatten them.
export async function prepareTokenImage(file) {
  if (file.type === 'image/gif' || typeof createImageBitmap !== 'function') return file
  let bitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    throw new Error('That file does not decode as an image.')
  }
  const { sx, sy, side } = squareCropRect(bitmap.width, bitmap.height)
  const alreadyThumbSized = side <= THUMB_SIZE && bitmap.width === bitmap.height
  if (alreadyThumbSized) {
    bitmap.close?.()
    return file
  }
  let source = bitmap
  let srcRect = { x: sx, y: sy, size: side }
  let canvas = null
  for (const size of downscaleSteps(side, Math.min(side, THUMB_SIZE))) {
    canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(source, srcRect.x, srcRect.y, srcRect.size, srcRect.size, 0, 0, size, size)
    source = canvas
    srcRect = { x: 0, y: 0, size }
  }
  bitmap.close?.()
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'))
  if (!blob) return file
  return new File([blob], 'token.png', { type: 'image/png' })
}

export async function uploadTokenImage(file, sessionId) {
  if (!EXT_BY_TYPE[file.type]) throw new Error('Only JPEG, PNG, WebP, and GIF images are allowed.')
  if (file.size > MAX_BYTES) throw new Error('Image must be under 5 MB.')
  const prepared = await prepareTokenImage(file)
  const path = `${sessionId}/token-${crypto.randomUUID()}.${EXT_BY_TYPE[prepared.type]}`
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, prepared, { contentType: prepared.type, upsert: false })
  if (error) throw new Error(error.message)
  return path
}

// returns null until the signed url resolves; the reactive cache re-runs
// calling computeds once it does, so per-frame render code can call this freely
export function tokenImageUrl(path) {
  return referencePhotoUrl(path)
}
