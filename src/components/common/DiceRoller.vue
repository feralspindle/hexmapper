<template>
  <div class="flex flex-col min-h-0 overflow-hidden">

    <div class="px-3 pt-3 pb-2 bg-stone-950/40 shrink-0 ">
      <div class="grid gap-1.5" style="grid-template-columns: repeat(7, 1fr)">
        <button
          v-for="die in DICE"
          :key="die"
          v-tooltip="`Left-click to add a ${die}, right-click to remove one`"
          class="relative flex flex-col items-center justify-center py-2 rounded border transition-all select-none active:scale-95"
          :class="pending[die] > 0
            ? 'border-parchment-400 bg-parchment-500/20 text-parchment-200'
            : 'border-stone-700 bg-stone-800 text-stone-400 hover:border-stone-500 hover:text-stone-200'"
          @click="addDie(die)"
          @contextmenu.prevent="removeDie(die)"
        >
          <component :is="DIE_ICONS[die]" :size="20" />
          <span class="text-xs font-mono mt-0.5 leading-none">{{ die === 'd100' ? 'd%' : die }}</span>
          <span
            v-if="pending[die] > 0"
            class="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 rounded-full bg-parchment-500 text-stone-900 text-[14px] font-bold flex items-center justify-center px-0.5 leading-none"
          >{{ pending[die] }}</span>
        </button>
      </div>
    </div>

    <div class="px-3 pt-1 pb-3 shrink-0 bg-stone-950/40">

      <div class="relative mb-2.5 group/formula">
        <div
          class="font-mono text-base py-2 pr-6 border-b transition-colors duration-150 select-none"
          :class="hasDice ? 'text-parchment-200 border-parchment-500/30' : 'text-stone-600 italic border-stone-700/60'"
        >{{ formula || 'tap dice to add…' }}</div>
        <button
          v-if="hasAnything"
          v-tooltip="'Clear dice and modifier'"
          class="absolute right-0 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center text-stone-600 hover:text-stone-300 transition-colors text-xs select-none"
          @click="clear"
        ><i class="fa-solid fa-trash-can" /></button>
      </div>

      <div class="flex items-center gap-2">
        <div class="flex items-center gap-0.5">
          <button
            v-tooltip.left="'Decrease modifier'"
            class="w-6 h-6 rounded bg-stone-800 border border-stone-700 text-stone-400 hover:text-parchment-200 hover:border-stone-500 transition-colors text-sm flex items-center justify-center select-none"
            @click="modifier--"
          >−</button>
          <span
            v-tooltip="'Flat bonus or penalty added to the roll'"
            class="w-9 text-center text-sm font-mono tabular-nums select-none"
            :class="modifier !== 0 ? 'text-parchment-300' : 'text-stone-600'"
          >{{ modifier >= 0 ? '+' + modifier : modifier }}</span>
          <button
            v-tooltip.right="'Increase modifier'"
            class="w-6 h-6 rounded bg-stone-800 border border-stone-700 text-stone-400 hover:text-parchment-200 hover:border-stone-500 transition-colors text-sm flex items-center justify-center select-none"
            @click="modifier++"
          >+</button>
        </div>
        <span class="text-stone-600 text-[10px] uppercase tracking-widest select-none">mod</span>
        <div class="ml-auto flex items-center gap-1.5">
          <button
            v-if="hasDice && !savingMacro"
            v-tooltip="'Save as named macro'"
            class="w-7 h-7 flex items-center justify-center text-stone-600 hover:text-stone-300 transition-colors select-none"
            @click="startSaveMacro"
          ><i class="fa-solid fa-floppy-disk text-xs" /></button>
          <button
            v-tooltip="hasDice ? 'Roll and broadcast to the table' : 'Select at least one die to roll'"
            class="px-4 h-7 rounded font-display text-sm transition-all select-none"
            :class="hasDice && !diceStore.pendingRoll
              ? 'bg-parchment-500 hover:bg-parchment-400 text-stone-950 active:scale-95'
              : 'bg-stone-800 text-stone-600 cursor-not-allowed border border-stone-700'"
            :disabled="!hasDice || !!diceStore.pendingRoll"
            @click="roll"
          >{{ diceStore.pendingRoll ? 'Rolling…' : 'Roll!' }}</button>
        </div>
      </div>
    </div>

    <div v-if="macroStore.macros.length || savingMacro" class="px-3 pt-2 pb-2 bg-stone-950/40 border-t border-stone-800 shrink-0 space-y-1">
      <div v-if="savingMacro" class="flex items-center gap-1">
        <input
          ref="macroLabelInput"
          v-model="macroLabel"
          type="text"
          placeholder="Macro label…"
          maxlength="40"
          class="flex-1 min-w-0 bg-stone-800 border border-stone-700 rounded px-2 py-1 text-sm text-stone-100 placeholder-stone-600 focus:outline-none focus:border-parchment-400"
          @keydown.enter.prevent="confirmSaveMacro"
          @keydown.escape="cancelSaveMacro"
        />
        <button class="text-parchment-400 hover:text-parchment-200 text-sm px-1 transition-colors" @click="confirmSaveMacro"><i class="fa-solid fa-check" /></button>
        <button class="text-stone-500 hover:text-stone-300 text-sm px-1 transition-colors leading-none" @click="cancelSaveMacro">&times;</button>
      </div>
      <div v-for="macro in macroStore.macros" :key="macro.id" class="flex items-center gap-1 group/macro">
        <button
          class="flex-1 min-w-0 flex items-baseline gap-2 px-2 py-1 rounded bg-stone-800 border border-stone-700 hover:border-stone-500 hover:bg-stone-750 transition-colors text-left select-none"
          :disabled="!!diceStore.pendingRoll"
          @click="fireMacro(macro)"
        >
          <span class="text-parchment-300 text-sm font-display truncate">{{ macro.label }}</span>
          <span class="text-stone-500 text-xs font-mono shrink-0 ml-auto">{{ formatMacroExpr(macro) }}</span>
        </button>
        <button
          class="text-stone-600 hover:text-red-400 text-xs px-1 transition-colors shrink-0"
          @click="macroStore.deleteMacro(macro.id)"
        ><i class="fa-solid fa-trash-can" /></button>
      </div>
    </div>
    <div ref="scrollContainer" class="flex-1 overflow-y-auto min-h-0 border-t-2 border-stone-600 bg-stone-950/40" @scroll="onScroll">
      <div class="sticky top-0 z-10">
        <div class="px-2 py-1.5 flex items-center justify-between bg-stone-900 border-b border-stone-800">
          <span class="text-stone-400 text-sm uppercase tracking-widest">History</span>
        </div>
        <button
          v-if="hasUnseenRolls"
          class="w-full flex items-center justify-center gap-1.5 py-1 bg-amber-500/90 hover:bg-amber-400/90 text-stone-900 text-xs font-semibold uppercase tracking-wider transition-colors"
          @click="scrollToTop"
        >
          <i class="fa-solid fa-arrow-up text-[10px]" />
          New rolls
        </button>
      </div>

      <div v-if="diceStore.pendingRoll" class="mx-2 my-1.5">
        <div class="rounded border border-parchment-400 bg-stone-800/80 text-sm overflow-hidden">
          <div class="px-2 pt-1.5 pb-0.5 min-h-[3rem]">
            <div v-if="diceStore.pendingRoll.label" class="text-parchment-400/70 text-sm italic mb-0.5" style="font-family:'Crimson Text',serif">{{ diceStore.pendingRoll.label }}</div>
            <span class="font-mono text-stone-200 text-sm">{{ formatExpression(diceStore.pendingRoll) }}</span>
          </div>
          <div class="flex items-center justify-between px-2 pb-1.5">
            <div class="flex items-center gap-1.5 text-stone-500 text-xs">
              <i class="fa-solid fa-spinner fa-spin" />
              <span>Rolling…</span>
            </div>
            <span class="inline-flex items-center justify-center rounded-full min-w-[2.75rem] px-3 py-0.5 font-mono font-bold text-xl bg-stone-800 text-stone-600 ring-1 ring-stone-700">—</span>
          </div>
        </div>
      </div>

      <div v-if="!diceStore.rolls.length && !diceStore.pendingRoll" class="px-3 py-4 text-stone-400 text-sm italic text-center">
        No rolls yet
      </div>

      <div
        v-for="(entry, i) in diceStore.rolls"
        :key="entry.id"
        class="mx-2 my-1.5 group"
      >
        <div
          class="rounded border text-sm overflow-hidden relative transition-shadow duration-700"
          :class="[
            i === 0 ? 'border-parchment-400 bg-stone-800/80' : i === 1 ? 'border-parchment-400/30 bg-stone-800/60' : 'border-stone-700 bg-stone-800/40',
            entry.id === glowId ? 'shadow-[0_0_10px_rgba(212,167,75,0.35)]' : '',
          ]"
        >
          <div class="absolute top-1.5 right-2">
            <span class="text-sm text-right truncate max-w-[6rem] block"
              :class="entry.user_id === authStore.user?.id ? 'text-parchment-400' : 'text-stone-400'">
              {{ gmName(entry.user_id, entry.display_name) }}
            </span>
            <span class="block text-stone-400 text-right text-sm max-w-[6rem]">{{ timeAgo(entry.created_at) }}</span>
          </div>
          <div class="px-2 pt-1.5 pb-0.5 pr-28 min-h-[3rem]">
            <div v-if="entry.label" class="text-parchment-300 text-base mb-0.5" style="font-family: 'Crimson Text', serif; font-style: italic; font-weight: 600">{{ entry.label }}</div>
            <span class="font-mono text-stone-400 text-xs">{{ formatExpression(entry) }}</span>
          </div>

          <div class="flex items-center justify-between px-2 pb-1.5">
            <div class="flex flex-wrap gap-1 items-center">
              <span
                v-for="(r, ri) in entry.results"
                :key="ri"
                class="inline-flex items-center justify-center min-w-[20px] h-[20px] px-0.5 rounded font-mono text-sm"
                :class="r.die === 'd20' && r.value === 20 ? 'bg-amber-900/60 text-amber-300 font-bold' : r.die === 'd20' && r.value === 1 ? 'bg-red-900/60 text-red-400 font-bold' : 'bg-stone-700 text-stone-200'"
              >{{ r.value }}</span>
              <span v-if="entry.modifier !== 0" class="text-stone-300 font-mono text-sm self-center">
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
              <span v-if="isCrit(entry)" class="text-amber-300 text-xs font-bold tracking-wide uppercase">Crit</span>
              <span v-else-if="isFumble(entry)" class="text-red-400 text-xs font-bold tracking-wide uppercase">Fail</span>
              <span
                class="inline-flex items-center justify-center rounded-full min-w-[2.75rem] px-3 py-0.5 font-mono font-bold text-xl tabular-nums"
                :class="isCrit(entry) ? 'bg-amber-900/70 text-amber-300 ring-1 ring-amber-400/40' : isFumble(entry) ? 'bg-red-900/70 text-red-400 ring-1 ring-red-400/40' : entry.user_id === authStore.user?.id ? 'bg-parchment-900/50 text-parchment-300 ring-1 ring-parchment-400/30' : 'bg-stone-700 text-stone-300'"
              >{{ entry.total }}</span>
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
            class="flex items-baseline gap-1.5 text-sm leading-snug"
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
              class="flex-1 min-w-0 bg-stone-800 border border-stone-700 rounded px-2 py-1 text-sm text-stone-100 placeholder-stone-600 focus:outline-none focus:border-parchment-400"
              @keydown.enter.prevent="submitAnnotation(entry.id)"
              @keydown.escape="cancelAnnotation"
            />
            <button
              class="text-parchment-400 hover:text-parchment-200 text-sm transition-colors px-1 shrink-0"
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
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { DIE_ICONS } from '@/composables/useDiceIcons.js'
import { useDiceStore } from '@/stores/diceStore.js'
import { useAuthStore } from '@/stores/authStore.js'
import { useMacroStore } from '@/stores/macroStore.js'
import { useGMLabel } from '@/composables/useGMLabel.js'
import { useTimeAgo } from '@/composables/useTimeAgo.js'

const diceStore = useDiceStore()
const authStore = useAuthStore()
const macroStore = useMacroStore()
const { gmName } = useGMLabel()
const { timeAgo } = useTimeAgo()

onMounted(() => macroStore.init())

const DICE = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100']


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

const savingMacro = ref(false)
const macroLabel = ref('')
const macroLabelInput = ref(null)

function startSaveMacro() {
  savingMacro.value = true
  macroLabel.value = ''
  nextTick(() => macroLabelInput.value?.focus())
}

function cancelSaveMacro() {
  savingMacro.value = false
  macroLabel.value = ''
}

async function confirmSaveMacro() {
  const label = macroLabel.value.trim()
  cancelSaveMacro()
  if (label) await macroStore.saveMacro(label, { ...pending.value }, modifier.value)
}

function fireMacro(macro) {
  diceStore.rollDice({ ...macro.pending }, macro.modifier, macro.label)
}

function formatMacroExpr(macro) {
  const parts = DICE.filter(d => (macro.pending[d] ?? 0) > 0).map(d => `${macro.pending[d]}${d}`)
  const joined = parts.join('+')
  if (macro.modifier > 0) return joined ? `${joined}+${macro.modifier}` : `+${macro.modifier}`
  if (macro.modifier < 0) return joined ? `${joined}−${Math.abs(macro.modifier)}` : `${macro.modifier}`
  return joined || '?'
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

const scrollContainer = ref(null)
const isAtTop = ref(true)
const hasUnseenRolls = ref(false)

function onScroll() {
  isAtTop.value = scrollContainer.value.scrollTop < 80
  if (isAtTop.value) hasUnseenRolls.value = false
}

function scrollToTop() {
  scrollContainer.value?.scrollTo({ top: 0, behavior: 'smooth' })
  hasUnseenRolls.value = false
}

watch(() => diceStore.rolls[0], (newRoll) => {
  if (!newRoll) return
  clearTimeout(glowTimer)
  glowId.value = newRoll.id
  glowTimer = setTimeout(() => { glowId.value = null }, 5000)
  if (!isAtTop.value) hasUnseenRolls.value = true
})


onUnmounted(() => {
  clearTimeout(glowTimer)
})
</script>
