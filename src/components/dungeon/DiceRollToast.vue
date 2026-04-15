<template>
  <div
    class="absolute bottom-16 left-4 z-20 flex flex-col-reverse gap-2 pointer-events-none select-none"
    style="max-width: 230px"
  >
    <TransitionGroup name="roll-toast">
      <div
        v-for="toast in toasts"
        :key="toast.id"
        class="bg-stone-900/90 border border-stone-600 rounded-lg px-3 py-2 backdrop-blur flex items-start gap-2.5"
      >
        <div class="shrink-0 mt-0.5 w-7 h-7 rounded bg-stone-800 border border-stone-600 flex items-center justify-center">
          <i :class="[dieIconClass(toast.roll), 'text-amber-400 text-base']" />
        </div>

        <div class="min-w-0 flex-1">
          <div v-if="toast.roll.label" class="text-parchment-400/80 text-xs uppercase tracking-wider mb-0.5" style="font-family: 'Crimson Text', serif">
            {{ toast.roll.label }}
          </div>

          <div class="flex items-baseline gap-1.5">
            <span class="font-mono font-bold leading-none text-2xl text-parchment-200">{{ toast.roll.total }}</span>
            <span class="text-stone-300 text-sm font-mono">{{ rollLabel(toast.roll) }}</span>
            <span v-if="isCrit(toast.roll)" class="text-amber-300 text-xs font-bold ml-auto">CRIT!</span>
            <span v-else-if="isFumble(toast.roll)" class="text-red-400 text-xs font-bold ml-auto">FAIL</span>
          </div>

          <div v-if="toast.roll.results?.length" class="text-stone-300 text-sm mt-0.5 font-mono leading-snug">
            [<template v-for="(r, i) in toast.roll.results" :key="i">
              <span
                :class="r.value === 20 && r.die === 'd20' ? 'text-amber-300 font-bold' : r.value === 1 && r.die === 'd20' ? 'text-red-400 font-bold' : 'text-stone-300'"
              >{{ r.value }}</span><span v-if="i < toast.roll.results.length - 1" class="text-stone-500">, </span>
            </template>]
          </div>

          <div class="text-parchment-400/80 text-sm mt-1 truncate" style="font-family: 'Crimson Text', serif; font-style: italic">
            — {{ gmName(toast.roll.user_id, toast.roll.display_name ?? 'Adventurer') }}
          </div>
        </div>
      </div>
    </TransitionGroup>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import { useDiceStore } from '@/stores/diceStore.js'
import { useGMLabel } from '@/composables/useGMLabel.js'

const diceStore = useDiceStore()
const { gmName } = useGMLabel()
const toasts = ref([])

const seenKeys = new Set()
let ready = false

function rollKey(roll) {
  const dice = Object.entries(roll.pending ?? {})
    .filter(([, v]) => v > 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}:${v}`)
    .join(',')
  return `${roll.user_id ?? roll.display_name}:${roll.total}:${dice}`
}

watch(
  () => diceStore.rolls[0],
  (newRoll) => {
    if (!newRoll) return
    if (!ready) { ready = true; return }

    const key = rollKey(newRoll)
    if (seenKeys.has(key)) return
    seenKeys.add(key)

    const toastId = newRoll.id
    toasts.value.push({ id: toastId, roll: newRoll })
    if (toasts.value.length > 5) toasts.value.shift()

    setTimeout(() => {
      toasts.value = toasts.value.filter(t => t.id !== toastId)
      seenKeys.delete(key)
    }, 5000)
  },
)

const DICE_ORDER = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100']

function highestDie(roll) {
  for (const die of [...DICE_ORDER].reverse()) {
    if ((roll.pending?.[die] ?? 0) > 0) return die
  }
  return null
}

function dieIconClass(roll) {
  const die = highestDie(roll)
  if (die === 'd20') return 'fa-solid fa-dice-d20'
  if (die === 'd100') return 'fa-solid fa-percent'
  return 'fa-solid fa-dice-d6'
}

function isSingleD20(roll) {
  return (roll.pending?.d20 ?? 0) === 1 &&
    DICE_ORDER.filter(d => d !== 'd20').every(d => (roll.pending?.[d] ?? 0) === 0)
}

function isCrit(roll) {
  return isSingleD20(roll) && roll.results?.some(r => r.die === 'd20' && r.value === 20)
}

function isFumble(roll) {
  return isSingleD20(roll) && roll.results?.some(r => r.die === 'd20' && r.value === 1)
}

function rollLabel(roll) {
  const parts = DICE_ORDER
    .filter(d => (roll.pending?.[d] ?? 0) > 0)
    .map(d => `${roll.pending[d]}${d}`)
  const label = parts.join('+')
  if (!label) return ''
  const mod = roll.modifier ?? 0
  if (mod > 0) return `${label}+${mod}`
  if (mod < 0) return `${label}${mod}`
  return label
}

</script>

<style scoped>
.roll-toast-enter-active {
  transition: all 0.18s ease-out;
}
.roll-toast-leave-active {
  transition: all 0.5s ease-in;
}
.roll-toast-enter-from {
  opacity: 0;
  transform: translateX(-10px);
}
.roll-toast-leave-to {
  opacity: 0;
  transform: translateX(-10px);
}
.roll-toast-move {
  transition: transform 0.2s ease;
}
</style>
