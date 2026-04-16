<template>
  <div class="w-72 bg-stone-900 border-l border-stone-700 flex flex-col overflow-hidden shrink-0 shadow-[-8px_0_24px_rgba(0,0,0,0.7)]">

    <div class="flex shrink-0 border-b border-stone-700">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        class="relative flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-display uppercase tracking-wider transition-colors"
        :class="activeTab === tab.id
          ? 'text-parchment-200 border-b-2 border-parchment-400 -mb-px bg-stone-900'
          : 'text-stone-500 hover:text-stone-300 border-b-2 border-transparent -mb-px'"
        @click="activeTab = tab.id"
      >
        <i :class="tab.icon" />
        {{ tab.label }}
        <span
          v-if="tab.id === 'info' && hasSelection && activeTab !== 'info'"
          class="w-1.5 h-1.5 rounded-full bg-parchment-400"
        />
      </button>
    </div>

    <div v-show="activeTab === 'dice'" class="flex-1 min-h-0 flex flex-col overflow-hidden">
      <DiceRoller class="flex-1 min-h-0" />
      <ChatPanel class="h-52 shrink-0 border-t-2 border-stone-600 bg-stone-950/40 shadow-[0_-12px_28px_rgba(0,0,0,0.85)]" />
    </div>

    <div v-show="activeTab === 'info'" class="flex-1 min-h-0 flex flex-col overflow-hidden">
      <AnnotationPanel
        v-if="hasSelection"
        :context="context"
        class="flex-1 min-h-0"
        @close="handleClose"
      />
      <div v-else class="flex-1 flex flex-col items-center justify-center gap-2 text-stone-600 px-6 text-center">
        <i class="fa-solid fa-arrow-pointer text-2xl" />
        <span class="text-sm">
          {{ context === 'hex'
            ? 'Click a hex on the map to see its details'
            : 'Select a room or corridor to see its details' }}
        </span>
      </div>
    </div>

    <div v-if="sessionStore.isGM" v-show="activeTab === 'photos'" class="flex-1 min-h-0 overflow-hidden">
      <ReferencePhotoManager class="h-full" />
    </div>

  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { useHexStore } from '@/stores/hexStore.js'
import { useD } from '@/stores/dungeonStore.js'
import { useSessionStore } from '@/stores/sessionStore.js'
import DiceRoller from './DiceRoller.vue'
import ChatPanel from './ChatPanel.vue'
import AnnotationPanel from './AnnotationPanel.vue'
import ReferencePhotoManager from './ReferencePhotoManager.vue'

const props = defineProps({
  context: { type: String, required: true },
})

const hexStore     = useHexStore()
const dungeonStore = useD()
const sessionStore = useSessionStore()

const tabs = computed(() => [
  { id: 'dice',   label: 'Dice',   icon: 'fa-solid fa-dice' },
  { id: 'info',   label: 'Info',   icon: 'fa-solid fa-circle-info' },
  ...(sessionStore.isGM ? [{ id: 'photos', label: 'Photos', icon: 'fa-solid fa-images' }] : []),
])

const activeTab = ref('dice')

const hasSelection = computed(() =>
  props.context === 'hex'
    ? !!hexStore.selectedHex
    : !!dungeonStore.selectedElement
)
watch(hasSelection, (val) => {
  activeTab.value = val ? 'info' : 'dice'
})

function handleClose() {
  if (props.context === 'hex') hexStore.deselectHex()
  else dungeonStore.deselect()
}
</script>
