<template>
  <div class="ds-panel-section" :class="{ collapsed: !open }" style="flex:0 0 auto">
    <div class="ds-section-head" @click="open = !open">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" style="flex:0 0 auto">
        <rect x="2" y="2" width="9" height="9" rx="1"/><rect x="13" y="2" width="9" height="9" rx="1"/><rect x="13" y="13" width="9" height="9" rx="1"/><rect x="2" y="13" width="9" height="9" rx="1"/>
      </svg>
      <h3>Dice</h3>
      <span class="ds-meta">{{ diceStore.rolls.length }} rolls</span>
      <svg class="ds-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <path d="M6 9l6 6 6-6"/>
      </svg>
    </div>

    <div class="ds-section-body" style="padding-bottom:0">

      <div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:4px">
        <button
          v-for="die in DICE"
          :key="die"
          class="ds-die-btn"
          :class="{ active: pending[die] > 0 }"
          :title="`Left-click add ${die}, right-click remove`"
          @click="addDie(die)"
          @contextmenu.prevent="removeDie(die)"
        >
          <component :is="DIE_ICONS[die]" :size="16" />
          <span style="font-family:var(--font-mono);font-size:10px;line-height:1">{{ die === 'd100' ? 'd%' : die }}</span>
          <span
            v-if="pending[die] > 0"
            style="position:absolute;top:-5px;right:-5px;min-width:15px;height:15px;border-radius:50%;background:var(--gold);color:var(--ink);font-family:var(--font-mono);font-size:8px;font-weight:bold;display:flex;align-items:center;justify-content:center;padding:0 2px;line-height:1"
          >{{ pending[die] }}</span>
        </button>
      </div>


      <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
        <span style="font-family:var(--font-zine);font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--ink-mute)">Mod</span>
        <button class="ds-btn tiny ghost" @click="modifier--">−</button>
        <span style="font-family:var(--font-mono);font-size:13px;min-width:24px;text-align:center;color:var(--ink-2)">{{ modifier >= 0 ? '+' + modifier : modifier }}</span>
        <button class="ds-btn tiny ghost" @click="modifier++">+</button>
        <div style="flex:1;min-width:0;font-family:var(--font-mono);font-size:12px;color:var(--ink-soft);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ formula || '—' }}</div>
        <button v-if="hasAnything" class="ds-btn tiny ghost" @click="clear" style="font-size:10px">Clear</button>
        <button class="ds-btn tiny" :disabled="!hasDice" @click="roll">Roll!</button>
      </div>
    </div>


    <button
      v-if="hasUnseen"
      class="ds-new-rolls-bar"
      @click="scrollToTop"
    >↑ New rolls</button>

    <div ref="scrollEl" class="ds-section-body" style="max-height:220px;border-top:1px solid var(--rule);padding-top:8px" @scroll="onScroll">

      <div v-if="!diceStore.rolls.length" style="font-family:var(--font-body);font-style:italic;font-size:13px;color:var(--ink-mute);text-align:center;padding:12px 0">
        No rolls yet
      </div>

      <div
        v-for="entry in diceStore.rolls"
        :key="entry.id"
        class="ds-roll-row"
        :class="{ crit: isCrit(entry), fumble: isFumble(entry) }"
        :style="{ '--roll-color': rollColor(entry.user_id) }"
      >
        <div class="ds-roll-dot" />
        <div>
          <div class="ds-roll-who" :style="{ color: rollColor(entry.user_id) }">{{ gmName(entry.user_id, entry.display_name) }}</div>
          <div class="ds-roll-expr">{{ formatExpr(entry) }}</div>
          <div v-if="entry.label" class="ds-roll-label">{{ entry.label }}</div>
          <div class="ds-roll-when">{{ timeAgo(entry.created_at) }}</div>
        </div>
        <div class="ds-roll-total">{{ entry.total }}</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { DIE_ICONS } from '@/composables/useDiceIcons.js'
import { useDiceStore } from '@/stores/diceStore.js'
import { useGMLabel } from '@/composables/useGMLabel.js'
import { playerColorFor } from '@/composables/usePlayerColor.js'

const diceStore = useDiceStore()
const { gmName } = useGMLabel()

const open = ref(true)

defineExpose({ openSection: () => { open.value = true } })

const DICE = ['d4','d6','d8','d10','d12','d20','d100']
const pending  = ref(Object.fromEntries(DICE.map(d => [d, 0])))
const modifier = ref(0)

const hasDice      = computed(() => DICE.some(d => pending.value[d] > 0))
const hasAnything  = computed(() => hasDice.value || modifier.value !== 0)
const formula      = computed(() => {
  const parts = DICE.filter(d => pending.value[d] > 0).map(d => `${pending.value[d]}${d}`)
  const joined = parts.join('+')
  if (modifier.value > 0) return joined ? `${joined}+${modifier.value}` : `+${modifier.value}`
  if (modifier.value < 0) return joined ? `${joined}−${Math.abs(modifier.value)}` : `${modifier.value}`
  return joined
})

function addDie(die) { pending.value[die]++ }
function removeDie(die) { if (pending.value[die] > 0) pending.value[die]-- }
function clear() { DICE.forEach(d => { pending.value[d] = 0 }); modifier.value = 0 }
function roll() { if (!hasDice.value) return; diceStore.rollDice({ ...pending.value }, modifier.value); clear() }

function formatExpr(entry) {
  const parts = DICE.filter(d => (entry.pending?.[d] ?? 0) > 0).map(d => `${entry.pending[d]}${d}`)
  const joined = parts.join('+')
  if (entry.modifier > 0) return joined ? `${joined}+${entry.modifier}` : `+${entry.modifier}`
  if (entry.modifier < 0) return joined ? `${joined}−${Math.abs(entry.modifier)}` : `${entry.modifier}`
  return joined || '?'
}

function isSingleD20(e) { return (e.pending?.d20 ?? 0) === 1 && DICE.filter(d => d !== 'd20').every(d => (e.pending?.[d] ?? 0) === 0) }
function isCrit(e)   { return isSingleD20(e) && e.results?.some(r => r.die === 'd20' && r.value === 20) }
function isFumble(e) { return isSingleD20(e) && e.results?.some(r => r.die === 'd20' && r.value === 1) }

function rollColor(userId) {
  return playerColorFor(userId)
}

const scrollEl = ref(null)
const isAtTop  = ref(true)
const hasUnseen = ref(false)

function onScroll() {
  isAtTop.value = scrollEl.value?.scrollTop < 80
  if (isAtTop.value) hasUnseen.value = false
}
function scrollToTop() { scrollEl.value?.scrollTo({ top: 0, behavior: 'smooth' }); hasUnseen.value = false }

watch(() => diceStore.rolls[0], (r) => {
  if (!r) return
  if (!isAtTop.value) hasUnseen.value = true
})

const now = ref(Date.now())
let tick = null
onMounted(() => { tick = setInterval(() => { now.value = Date.now() }, 15000) })
onUnmounted(() => clearInterval(tick))

function timeAgo(ts) {
  const diff = now.value - new Date(ts).getTime()
  if (diff < 10000) return 'just now'
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  return `${Math.floor(diff / 3600000)}h ago`
}
</script>
