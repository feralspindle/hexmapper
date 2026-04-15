<template>
  <div class="flex flex-col min-h-0 overflow-hidden">

    <div class="px-3 pt-3 pb-2 bg-stone-950/40 shrink-0 ">
      <div class="grid gap-1.5" style="grid-template-columns: repeat(7, 1fr)">
        <button
          v-for="die in DICE"
          :key="die"
          class="relative flex flex-col items-center justify-center py-2 rounded border transition-all select-none active:scale-95"
          :class="pending[die] > 0
            ? 'border-parchment-400 bg-parchment-500/20 text-parchment-200'
            : 'border-stone-700 bg-stone-800 text-stone-400 hover:border-stone-500 hover:text-stone-200'"
          :title="`Left-click to add ${die}, right-click to remove`"
          @click="addDie(die)"
          @contextmenu.prevent="removeDie(die)"
        >
          <i v-if="dieIcon(die)" :class="[dieIcon(die), 'text-base leading-none']" />
          <span v-else class="text-sm font-bold leading-none font-mono">{{ die === 'd100' ? 'd%' : die }}</span>
          <span class="text-xs font-mono mt-0.5 leading-none">{{ die }}</span>
          <span
            v-if="pending[die] > 0"
            class="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 rounded-full bg-parchment-500 text-stone-900 text-[9px] font-bold flex items-center justify-center px-0.5 leading-none"
          >{{ pending[die] }}</span>
        </button>
      </div>
    </div>

    <div class="px-3 pb-3 shrink-0 bg-stone-950/40 space-y-2">

      <div
        class="rounded bg-stone-800 border border-stone-700 px-2 py-1.5 text-xs font-mono min-h-[32px] flex items-center"
        :class="hasDice ? 'text-parchment-200' : 'text-stone-600 italic'"
      >
        {{ formula || 'tap dice to add...' }}
      </div>

      <div class="flex items-center gap-2">
        <span class="text-stone-500 text-xs uppercase tracking-wider shrink-0">Mod</span>
        <div class="flex items-center gap-1">
          <button
            class="w-7 h-7 rounded bg-stone-800 border border-stone-700 text-stone-300 hover:bg-stone-700 hover:text-parchment-200 transition-colors text-sm font-bold flex items-center justify-center select-none"
            @click="modifier--"
          >−</button>
          <span
            class="w-10 text-center text-xs font-mono select-none"
            :class="modifier !== 0 ? 'text-parchment-300' : 'text-stone-500'"
          >{{ modifier >= 0 ? '+' + modifier : modifier }}</span>
          <button
            class="w-7 h-7 rounded bg-stone-800 border border-stone-700 text-stone-300 hover:bg-stone-700 hover:text-parchment-200 transition-colors text-sm font-bold flex items-center justify-center select-none"
            @click="modifier++"
          >+</button>
        </div>
        <div class="ml-auto flex gap-2">
          <button
            v-if="hasAnything"
            class="text-stone-500 hover:text-stone-300 text-xs transition-colors select-none"
            @click="clear"
          >Clear</button>
          <button
            class="px-4 h-8 rounded font-display text-sm transition-all select-none"
            :class="hasDice
              ? 'bg-parchment-500 hover:bg-parchment-400 text-stone-950 active:scale-95'
              : 'bg-stone-800 text-stone-600 cursor-not-allowed border border-stone-700'"
            :disabled="!hasDice"
            @click="roll"
          >Roll!</button>
        </div>
      </div>
    </div>
    <div class="flex-1 overflow-y-auto min-h-0 border-t-2 border-stone-600 bg-stone-950/40">
      <div class="px-2 py-1.5 flex items-center justify-between shrink-0 sticky top-0 bg-stone-900 z-10 border-b border-stone-800">
        <span class="text-stone-400 text-xs uppercase tracking-widest">History</span>
      </div>

      <div v-if="!diceStore.rolls.length" class="px-3 py-4 text-stone-400 text-sm italic text-center">
        No rolls yet
      </div>

      <div
        v-for="(entry, i) in diceStore.rolls"
        :key="entry.id"
        class="mx-2 my-1.5 group"
      >
        <div
          class="rounded border text-xs overflow-hidden relative transition-shadow duration-700"
          :class="[
            i === 0 ? 'border-parchment-400 bg-stone-800/80' : i === 1 ? 'border-parchment-400/30 bg-stone-800/60' : 'border-stone-700 bg-stone-800/40',
            entry.id === glowId ? 'shadow-[0_0_10px_rgba(212,167,75,0.35)]' : '',
          ]"
        >
          <div class="absolute top-1.5 right-2">
            <span class="text-xs text-right truncate max-w-[6rem] block"
              :class="entry.user_id === authStore.user?.id ? 'text-parchment-400' : 'text-stone-400'">
              {{ gmName(entry.user_id, entry.display_name) }}
            </span>
            <span class="block text-stone-400 text-right text-xs max-w-[6rem]">{{ timeAgo(entry.created_at) }}</span>
          </div>
          <div class="px-2 pt-1.5 pb-0.5 pr-28 min-h-[3rem]">
            <div v-if="entry.label" class="text-parchment-400/70 text-xs italic mb-0.5" style="font-family: 'Crimson Text', serif">{{ entry.label }}</div>
            <span class="font-mono text-stone-200 text-sm">{{ formatExpression(entry) }}</span>
          </div>

          <div class="flex items-center justify-between px-2 pb-1.5">
            <div class="flex flex-wrap gap-1 items-center">
              <span
                v-for="(r, ri) in entry.results"
                :key="ri"
                class="inline-flex items-center justify-center min-w-[20px] h-[20px] px-0.5 rounded font-mono text-xs"
                :class="r.die === 'd20' && r.value === 20 ? 'bg-amber-900/60 text-amber-300 font-bold' : r.die === 'd20' && r.value === 1 ? 'bg-red-900/60 text-red-400 font-bold' : 'bg-stone-700 text-stone-200'"
              >{{ r.value }}</span>
              <span v-if="entry.modifier !== 0" class="text-stone-300 font-mono text-xs self-center">
                {{ entry.modifier > 0 ? '+' : '' }}{{ entry.modifier }}
              </span>
              <button
                v-if="annotatingId !== entry.id"
                class="opacity-0 group-hover:opacity-100 text-stone-600 hover:text-parchment-400 transition-all leading-none px-0.5"
                title="Add note"
                @click="startAnnotating(entry.id)"
              ><i class="fa-solid fa-pencil text-[10px]" /></button>
            </div>
            <div class="flex items-center gap-2 shrink-0 ml-2">
              <span v-if="isCrit(entry)" class="text-amber-300 text-xs font-bold tracking-wide">CRIT!</span>
              <span v-else-if="isFumble(entry)" class="text-red-400 text-xs font-bold tracking-wide">FAIL</span>
              <span class="font-bold text-2xl" :class="isCrit(entry) ? 'text-amber-300' : isFumble(entry) ? 'text-red-400' : entry.user_id === authStore.user?.id ? 'text-parchment-300' : 'text-stone-300'">
                {{ entry.total }}
              </span>
            </div>
          </div>
        </div>

        <div
          v-if="diceStore.annotations[entry.id]?.length || annotatingId === entry.id"
          class="ml-3 mt-0.5 space-y-0.5"
        >
          <div
            v-for="ann in diceStore.annotations[entry.id] ?? []"
            :key="ann.id"
            class="flex items-baseline gap-1.5 text-xs leading-snug"
            :class="ann.id?.toString().startsWith('pending-') ? 'opacity-50' : ''"
          >
            <span class="text-stone-600 shrink-0">↳</span>
            <span class="font-display shrink-0" :class="ann.user_id === authStore.user?.id ? 'text-parchment-400' : 'text-stone-400'">{{ gmName(ann.user_id, ann.display_name) }}</span>
            <span class="text-stone-600 shrink-0">·</span>
            <span class="text-stone-400 break-words min-w-0">{{ ann.body }}</span>
          </div>

          <div v-if="annotatingId === entry.id" class="flex items-center gap-1">
            <span class="text-stone-600 shrink-0 text-[10px]">↳</span>
            <input
              :ref="el => { if (el) el.focus() }"
              v-model="annotationDraft"
              type="text"
              placeholder="Add note… (Enter)"
              maxlength="200"
              class="flex-1 min-w-0 bg-stone-800 border border-stone-700 rounded px-2 py-1 text-xs text-stone-100 placeholder-stone-600 focus:outline-none focus:border-parchment-400"
              @keydown.enter.prevent="submitAnnotation(entry.id)"
              @keydown.escape="cancelAnnotation"
            />
            <button
              class="text-parchment-400 hover:text-parchment-200 text-xs transition-colors px-1 shrink-0"
              @click="submitAnnotation(entry.id)"
            ><i class="fa-solid fa-check" /></button>
            <button
              class="text-stone-500 hover:text-stone-300 text-sm transition-colors px-1 shrink-0 leading-none"
              @click="cancelAnnotation"
            >&times;</button>
          </div>
        </div>
      </div>
    </div>

  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useDiceStore } from '@/stores/diceStore.js'
import { useAuthStore } from '@/stores/authStore.js'
import { useGMLabel } from '@/composables/useGMLabel.js'

const diceStore = useDiceStore()
const authStore = useAuthStore()
const { gmName } = useGMLabel()

const DICE = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100']

function dieIcon(die) {
  if (die === 'd20') return 'fa-solid fa-dice-d20'
  if (die === 'd100') return ''
  return 'fa-solid fa-dice-d6'
}

const pending = ref(Object.fromEntries(DICE.map(d => [d, 0])))
const modifier = ref(0)

const hasDice = computed(() => DICE.some(d => pending.value[d] > 0))
const hasAnything = computed(() => hasDice.value || modifier.value !== 0)

const formula = computed(() => {
  const parts = DICE
    .filter(d => pending.value[d] > 0)
    .map(d => `${pending.value[d]}${d}`)
  const joined = parts.join(' + ')
  if (modifier.value > 0) return joined ? `${joined} + ${modifier.value}` : `+${modifier.value}`
  if (modifier.value < 0) return joined ? `${joined} − ${Math.abs(modifier.value)}` : `${modifier.value}`
  return joined
})

function addDie(die) { pending.value[die]++ }
function removeDie(die) { if (pending.value[die] > 0) pending.value[die]-- }

function clear() {
  DICE.forEach(d => { pending.value[d] = 0 })
  modifier.value = 0
}

function roll() {
  if (!hasDice.value) return
  diceStore.rollDice({ ...pending.value }, modifier.value)
  clear()
}


function formatExpression(entry) {
  const parts = DICE
    .filter(d => (entry.pending[d] ?? 0) > 0)
    .map(d => `${entry.pending[d]}${d}`)
  const joined = parts.join('+')
  if (entry.modifier > 0) return joined ? `${joined}+${entry.modifier}` : `+${entry.modifier}`
  if (entry.modifier < 0) return joined ? `${joined}−${Math.abs(entry.modifier)}` : `${entry.modifier}`
  return joined || '?'
}

function isSingleD20(entry) {
  return (entry.pending?.d20 ?? 0) === 1 &&
    DICE.filter(d => d !== 'd20').every(d => (entry.pending?.[d] ?? 0) === 0)
}
function isCrit(entry) {
  return isSingleD20(entry) && entry.results?.some(r => r.die === 'd20' && r.value === 20)
}
function isFumble(entry) {
  return isSingleD20(entry) && entry.results?.some(r => r.die === 'd20' && r.value === 1)
}

const annotatingId    = ref(null)
const annotationDraft = ref('')

function startAnnotating(rollId) {
  annotatingId.value    = rollId
  annotationDraft.value = ''
}

function cancelAnnotation() {
  annotatingId.value    = null
  annotationDraft.value = ''
}

async function submitAnnotation(rollId) {
  const body = annotationDraft.value.trim()
  cancelAnnotation()
  if (body) await diceStore.addAnnotation(rollId, body)
}


const glowId = ref(null)
let glowTimer = null

watch(() => diceStore.rolls[0], (newRoll) => {
  if (!newRoll) return
  clearTimeout(glowTimer)
  glowId.value = newRoll.id
  glowTimer = setTimeout(() => { glowId.value = null }, 5000)
})


const now = ref(Date.now())
let tickInterval = null

onMounted(() => {
  tickInterval = setInterval(() => { now.value = Date.now() }, 10000)
})
onUnmounted(() => {
  clearInterval(tickInterval)
  clearTimeout(glowTimer)
})

function timeAgo(ts) {
  const diff = now.value - new Date(ts).getTime()
  if (diff < 5000)    return 'just now'
  if (diff < 60000)   return `${Math.floor(diff / 1000)}s ago`
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  return `${Math.floor(diff / 3600000)}h ago`
}
</script>
