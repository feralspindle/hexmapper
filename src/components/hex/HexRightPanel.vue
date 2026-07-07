<template>
  <aside class="ds-right-panel">
    <div class="ds-panel-tabs">
      <button class="ds-panel-tab" :class="{ active: activeTab === 0 }" @click="activeTab = 0">Dice &amp; Chat</button>
      <button v-if="showOracle" class="ds-panel-tab" :class="{ active: activeTab === 1 }" @click="activeTab = 1">Oracle</button>
      <button class="ds-panel-tab" :class="{ active: activeTab === 2 }" @click="activeTab = 2">Inspect &amp; Photos</button>
    </div>

    <div v-show="activeTab === 0" class="ds-tab-pane">
      <DungeonDiceSection ref="diceSectionRef" />
      <InitiativeSection />
      <DungeonSessionSection />
    </div>

    <div v-if="showOracle" v-show="activeTab === 1" class="ds-tab-pane">
      <OraclePanel />
    </div>

    <div v-show="activeTab === 2" class="ds-tab-pane">
      <HexInspectorSection class="flex-grow" />
      <DungeonPhotosSection />
    </div>
  </aside>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useHexStore }  from '@/stores/hexStore.js'
import { useDiceStore } from '@/stores/diceStore.js'
import { useSessionStore } from '@/stores/sessionStore.js'
import DungeonDiceSection    from '@/components/dungeon/DungeonDiceSection.vue'
import InitiativeSection     from '@/components/common/InitiativeSection.vue'
import DungeonPhotosSection  from '@/components/dungeon/DungeonPhotosSection.vue'
import DungeonSessionSection from '@/components/dungeon/DungeonSessionSection.vue'
import HexInspectorSection   from './HexInspectorSection.vue'
import OraclePanel           from '@/components/common/OraclePanel.vue'

const hexStore       = useHexStore()
const diceStore      = useDiceStore()
const sessionStore   = useSessionStore()
const activeTab      = ref(0)
const diceSectionRef = ref(null)
const showOracle     = computed(() => sessionStore.playMode === 'gm_less')

watch(showOracle, (visible) => {
  if (!visible && activeTab.value === 1) activeTab.value = 0
})

watch(() => hexStore.selectedHex, (hex) => {
  if (!hex) return
  activeTab.value = 2
})

watch(() => diceStore.pendingRoll, (roll) => {
  if (!roll) return
  activeTab.value = 0
  diceSectionRef.value?.openSection()
})
</script>
