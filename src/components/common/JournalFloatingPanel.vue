<template>
  <div
    v-if="visible && isSoloOrCoop"
    class="journal-window"
    data-testid="journal-panel"
    :style="{ left: `${pos.x}px`, top: `${pos.y}px`, width: `${size.w}px`, height: `${size.h}px` }"
  >
    <div class="ds-party-head" @mousedown="startDrag">
      <div class="ds-grip">
        <span v-for="i in 6" :key="i" />
      </div>
      <i class="fa-solid fa-book-open journal-window-icon" />
      <h4>Journal</h4>
      <span class="ds-party-meta">record of play</span>
      <button class="ds-panel-action" data-testid="journal-panel-close" title="Close journal" @click.stop="close()">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>
    </div>

    <JournalPanel :session-id="sessionId" />

    <div class="ds-resize-handle" @mousedown.stop="startResize">
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
        <line x1="2" y1="9" x2="9" y2="2" />
        <line x1="5.5" y1="9" x2="9" y2="5.5" />
      </svg>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import JournalPanel from '@/components/common/JournalPanel.vue'
import { useSessionStore } from '@/stores/sessionStore.js'
import { useJournalPanel } from '@/composables/useJournalPanel.js'
import { useFloatingPanel } from '@/composables/useFloatingPanel.js'

defineProps({ sessionId: { type: String, required: true } })

const sessionStore = useSessionStore()
const { visible, close } = useJournalPanel()
const isSoloOrCoop = computed(() => sessionStore.playMode === 'gm_less')

const { pos, size, startDrag, startResize } = useFloatingPanel({
  storagePrefix: 'dm.journal',
  defaultPos: { x: 112, y: 88 },
  defaultSize: { w: 560, h: Math.max(500, Math.min(760, window.innerHeight - 128)) },
  minW: 360,
  maxW: 900,
  minH: 360,
})
</script>

<style scoped>
.journal-window {
  position: fixed;
  z-index: 92;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--paper);
  border: 1px solid var(--ink);
  box-shadow: 0 1px 0 rgba(255, 255, 255, 0.5) inset, 0 0 0 1px var(--paper-2) inset, 0 16px 40px rgba(0, 0, 0, 0.38);
}

.journal-window-icon {
  flex: 0 0 auto;
  color: var(--paper-3);
  font-size: 13px;
}

.journal-window :deep(.journal) {
  flex: 1;
  min-height: 0;
}

@media (max-width: 700px) {
  .journal-window {
    left: 8px !important;
    top: 56px !important;
    width: calc(100vw - 16px) !important;
    height: calc(100dvh - 64px) !important;
  }
}
</style>
