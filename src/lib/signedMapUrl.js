import { ref } from 'vue'
import { supabase } from '@/lib/supabase'

const URL_EXPIRY_SECONDS = 86400
const RENEWAL_FRACTION = 0.9

// a self-renewing signed URL for a session-maps object. holds one url ref,
// re-signs at 90% of the expiry, and renews an overdue url when a backgrounded
// tab (whose timers were throttled) becomes visible again. the generation guard
// drops a slow earlier sign that resolves after a newer refresh.
export function createSignedMapUrl() {
  const url = ref(null)
  let timer = null
  let renewal = null
  let generation = 0

  async function refresh(path) {
    const gen = ++generation
    if (timer) { clearTimeout(timer); timer = null }
    renewal = null
    if (!path) { url.value = null; return }
    const { data, error } = await supabase.storage
      .from('session-maps')
      .createSignedUrl(path, URL_EXPIRY_SECONDS)
    if (gen !== generation) return
    if (error) {
      // only blank the image when the object is actually gone; a transient
      // sign failure (network blip at the renewal tick) keeps the last-good url
      if (error.message === 'Object not found') url.value = null
      else console.error('signed map url:', error.message)
      return
    }
    url.value = data.signedUrl
    const renewalMs = URL_EXPIRY_SECONDS * RENEWAL_FRACTION * 1000
    renewal = { path, at: Date.now() + renewalMs }
    timer = setTimeout(() => refresh(path), renewalMs)
  }

  function cleanup() {
    generation += 1
    if (timer) { clearTimeout(timer); timer = null }
    renewal = null
    url.value = null
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return
      if (renewal && Date.now() >= renewal.at) refresh(renewal.path)
    })
  }

  return { url, refresh, cleanup }
}
