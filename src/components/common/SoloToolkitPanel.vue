<template>
  <div
    v-if="visible && isSoloOrCoop"
    class="stk-panel"
    data-testid="solo-toolkit-panel"
    :style="{ left: `${pos.x}px`, top: `${pos.y}px`, width: `${size.w}px`, height: `${size.h}px` }"
  >
    <div class="ds-party-head" @mousedown="startDrag">
      <div class="ds-grip">
        <span v-for="i in 6" :key="i" />
      </div>

      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.6"
        stroke-linecap="round"
        stroke-linejoin="round"
        style="color: var(--paper-3); flex: 0 0 auto"
      >
        <path d="M11 4l1.6 4.8a2 2 0 001.3 1.3L18.7 12l-4.8 1.6a2 2 0 00-1.3 1.3L11 19.7l-1.6-4.8a2 2 0 00-1.3-1.3L3.3 12l4.8-1.6a2 2 0 001.3-1.3z" />
        <path d="M19 3v4M17 5h4" />
      </svg>

      <h4>Toolkit</h4>
      <span class="ds-party-meta">GM-less</span>

      <button class="ds-panel-action" data-testid="toolkit-panel-close" @click.stop="close()">
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
          stroke-linecap="round"
        >
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>
    </div>

    <div class="ds-panel-tabs">
      <button class="ds-panel-tab" :class="{ active: tab === 'oracle' }" @click="tab = 'oracle'">Oracle</button>
      <button class="ds-panel-tab" :class="{ active: tab === 'codex' }" @click="tab = 'codex'">Codex</button>
      <button class="ds-panel-tab" :class="{ active: tab === 'trackers' }" @click="tab = 'trackers'">Trackers</button>
    </div>

    <div v-show="tab === 'oracle'" class="ds-tab-pane">
      <OraclePanel />
    </div>

    <div v-show="tab === 'codex'" class="ds-tab-pane">
      <StatBlockPanel />
      <CompendiumPanel />
    </div>

    <div v-show="tab === 'trackers'" class="ds-tab-pane">
      <TravelSection v-if="showTravel" />
      <InitiativeSection />
      <CrawlTracker />
      <LightsSection />
      <ImportKeysSection v-if="sessionStore.isGM" />
    </div>

    <div class="ds-resize-handle" @mousedown.stop="startResize">
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
        <line x1="2" y1="9" x2="9" y2="2"/>
        <line x1="5.5" y1="9" x2="9" y2="5.5"/>
      </svg>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import OraclePanel        from '@/components/common/OraclePanel.vue'
import StatBlockPanel     from '@/components/common/StatBlockPanel.vue'
import CompendiumPanel    from '@/components/common/CompendiumPanel.vue'
import TravelSection      from '@/components/common/TravelSection.vue'
import InitiativeSection  from '@/components/common/InitiativeSection.vue'
import CrawlTracker       from '@/components/common/CrawlTracker.vue'
import LightsSection      from '@/components/common/LightsSection.vue'
import ImportKeysSection  from '@/components/common/ImportKeysSection.vue'
import { useSessionStore } from '@/stores/sessionStore.js'
import { useSoloToolkit }  from '@/composables/useSoloToolkit.js'
import { useFloatingPanel } from '@/composables/useFloatingPanel.js'

defineProps({
  // hex-only travel tracker (solo hexcrawl); dungeons don't travel
  showTravel: { type: Boolean, default: false },
})

const sessionStore = useSessionStore()
const { visible, close } = useSoloToolkit()
const isSoloOrCoop = computed(() => sessionStore.playMode === 'gm_less')

const tab = ref('oracle')

const { pos, size, startDrag, startResize } = useFloatingPanel({
  storagePrefix: 'dm.soloToolkit',
  defaultPos: { x: 120, y: 96 },
  defaultSize: { w: 360, h: 520 },
  maxW: 720,
})
</script>
