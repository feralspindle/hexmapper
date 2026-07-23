<template>
  <div class="hp-control" :class="{ low: max > 0 && (current ?? 0) / max <= .25 }">
    <button title="Damage (shift: 5)" @click="bump(-1, $event)">−</button>
    <input
      v-if="editing"
      ref="editInput"
      class="hp-edit"
      type="number"
      :value="current ?? ''"
      aria-label="Set hit points"
      @keydown.enter.prevent="commit"
      @keydown.esc.prevent="editing = false"
      @blur="commit"
    />
    <button v-else class="hp-value" title="Set exact HP" @click="startEdit">
      <strong>{{ current ?? '—' }}</strong>/{{ max ?? '?' }}
    </button>
    <button title="Heal (shift: 5)" @click="bump(1, $event)">+</button>
  </div>
</template>

<script setup>
import { nextTick, ref } from 'vue'

defineProps({ current: { type: Number, default: null }, max: { type: Number, default: null } })
const emit = defineEmits(['adjust', 'set'])

const editing = ref(false)
const editInput = ref(null)

function bump(direction, event) {
  emit('adjust', direction * (event.shiftKey ? 5 : 1))
}

async function startEdit() {
  editing.value = true
  await nextTick()
  editInput.value?.focus()
  editInput.value?.select()
}

function commit(event) {
  if (!editing.value) return
  editing.value = false
  const value = Number.parseInt(event.target.value, 10)
  if (!Number.isNaN(value)) emit('set', Math.max(0, value))
}
</script>

<style scoped>
.hp-control { display: flex; align-items: center; flex: 0 0 auto; border: 1px solid var(--rule-strong); background: var(--paper); }
.hp-control > button:first-child, .hp-control > button:last-child { width: 24px; height: 25px; border: 0; background: transparent; color: var(--ink-mute); font-size: 15px; }
.hp-control > button:first-child:hover, .hp-control > button:last-child:hover { color: var(--accent); }
.hp-value { min-width: 43px; height: 25px; border: 0; background: transparent; text-align: center; font: 10px var(--font-mono); color: var(--ink-mute); }
.hp-value strong { font-size: 13px; color: var(--ink); }.hp-control.low .hp-value strong { color: #a32727; }
.hp-edit { width: 43px; height: 25px; border: 0; background: var(--paper-2); text-align: center; font: 12px var(--font-mono); color: var(--ink); }
.hp-edit::-webkit-outer-spin-button, .hp-edit::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
.hp-edit { -moz-appearance: textfield; appearance: textfield; }
</style>
