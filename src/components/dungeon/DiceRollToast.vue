<template>
  <div class="ds-roll-toasts">
    <TransitionGroup name="roll-toast">
      <div v-for="toast in toasts" :key="toast.id" class="ds-roll-toast">
        <div class="ds-rt-die">
          <i :class="[dieIconClass(toast.roll), 'ds-rt-die-icon']" />
        </div>

        <div class="ds-rt-body">
          <div v-if="toast.roll.label" class="ds-rt-label">{{ toast.roll.label }}</div>

          <div class="ds-rt-total-row">
            <span class="ds-rt-total">{{ toast.roll.total }}</span>
            <span class="ds-rt-formula">{{ rollLabel(toast.roll) }}</span>
            <span v-if="isCrit(toast.roll)" class="ds-rt-crit">CRIT!</span>
            <span v-else-if="isFumble(toast.roll)" class="ds-rt-fumble">FAIL</span>
          </div>

          <div v-if="toast.roll.results?.length" class="ds-rt-breakdown">
            [<template v-for="(r, i) in toast.roll.results" :key="i"
              ><span :class="r.value === 20 && r.die === 'd20' ? 'ds-rt-crit' : r.value === 1 && r.die === 'd20' ? 'ds-rt-fumble' : ''">{{ r.value }}</span><span v-if="i < toast.roll.results.length - 1" class="ds-rt-sep">, </span
            ></template>]
          </div>

          <div class="ds-rt-who">— {{ gmName(toast.roll.user_id, toast.roll.display_name ?? 'Adventurer') }}</div>
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
.ds-roll-toasts {
  position: absolute;
  bottom: 72px;
  left: 16px;
  z-index: 20;
  display: flex;
  flex-direction: column-reverse;
  gap: 8px;
  max-width: 220px;
  pointer-events: none;
  user-select: none;
}

.ds-roll-toast {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  background: var(--ink, #1a1410);
  border: 1px solid rgba(237,225,199,.18);
  border-radius: 4px;
  padding: 10px 12px;
  box-shadow: 0 4px 20px rgba(0,0,0,.65), 0 0 0 1px rgba(237,225,199,.05) inset;
}

.ds-rt-die {
  flex: 0 0 auto;
  width: 28px; height: 28px;
  display: grid; place-items: center;
  background: rgba(237,225,199,.07);
  border: 1px solid rgba(237,225,199,.16);
  border-radius: 3px;
  margin-top: 2px;
}

.ds-rt-die-icon {
  color: var(--accent, #c8a86b);
  font-size: 14px;
}

.ds-rt-body {
  flex: 1;
  min-width: 0;
}

.ds-rt-label {
  font-family: var(--font-zine, 'Special Elite', serif);
  font-size: 9px;
  letter-spacing: .12em;
  text-transform: uppercase;
  color: rgba(237,225,199,.45);
  margin-bottom: 2px;
}

.ds-rt-total-row {
  display: flex;
  align-items: baseline;
  gap: 6px;
}

.ds-rt-total {
  font-family: var(--font-zine, 'Special Elite', serif);
  font-size: 28px;
  color: var(--paper, #ede1c7);
  line-height: 1;
}

.ds-rt-formula {
  font-family: var(--font-mono, 'JetBrains Mono', monospace);
  font-size: 10px;
  color: rgba(237,225,199,.4);
  margin-left: auto;
}

.ds-rt-crit {
  font-family: var(--font-zine, 'Special Elite', serif);
  font-size: 10px;
  letter-spacing: .1em;
  color: var(--accent, #c8a86b);
  font-weight: bold;
}

.ds-rt-fumble {
  font-size: 10px;
  letter-spacing: .08em;
  color: #b84040;
  font-weight: bold;
}

.ds-rt-breakdown {
  font-family: var(--font-mono, 'JetBrains Mono', monospace);
  font-size: 10px;
  color: rgba(237,225,199,.38);
  margin-top: 3px;
  line-height: 1.4;
}

.ds-rt-sep {
  color: rgba(237,225,199,.22);
}

.ds-rt-who {
  font-family: var(--font-display, 'IM Fell English', serif);
  font-style: italic;
  font-size: 11px;
  color: rgba(237,225,199,.42);
  margin-top: 5px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.roll-toast-enter-active { transition: all 0.18s ease-out; }
.roll-toast-leave-active { transition: all 0.5s ease-in; }
.roll-toast-enter-from   { opacity: 0; transform: translateX(-10px); }
.roll-toast-leave-to     { opacity: 0; transform: translateX(-10px); }
.roll-toast-move         { transition: transform 0.2s ease; }
</style>
