<template>
  <div class="flex items-center gap-2">
    <button
      v-tooltip.bottom="expired ? 'The torch has gone out — light a new one' : running ? 'Pause the torch timer' : 'Start the torch timer'"
      :class="[
        'flex items-center gap-1.5 px-2 py-1 rounded transition-colors font-mono text-sm',
        expired
          ? 'bg-red-950/70 text-red-400 animate-pulse'
          : running
            ? 'text-amber-400 hover:bg-stone-800'
            : 'text-stone-500 hover:bg-stone-800 hover:text-parchment-400',
      ]"
      :disabled="!sessionStore.sessionId"
      @click="toggleRunning"
    >
      <i
        v-if="!pending"
        :class="expired ? 'ra ra-skull text-red-500' : running ? 'ra ra-torch text-amber-400' : 'fa-solid fa-hourglass-half text-stone-500'"
      />
      <i v-else class="fa-solid fa-circle-notch fa-spin" style="opacity:.6" />
      <span>{{ displayTime }}</span>
    </button>

    <button
      v-tooltip.bottom="'Light a new torch — resets the timer to 60 minutes'"
      class="text-stone-500 hover:text-parchment-400 transition-colors"
      :disabled="!sessionStore.sessionId || pending"
      @click="reset"
    >
      <i v-if="!pending" class="fa-solid fa-rotate-left fa-xs" />
      <i v-else class="fa-solid fa-circle-notch fa-spin fa-xs" style="opacity:.6" />
    </button>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useSessionStore } from '@/stores/sessionStore.js'

const DURATION = 60 * 60 * 1000

const sessionStore = useSessionStore()

const totalElapsed = ref(0)
const pending = ref(false)
let tickId = null

const running = computed(() => sessionStore.torchRunning)
const expired = computed(() => totalElapsed.value >= DURATION)
const remaining = computed(() => Math.max(0, DURATION - totalElapsed.value))

const displayTime = computed(() => {
  const totalSec = Math.floor(remaining.value / 1000)
  const m = Math.floor(totalSec / 60).toString().padStart(2, '0')
  const s = (totalSec % 60).toString().padStart(2, '0')
  return `${m}:${s}`
})

function computeElapsed() {
  const base = sessionStore.torchElapsedMs
  if (sessionStore.torchRunning && sessionStore.torchStartedAt) {
    return Math.min(DURATION, base + (Date.now() - new Date(sessionStore.torchStartedAt).getTime()))
  }
  return Math.min(DURATION, base)
}

function tick() {
  totalElapsed.value = computeElapsed()
}

watch(
  () => [sessionStore.torchRunning, sessionStore.torchElapsedMs, sessionStore.torchStartedAt],
  tick,
)

function waitForRunning(expected, timeout = 5000) {
  if (sessionStore.torchRunning === expected) return Promise.resolve()
  return new Promise(resolve => {
    const stop = watch(() => sessionStore.torchRunning, val => {
      if (val === expected) { stop(); resolve() }
    })
    setTimeout(() => { stop(); resolve() }, timeout)
  })
}

async function toggleRunning() {
  if (expired.value || !sessionStore.sessionId || pending.value) return
  const expectedRunning = !sessionStore.torchRunning
  pending.value = true
  try {
    if (sessionStore.torchRunning) {
      await sessionStore.torchPause()
    } else {
      await sessionStore.torchStart()
    }
    await waitForRunning(expectedRunning)
  } finally {
    pending.value = false
  }
}

async function reset() {
  if (!sessionStore.sessionId || pending.value) return
  pending.value = true
  try {
    await sessionStore.torchReset()
    if (!sessionStore.torchRunning) await sessionStore.torchStart()
    await waitForRunning(true)
  } finally {
    pending.value = false
  }
}

onMounted(() => {
  tick()
  tickId = setInterval(tick, 500)
})

onUnmounted(() => {
  clearInterval(tickId)
})
</script>
