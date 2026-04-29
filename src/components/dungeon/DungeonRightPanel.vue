<template>
  <aside class="ds-right-panel">
    <div class="ds-panel-tabs">
      <button class="ds-panel-tab" :class="{ active: activeTab === 0 }" @click="activeTab = 0">Dice &amp; Chat</button>
      <button class="ds-panel-tab" :class="{ active: activeTab === 1 }" @click="activeTab = 1">Inspect &amp; Photos</button>
    </div>

    <div v-show="activeTab === 0" class="ds-tab-pane">
      <DungeonDiceSection ref="diceSectionRef" />
      <DungeonSessionSection />
    </div>

    <div v-show="activeTab === 1" class="ds-tab-pane">
      <DungeonInspector ref="inspectorRef" class="flex-grow" />
      <DungeonPhotosSection />
    </div>
  </aside>
</template>

<script setup>
import { ref, watch } from 'vue'
import DungeonInspector      from './DungeonInspector.vue'
import DungeonDiceSection    from './DungeonDiceSection.vue'
import DungeonPhotosSection  from './DungeonPhotosSection.vue'
import DungeonSessionSection from './DungeonSessionSection.vue'
import { useD }              from '@/stores/dungeonStore.js'
import { useDiceStore }      from '@/stores/diceStore.js'

const dungeonStore   = useD()
const diceStore      = useDiceStore()
const activeTab      = ref(0)
const inspectorRef   = ref(null)
const diceSectionRef = ref(null)

watch(() => dungeonStore.selectedElement, (el) => {
  if (!el) return
  activeTab.value = 1
  inspectorRef.value?.openSection()
})

watch(() => diceStore.pendingRoll, (roll) => {
  if (!roll) return
  activeTab.value = 0
  diceSectionRef.value?.openSection()
})
</script>
