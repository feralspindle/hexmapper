<template>
  <aside class="ds-right-panel">
    <div class="ds-panel-tabs">
      <button class="ds-panel-tab" :class="{ active: activeTab === 0 }" @click="activeTab = 0">Dice &amp; Chat</button>
      <button v-if="showOracle" class="ds-panel-tab" :class="{ active: activeTab === 1 }" @click="activeTab = 1">Oracle</button>
      <button class="ds-panel-tab" :class="{ active: activeTab === 2 }" @click="activeTab = 2">Inspect &amp; Photos</button>
    </div>

    <div v-show="activeTab === 0" class="ds-tab-pane">
      <DungeonDiceSection ref="diceSectionRef" />
      <LightsSection />
      <DungeonSessionSection />
    </div>

    <div v-if="showOracle" v-show="activeTab === 1" class="ds-tab-pane">
      <OraclePanel />
    </div>

    <div v-show="activeTab === 2" class="ds-tab-pane">
      <DungeonInspector ref="inspectorRef" class="flex-grow" />
      <DungeonPhotosSection />
    </div>
  </aside>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import DungeonInspector      from './DungeonInspector.vue'
import DungeonDiceSection    from './DungeonDiceSection.vue'
import DungeonPhotosSection  from './DungeonPhotosSection.vue'
import DungeonSessionSection from './DungeonSessionSection.vue'
import LightsSection         from '@/components/common/LightsSection.vue'
import OraclePanel           from '@/components/common/OraclePanel.vue'
import { useD }              from '@/stores/dungeonStore.js'
import { useDiceStore }      from '@/stores/diceStore.js'
import { useSessionStore }   from '@/stores/sessionStore.js'

const dungeonStore   = useD()
const diceStore      = useDiceStore()
const sessionStore   = useSessionStore()
const activeTab      = ref(0)
const inspectorRef   = ref(null)
const diceSectionRef = ref(null)
const showOracle     = computed(() => sessionStore.playMode === 'gm_less')

watch(showOracle, (visible) => {
  if (!visible && activeTab.value === 1) activeTab.value = 0
})

watch(() => dungeonStore.selectedElement, (el) => {
  if (!el) return
  activeTab.value = 2
  inspectorRef.value?.openSection()
})

watch(() => diceStore.pendingRoll, (roll) => {
  if (!roll) return
  activeTab.value = 0
  diceSectionRef.value?.openSection()
})
</script>
