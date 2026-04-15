<template>
  <div class="flex items-center gap-2">
    <button
      :class="[
        'flex items-center gap-1.5 px-2 py-1 rounded transition-colors font-mono text-xs',
        expired
          ? 'bg-red-950/70 text-red-400 animate-pulse'
          : running
            ? 'text-amber-400 hover:bg-stone-800'
            : 'text-stone-500 hover:bg-stone-800 hover:text-parchment-400',
      ]"
      :title="expired ? 'Torch has gone out! Light a new one.' : running ? 'Pause torch' : 'Start torch'"
      :disabled="!dungeonStore.dungeon"
      @click="toggleRunning"
    >
      <i
        :class="expired ? 'ra ra-skull text-red-500' : running ? 'ra ra-torch text-amber-400' : 'fa-solid fa-hourglass-half text-stone-500'"
      />
      <span>{{ displayTime }}</span>
    </button>

    <button
      class="text-stone-500 hover:text-parchment-400 transition-colors"
      title="Light a new torch (reset 60 min)"
      :disabled="!dungeonStore.dungeon"
      @click="reset"
    >
      <i class="fa-solid fa-rotate-left fa-xs" />
    </button>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useD } from '@/stores/dungeonStore.js'

const DURATION = 60 * 60 * 1000 //TODO - is there a need to make this editable by gm, ie for different house rules

const dungeonStore = useD()

const totalElapsed = ref(0)
let tickId = null

const running = computed(() => dungeonStore.dungeon?.torch_running ?? false)
const expired = computed(() => totalElapsed.value >= DURATION)

const remaining = computed(() => Math.max(0, DURATION - totalElapsed.value))

const displayTime = computed(() => {
  const totalSec = Math.ceil(remaining.value / 1000)
  const m = Math.floor(totalSec / 60).toString().padStart(2, '0')
  const s = (totalSec % 60).toString().padStart(2, '0')
  return `${m}:${s}`
})

function computeElapsed() {
  const d = dungeonStore.dungeon
  if (!d) return 0
  const base = d.torch_elapsed_ms ?? 0
  if (d.torch_running && d.torch_started_at) {
    return Math.min(DURATION, base + (Date.now() - new Date(d.torch_started_at).getTime()))
  }
  return Math.min(DURATION, base)
}

function tick() {
  totalElapsed.value = computeElapsed()
}

watch(() => dungeonStore.dungeon, () => {
  tick()
}, { deep: true })

async function toggleRunning() {
  if (expired.value || !dungeonStore.dungeon) return
  const d = dungeonStore.dungeon
  if (d.torch_running) {
    const accumulated = Math.min(DURATION, (d.torch_elapsed_ms ?? 0) + (Date.now() - new Date(d.torch_started_at).getTime()))
    await dungeonStore.updateTorch({
      torch_running: false,
      torch_elapsed_ms: accumulated,
      torch_started_at: null,
    })
  } else {
    await dungeonStore.updateTorch({
      torch_running: true,
      torch_started_at: new Date().toISOString(),
      torch_elapsed_ms: d.torch_elapsed_ms ?? 0,
    })
  }
}

async function reset() {
  if (!dungeonStore.dungeon) return
  const d = dungeonStore.dungeon
  await dungeonStore.updateTorch({
    torch_running: d.torch_running,
    torch_elapsed_ms: 0,
    torch_started_at: d.torch_running ? new Date().toISOString() : null,
  })
}

onMounted(() => {
  tick()
  tickId = setInterval(tick, 500)
})

onUnmounted(() => {
  clearInterval(tickId)
})
</script>
