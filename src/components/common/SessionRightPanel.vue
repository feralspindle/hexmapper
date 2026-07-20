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
      <button class="ds-panel-tab" :class="{ active: activeTab === 1 }" @click="activeTab = 1">Inspect &amp; Photos</button>
      <button class="ds-panel-close-mobile" aria-label="Close panel" @click="drawerOpen = false">&times;</button>
    </div>

    <div v-show="activeTab === 0" class="ds-tab-pane">
      <DungeonDiceSection ref="diceSectionRef" />
      <DungeonSessionSection />
    </div>

    <div v-show="activeTab === 1" class="ds-tab-pane">
      <component :is="inspector" ref="inspectorRef" class="flex-grow" />
      <DungeonPhotosSection />
    </div>
  </aside>
</template>

<script setup>
import { ref, watch } from 'vue'
import DungeonDiceSection    from '@/components/common/DungeonDiceSection.vue'
import DungeonPhotosSection  from '@/components/common/DungeonPhotosSection.vue'
import DungeonSessionSection from '@/components/common/DungeonSessionSection.vue'
import { useDiceStore }      from '@/stores/diceStore.js'

const props = defineProps({
  // the surface-specific inspector component (DungeonInspector, HexInspectorSection)
  inspector: { type: Object, required: true },
  // current selection; a truthy value switches to the inspect tab
  selected: { default: null },
})

const diceStore      = useDiceStore()
const activeTab      = ref(0)
const drawerOpen     = ref(false)
const inspectorRef   = ref(null)
const diceSectionRef = ref(null)

watch(() => props.selected, (sel) => {
  if (!sel) return
  activeTab.value = 1
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
