<template>
  <div class="ds-roll-toasts">
    <TransitionGroup name="roll-toast">
      <div v-for="toast in toasts" :key="toast.id" class="ds-roll-toast">
        <div class="ds-rt-die">
          <component :is="DIE_ICONS[highestDie(toast.roll)] ?? DIE_ICONS.d6" :size="16" class="ds-rt-die-icon" />
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
import { DIE_ICONS } from '@/composables/useDiceIcons.js'

const diceStore = useDiceStore()
const { gmName } = useGMLabel()
const toasts = ref([])

const seenIds = new Set()
const TOAST_MAX_AGE_MS = 30_000

watch(
  () => diceStore.rolls[0],
  (newRoll) => {
    if (!newRoll) return

    const age = Date.now() - new Date(newRoll.created_at).getTime()
    if (age > TOAST_MAX_AGE_MS) return

    const id = newRoll.id
    if (seenIds.has(id)) return
    seenIds.add(id)

    toasts.value.push({ id, roll: newRoll })
    if (toasts.value.length > 5) toasts.value.shift()

    setTimeout(() => {
      toasts.value = toasts.value.filter(t => t.id !== id)
      seenIds.delete(id)
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
  background: var(--paper-2, #e3d4b3);
  border: 1px solid var(--rule-strong, rgba(26,20,16,.42));
  border-left: 3px solid var(--accent, #8a1c1c);
  padding: 10px 12px;
  box-shadow: 1px 0 0 rgba(255,255,255,.4) inset, 0 4px 14px rgba(0,0,0,.22);
}

.ds-rt-die {
  flex: 0 0 auto;
  width: 28px; height: 28px;
  display: grid; place-items: center;
  background: var(--paper-3, #d8c69e);
  border: 1px solid var(--rule-strong, rgba(26,20,16,.42));
  margin-top: 2px;
}

.ds-rt-die-icon {
  color: var(--accent, #8a1c1c);
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
  color: var(--ink-mute, #8a7a68);
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
  color: var(--ink, #1a1410);
  line-height: 1;
}

.ds-rt-formula {
  font-family: var(--font-mono, 'JetBrains Mono', monospace);
  font-size: 10px;
  color: var(--ink-mute, #8a7a68);
  margin-left: auto;
}

.ds-rt-crit {
  font-family: var(--font-zine, 'Special Elite', serif);
  font-size: 10px;
  letter-spacing: .1em;
  color: var(--accent, #8a1c1c);
  font-weight: bold;
}

.ds-rt-fumble {
  font-size: 10px;
  letter-spacing: .08em;
  color: var(--accent-2, #b8541c);
  font-weight: bold;
}

.ds-rt-breakdown {
  font-family: var(--font-mono, 'JetBrains Mono', monospace);
  font-size: 10px;
  color: var(--ink-soft, #5a4a3a);
  margin-top: 3px;
  line-height: 1.4;
}

.ds-rt-sep {
  color: var(--ink-mute, #8a7a68);
}

.ds-rt-who {
  font-family: var(--font-display, 'IM Fell English', serif);
  font-style: italic;
  font-size: 11px;
  color: var(--ink-mute, #8a7a68);
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
