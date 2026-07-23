<template>
  <!-- rendered in place, not teleported: the design tokens live on each
       view's root (.dungeon-scribe, HomeView's inline theme) and a teleport
       to body would leave every var() in the card unresolved -->
  <div v-if="state.visible" class="hm-modal-backdrop" @click.self="cancel">
    <div class="hm-modal-card confirm-card" role="alertdialog" aria-modal="true">
      <p>{{ state.message }}</p>
      <div class="confirm-actions">
        <button class="ds-btn ghost" data-testid="confirm-cancel" @click="cancel">Cancel</button>
        <button class="ds-btn" :class="{ danger: state.tone === 'danger' }" data-testid="confirm-accept" @click="accept">
          <i v-if="state.confirmIcon" :class="state.confirmIcon" />
          <span>{{ state.confirmLabel }}</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { watch } from 'vue'
import { useConfirmDialog } from '@/composables/useConfirmDialog.js'

const { state, accept, cancel } = useConfirmDialog()

function onKeydown(event) {
  if (event.key === 'Escape') cancel()
}

watch(
  () => state.visible,
  visible => {
    if (visible) window.addEventListener('keydown', onKeydown)
    else window.removeEventListener('keydown', onKeydown)
  },
)
</script>

<style scoped>
.confirm-card { width: min(360px, calc(100% - 32px)); }
.confirm-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 18px; }
.confirm-actions .ds-btn { display: inline-flex; align-items: center; gap: 6px; }
</style>
