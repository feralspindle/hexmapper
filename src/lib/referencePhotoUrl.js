import { reactive } from 'vue'
import { supabase } from '@/lib/supabase'

const BUCKET = 'reference-photos'
const URL_EXPIRY_SECONDS = 86400
const RENEWAL_FRACTION = 0.9

// the bucket is private, so every read needs a signed url. entries renew at
// 90% of expiry on next access. the cache is reactive so computeds that call
// referencePhotoUrl re-run when a sign resolves.
const cache = reactive(new Map())
const pending = new Map()

function _fresh(entry) {
  return entry && Date.now() < entry.renewAt
}

function _store(path, signedUrl) {
  cache.set(path, {
    url: signedUrl,
    renewAt: Date.now() + URL_EXPIRY_SECONDS * RENEWAL_FRACTION * 1000,
  })
}

export function referencePhotoUrl(path) {
  if (!path) return null
  const entry = cache.get(path)
  if (!_fresh(entry)) signReferencePhotoUrl(path)
  return entry?.url ?? null
}

export async function signReferencePhotoUrl(path) {
  if (!path) return null
  const entry = cache.get(path)
  if (_fresh(entry)) return entry.url
  let request = pending.get(path)
  if (!request) {
    request = supabase.storage
      .from(BUCKET)
      .createSignedUrl(path, URL_EXPIRY_SECONDS)
      .then(({ data, error }) => {
        if (error) {
          console.error('referencePhotoUrl:', error.message)
          return cache.get(path)?.url ?? null
        }
        _store(path, data.signedUrl)
        return data.signedUrl
      })
      .finally(() => pending.delete(path))
    pending.set(path, request)
  }
  return request
}

export async function signReferencePhotoUrls(paths) {
  const wanted = [...new Set(paths.filter(Boolean))].filter(p => !_fresh(cache.get(p)))
  if (wanted.length) {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrls(wanted, URL_EXPIRY_SECONDS)
    if (error) console.error('signReferencePhotoUrls:', error.message)
    for (const row of data ?? []) {
      if (row.signedUrl) _store(row.path, row.signedUrl)
    }
  }
  return path => (path ? cache.get(path)?.url ?? null : null)
}

export function clearReferencePhotoUrls() {
  cache.clear()
}
