<template>
  <div class="flex items-center gap-1 bg-stone-900/90 border border-stone-600 rounded-lg px-2.5 py-1.5 backdrop-blur">
    <span class="text-stone-400 text-xs uppercase tracking-widest shrink-0 mr-1 font-display">Contents</span>
    <div class="w-px h-5 bg-stone-700 mx-1 shrink-0" />
    <button
      v-for="item in ROOM_ITEM_TYPES"
      :key="item.type"
      :title="`${item.label} (drag into room or click to add to selected room)`"
      :class="[
        'w-8 h-8 rounded flex items-center justify-center transition-colors select-none',
        'text-stone-300 hover:text-parchment-200 hover:bg-stone-700 cursor-grab active:cursor-grabbing',
      ]"
      @mousedown.prevent="onMouseDown($event, item)"
      @click="onClick(item.type)"
    >
      <i :class="item.faClass" />
    </button>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useD } from '@/stores/dungeonStore.js'
import { ROOM_ITEM_TYPES } from '@/lib/roomItems.js'
import { useItemDrag } from '@/composables/useItemDrag.js'

const dungeonStore = useD()
const { startDrag } = useItemDrag()

const selectedRoomId = computed(() =>
  dungeonStore.selectedElement?.type === 'room' ? dungeonStore.selectedElement.id : null
)

function onClick(type) {
  if (!selectedRoomId.value) return
  dungeonStore.addRoomItem(selectedRoomId.value, type)
}

function onMouseDown(e, item) {
  startDrag(item.type, item.faClass, e.clientX, e.clientY)
}
</script>
