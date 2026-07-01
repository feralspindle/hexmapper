import { ref } from 'vue'

const GRACE_MS = 8000

const connected = ref(true)
const showDisconnected = ref(false)
let _downTimer = null

function _scheduleBanner() {
  if (_downTimer || showDisconnected.value) return
  _downTimer = setTimeout(() => {
    showDisconnected.value = true
    _downTimer = null
  }, GRACE_MS)
}

if (typeof window !== 'undefined') {
  window.addEventListener('hexmap:realtime-status', (e) => {
    const ok = !!e.detail?.connected
    connected.value = ok
    if (ok) {
      if (_downTimer) { clearTimeout(_downTimer); _downTimer = null }
      showDisconnected.value = false
    } else {
      _scheduleBanner()
    }
  })
}

export function useRealtimeConnection() {
  return { connected, showDisconnected }
}
