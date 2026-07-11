<template>
  <button
    class="ds-panel-fab"
    aria-label="Open session panel"
    @click="drawerOpen = true"
  >
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <rect x="3" y="4" width="18" height="16" rx="1.5" />
      <line x1="15" y1="4" x2="15" y2="20" />
    </svg>
  </button>

  <button
    v-if="drawerOpen"
    class="ds-panel-scrim"
    aria-label="Close session panel"
    @click="drawerOpen = false"
  />

  <aside class="ds-right-panel" :class="{ 'is-open': drawerOpen }">
    <div class="ds-panel-tabs">
      <button class="ds-panel-tab" :class="{ active: activeTab === 0 }" @click="activeTab = 0">Dice &amp; Chat</button>
      <button v-if="isSoloOrCoop" class="ds-panel-tab" :class="{ active: activeTab === 1 }" @click="activeTab = 1">Oracle</button>
      <button class="ds-panel-tab" :class="{ active: activeTab === 2 }" @click="activeTab = 2">Inspect &amp; Photos</button>
      <button class="ds-panel-close-mobile" aria-label="Close panel" @click="drawerOpen = false">&times;</button>
    </div>

    <div v-show="activeTab === 0" class="ds-tab-pane">
      <DungeonDiceSection ref="diceSectionRef" />
      <TravelSection v-if="showTravel && isSoloOrCoop" />
      <InitiativeSection v-if="isSoloOrCoop" />
      <CrawlTracker v-if="isSoloOrCoop" />
      <LightsSection v-if="isSoloOrCoop" />
      <DungeonSessionSection />
    </div>

    <div v-if="isSoloOrCoop" v-show="activeTab === 1" class="ds-tab-pane">
      <OraclePanel />
    </div>

    <div v-show="activeTab === 2" class="ds-tab-pane">
      <component :is="inspector" ref="inspectorRef" class="flex-grow" />
      <DungeonPhotosSection />
    </div>
  </aside>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import DungeonDiceSection    from '@/components/common/DungeonDiceSection.vue'
import DungeonPhotosSection  from '@/components/common/DungeonPhotosSection.vue'
import DungeonSessionSection from '@/components/common/DungeonSessionSection.vue'
import TravelSection         from '@/components/common/TravelSection.vue'
import InitiativeSection     from '@/components/common/InitiativeSection.vue'
import CrawlTracker          from '@/components/common/CrawlTracker.vue'
import LightsSection         from '@/components/common/LightsSection.vue'
import OraclePanel           from '@/components/common/OraclePanel.vue'
import { useDiceStore }      from '@/stores/diceStore.js'
import { useSessionStore }   from '@/stores/sessionStore.js'

const props = defineProps({
  // the surface-specific inspector component (DungeonInspector, HexInspectorSection)
  inspector: { type: Object, required: true },
  // current selection; a truthy value switches to the inspect tab
  selected: { default: null },
  // hex-only travel section (solo hexcrawl); dungeons don't travel
  showTravel: { type: Boolean, default: false },
})

const diceStore      = useDiceStore()
const sessionStore   = useSessionStore()
const activeTab      = ref(0)
const drawerOpen     = ref(false)
const inspectorRef   = ref(null)
const diceSectionRef = ref(null)
const isSoloOrCoop   = computed(() => sessionStore.playMode === 'gm_less')

watch(isSoloOrCoop, (visible) => {
  if (!visible && activeTab.value === 1) activeTab.value = 0
})

watch(() => props.selected, (sel) => {
  if (!sel) return
  activeTab.value = 2
  drawerOpen.value = true
  inspectorRef.value?.openSection?.()
})

watch(() => diceStore.pendingRoll, (roll) => {
  if (!roll) return
  activeTab.value = 0
  drawerOpen.value = true
  diceSectionRef.value?.openSection?.()
})
</script>
