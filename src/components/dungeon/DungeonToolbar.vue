<template>
  <div class="flex flex-col items-center gap-1 bg-stone-900/90 border border-stone-600 rounded-lg p-1.5 backdrop-blur">
    <button
      v-for="tool in tools"
      :key="tool.mode"
      :title="tool.label"
      :class="[
        'w-8 h-8 rounded flex items-center justify-center transition-colors',
        dungeonStore.drawMode === tool.mode
          ? 'bg-parchment-500 text-stone-900'
          : 'text-stone-300 hover:text-parchment-200 hover:bg-stone-700',
      ]"
      @click="dungeonStore.drawMode = tool.mode"
    >
      <i :class="[tool.icon, 'text-sm']" />
    </button>

    <div class="border-t border-stone-700 my-0.5 self-stretch" />


    <button
      title="Zoom in (=)"
      class="w-8 h-8 rounded flex items-center justify-center text-stone-300 hover:text-parchment-200 hover:bg-stone-700 transition-colors"
      @click="props.canvas?.zoomIn()"
    ><i class="fa-solid fa-magnifying-glass-plus text-sm" /></button>
    <button
      title="Zoom out (-)"
      class="w-8 h-8 rounded flex items-center justify-center text-stone-300 hover:text-parchment-200 hover:bg-stone-700 transition-colors"
      @click="props.canvas?.zoomOut()"
    ><i class="fa-solid fa-magnifying-glass-minus text-sm" /></button>
    <button
      title="Reset zoom"
      class="w-8 h-8 rounded flex items-center justify-center text-stone-300 hover:text-parchment-200 hover:bg-stone-700 transition-colors font-mono"
      style="font-size: 9px; letter-spacing: -0.5px"
      @click="props.canvas?.resetZoom()"
    >1:1</button>

    <div v-if="dungeonStore.selectedElement" class="border-t border-stone-700 my-0.5 self-stretch" />


    <button
      v-if="dungeonStore.selectedElement"
      title="Delete selected (Del)"
      class="w-8 h-8 rounded flex items-center justify-center text-red-500 hover:bg-red-950/60 transition-colors"
      @click="deleteSelected"
    >
      <i class="fa-solid fa-trash text-sm" />
    </button>

    <div v-if="dungeonStore.selectedElement?.type === 'room'" class="flex flex-col gap-1">
      <div class="border-t border-stone-700 my-0.5 self-stretch" />
      <p class="text-stone-400 text-sm text-center uppercase tracking-widest">Fill</p>
      <div class="grid grid-cols-2 gap-1">
        <button
          v-for="color in roomColors"
          :key="color"
          class="w-4 h-4 rounded border border-stone-600 hover:scale-110 transition-transform"
          :style="{ backgroundColor: color }"
          @click="setRoomColor(color)"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { useD } from '@/stores/dungeonStore.js'
import { useConfirmDialog } from '@/composables/useConfirmDialog.js'

const props = defineProps({ canvas: Object })

const dungeonStore = useD()
const { confirm } = useConfirmDialog()

const tools = [
  { mode: 'select',   icon: 'fa-solid fa-crosshairs',              label: 'Select (S)' },
  { mode: 'pan',      icon: 'fa-solid fa-hand',                  label: 'Pan (P)' },
  { mode: 'edit',     icon: 'fa-solid fa-up-down-left-right',    label: 'Edit Room (E)' },
  { mode: 'room',     icon: 'fa-solid fa-square',                 label: 'Draw Room (R)' },
  { mode: 'circle',   icon: 'fa-solid fa-circle',                label: 'Draw Circle Room (O)' },
  { mode: 'corridor', icon: 'fa-solid fa-minus',                 label: 'Draw Corridor (C)' },
  { mode: 'door',     icon: 'fa-solid fa-door-open',             label: 'Place Door (D)' },
  { mode: 'polygon',  icon: 'fa-solid fa-draw-polygon',           label: 'Draw Polygon Room (W)' },
]

const roomColors = [
  '#ffffff',
  '#dddddd',
  '#bbbbbb',
  '#999999',
  '#ccddcc',
  '#ccccdd',
  '#ddcccc',
  '#ddddcc',
]

function deleteSelected() {
  if (!dungeonStore.selectedElement) return
  const { type, id } = dungeonStore.selectedElement
  if (type === 'room') {
    confirm('Delete this room?', () => dungeonStore.deleteRoom(id))
  } else {
    dungeonStore.deleteCorridor(id)
  }
}

function setRoomColor(color) {
  if (dungeonStore.selectedElement?.type !== 'room') return
  dungeonStore.updateRoom(dungeonStore.selectedElement.id, { color })
}
</script>
