<template>
  <div class="ms-panel" :class="panelClass">
    <div class="ms-header">
      <span class="ms-title">{{ title }}</span>
      <button class="ms-close" :data-testid="closeTestid" title="Close" @click="emit('close')">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <path d="M1 1l10 10M11 1L1 11"/>
        </svg>
      </button>
    </div>
    <slot />
  </div>
</template>

<script setup>
defineProps({
  title: { type: String, default: 'Map Settings' },
  // e2e hooks: the hex panel is located by .map-settings-panel, close buttons by testid
  panelClass: { type: String, default: '' },
  closeTestid: { type: String, default: 'map-settings-close' },
})
const emit = defineEmits(['close'])
</script>

<style scoped>
.ms-panel {
  position: absolute;
  left: 72px;
  top: 50%;
  transform: translateY(-50%);
  z-index: 20;
  width: 272px;
  background: var(--paper, #ede1c7);
  border: 1px solid var(--rule-strong, rgba(58,46,34,.35));
  border-radius: 3px;
  box-shadow: 0 6px 24px rgba(26,20,16,0.22), 0 1px 4px rgba(26,20,16,0.12);
  max-height: 90vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

.ms-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px 8px;
  border-bottom: 1px solid var(--rule-strong, rgba(58,46,34,.3));
  flex-shrink: 0;
}

.ms-title {
  font-family: var(--font-display);
  font-size: 12px;
  letter-spacing: .1em;
  text-transform: uppercase;
  color: var(--ink-2);
}

.ms-close {
  width: 22px; height: 22px;
  display: flex; align-items: center; justify-content: center;
  color: var(--ink-mute);
  border-radius: 2px;
  transition: color .15s, background .15s;
}
.ms-close:hover { color: var(--ink); background: rgba(26,20,16,.08); }
</style>
