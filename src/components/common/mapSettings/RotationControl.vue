<template>
  <div class="ms-rot-row">
    <button class="ms-rot-btn" :title="`Rotate ${what} 90° CCW`" @click="step(-90)">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M3 12a9 9 0 109-9M3 3v4h4"/>
      </svg>
    </button>
    <div style="position:relative;flex:1">
      <input v-model.number="draft" type="number" min="0" max="359" class="ms-rot-input" @change="commit" />
      <span class="ms-rot-unit">°</span>
    </div>
    <button class="ms-rot-btn" :title="`Rotate ${what} 90° CW`" @click="step(90)">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 12a9 9 0 11-9-9M21 3v4h-4"/>
      </svg>
    </button>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  modelValue: { type: Number, default: 0 },
  what: { type: String, default: 'image' },
})
// 'step' asks the parent to persist immediately, 'commit' to debounce.
// wrapping/clamping happens here so both panels stop repeating the math
const emit = defineEmits(['update:modelValue', 'step', 'commit'])

const draft = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

function step(delta) {
  const next = ((props.modelValue + delta) % 360 + 360) % 360
  emit('update:modelValue', next)
  emit('step', next)
}

function commit() {
  const next = Math.max(0, Math.min(359, props.modelValue || 0))
  emit('update:modelValue', next)
  emit('commit', next)
}
</script>

<style scoped>
.ms-rot-row {
  display: flex;
  align-items: center;
  gap: 6px;
}
.ms-rot-btn {
  width: 28px; height: 28px;
  flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  background: var(--paper-2);
  border: 1px solid var(--rule-strong);
  border-radius: 2px;
  color: var(--ink-2);
  transition: background .15s, color .15s;
}
.ms-rot-btn:hover { background: var(--paper-3); color: var(--ink); }
.ms-rot-input {
  width: 100%;
  padding: 4px 24px 4px 8px;
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--ink);
  background: var(--paper-2);
  border: 1px solid var(--rule-strong);
  border-bottom: 2px solid var(--rule-strong);
  border-radius: 2px;
  text-align: center;
  appearance: textfield;
  -moz-appearance: textfield;
}
.ms-rot-input::-webkit-inner-spin-button,
.ms-rot-input::-webkit-outer-spin-button { -webkit-appearance: none; }
.ms-rot-input:focus { outline: none; border-color: var(--accent); }
.ms-rot-unit {
  position: absolute;
  right: 7px; top: 50%;
  transform: translateY(-50%);
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--ink-mute);
  pointer-events: none;
}
</style>
