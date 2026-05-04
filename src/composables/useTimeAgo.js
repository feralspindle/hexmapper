import { ref, onUnmounted } from 'vue'

const now = ref(Date.now())
let _count = 0
let _tick = null

export function useTimeAgo() {
  _count++
  if (_count === 1) {
    _tick = setInterval(() => { now.value = Date.now() }, 15000)
  }

  onUnmounted(() => {
    _count--
    if (_count === 0) {
      clearInterval(_tick)
      _tick = null
    }
  })

  function timeAgo(ts) {
    const diff = now.value - new Date(ts).getTime()
    if (diff < 10000)   return 'just now'
    if (diff < 60000)   return `${Math.floor(diff / 1000)}s ago`
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
    return `${Math.floor(diff / 3600000)}h ago`
  }

  return { timeAgo }
}
