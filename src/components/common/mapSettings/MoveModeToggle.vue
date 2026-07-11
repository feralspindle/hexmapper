<template>
  <div class="ms-move-row">
    <button :class="['ms-move-btn', modelValue === 'none' ? 'active' : '']" @click="emit('update:modelValue', 'none')">Off</button>
    <button
      v-for="mode in modes"
      :key="mode"
      :class="['ms-move-btn', modelValue === mode ? 'active' : '']"
      @click="emit('update:modelValue', mode)"
    >
      <svg v-if="mode === 'image'" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>
      </svg>
      <svg v-else-if="mode === 'grid'" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z"/>
      </svg>
      {{ mode.charAt(0).toUpperCase() + mode.slice(1) }}
    </button>
  </div>
</template>

<script setup>
defineProps({
  modelValue: { type: String, default: 'none' },
  modes: { type: Array, default: () => ['image'] },
})
const emit = defineEmits(['update:modelValue'])
</script>

<style scoped>
.ms-move-row { display: flex; gap: 4px; }
.ms-move-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 5px 4px;
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: .03em;
  color: var(--ink-mute);
  background: var(--paper-2);
  border: 1px solid var(--rule-strong);
  border-radius: 2px;
  transition: background .15s, color .15s, border-color .15s;
}
.ms-move-btn:hover { color: var(--ink-2); background: var(--paper-3); }
.ms-move-btn.active { background: var(--ink); color: var(--paper); border-color: var(--ink); }
</style>
