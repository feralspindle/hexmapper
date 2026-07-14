// Token portraits live in the public reference-photos bucket (members can
// upload there; session-maps insert is GM-only). Only the storage path is
// persisted, on character.data.tokenImagePath.

import { supabase } from '@/lib/supabase'

const BUCKET = 'reference-photos'
const MAX_BYTES = 5 * 1024 * 1024
const EXT_BY_TYPE = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' }

export async function uploadTokenImage(file, sessionId) {
  if (!EXT_BY_TYPE[file.type]) throw new Error('Only JPEG, PNG, WebP, and GIF images are allowed.')
  if (file.size > MAX_BYTES) throw new Error('Image must be under 5 MB.')
  const path = `${sessionId}/token-${crypto.randomUUID()}.${EXT_BY_TYPE[file.type]}`
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false })
  if (error) throw new Error(error.message)
  return path
}

// public urls are pure functions of the path; memoize so per-frame render
// code can call this freely
const _urlCache = new Map()

export function tokenImageUrl(path) {
  if (!path) return null
  let url = _urlCache.get(path)
  if (!url) {
    url = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
    _urlCache.set(path, url)
  }
  return url
}
