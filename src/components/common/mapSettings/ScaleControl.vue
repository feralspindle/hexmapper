<template>
  <div class="ms-size-row">
    <input v-model.number="draft" type="number" :min="min" :max="max" step="1" class="ms-size-input" @change="save" />
    <span class="ms-size-px">{{ suffix }}</span>
  </div>
  <input v-model.number="draft" type="range" :min="min" :max="max" step="1" class="ms-slider" @input="save" />
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  modelValue: { type: Number, default: 100 },
  min: { type: Number, default: 1 },
  max: { type: Number, default: 1000 },
  suffix: { type: String, default: '%' },
  fallback: { type: Number, default: 100 },
})
const emit = defineEmits(['update:modelValue', 'save'])

const draft = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

function save() {
  const value = Math.max(props.min, Math.min(props.max, props.modelValue || props.fallback))
  emit('update:modelValue', value)
  emit('save', value)
}
</script>

<style scoped>
.ms-size-row {
  display: flex;
  align-items: center;
  gap: 6px;
}
.ms-size-input {
  width: 64px;
  padding: 4px 20px 4px 8px;
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
.ms-size-input::-webkit-inner-spin-button,
.ms-size-input::-webkit-outer-spin-button { -webkit-appearance: none; }
.ms-size-input:focus { outline: none; border-color: var(--accent); }
.ms-size-px {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--ink-mute);
}
.ms-slider {
  display: block;
  width: 100%;
  margin-top: 5px;
  accent-color: var(--ink-2);
}
</style>
