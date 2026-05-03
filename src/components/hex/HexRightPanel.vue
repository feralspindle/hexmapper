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
      <HexInspectorSection class="flex-grow" />
      <DungeonPhotosSection />
    </div>
  </aside>
</template>

<script setup>
import { ref, watch } from 'vue'
import { useHexStore }  from '@/stores/hexStore.js'
import { useDiceStore } from '@/stores/diceStore.js'
import DungeonDiceSection    from '@/components/dungeon/DungeonDiceSection.vue'
import DungeonPhotosSection  from '@/components/dungeon/DungeonPhotosSection.vue'
import DungeonSessionSection from '@/components/dungeon/DungeonSessionSection.vue'
import HexInspectorSection   from './HexInspectorSection.vue'

const hexStore       = useHexStore()
const diceStore      = useDiceStore()
const activeTab      = ref(0)
const diceSectionRef = ref(null)

watch(() => hexStore.selectedHex, (hex) => {
  if (!hex) return
  activeTab.value = 1
})

watch(() => diceStore.pendingRoll, (roll) => {
  if (!roll) return
  activeTab.value = 0
  diceSectionRef.value?.openSection()
})
</script>
