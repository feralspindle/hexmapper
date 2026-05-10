<template>
  <aside class="ds-toolbar">

    <div class="ds-tool-group">
      <button
        v-for="tool in selectionTools"
        :key="tool.mode"
        class="ds-tool"
        :aria-pressed="dungeonStore.drawMode === tool.mode ? 'true' : 'false'"
        @click="dungeonStore.drawMode = tool.mode"
      >
        <component :is="tool.icon" :size="20" />
        <span class="ds-tool-key">{{ tool.key }}</span>
        <span class="ds-tip">{{ tool.label }}<kbd>{{ tool.key }}</kbd></span>
      </button>
    </div>


    <div class="ds-tool-group">
      <button
        v-for="tool in drawingTools"
        :key="tool.mode"
        class="ds-tool"
        :aria-pressed="dungeonStore.drawMode === tool.mode ? 'true' : 'false'"
        @click="dungeonStore.drawMode = tool.mode"
      >
        <component :is="tool.icon" :size="20" />
        <span class="ds-tool-key">{{ tool.key }}</span>
        <span class="ds-tip">{{ tool.label }}<kbd>{{ tool.key }}</kbd></span>
      </button>
    </div>

    <div class="ds-tool-group">
      <button class="ds-tool" title="Zoom in (=)" @click="emit('zoom-in')">
        <ZoomInIcon :size="18" />
        <span class="ds-tip">Zoom in<kbd>=</kbd></span>
      </button>
      <button class="ds-tool" title="Zoom out (-)" @click="emit('zoom-out')">
        <ZoomOutIcon :size="18" />
        <span class="ds-tip">Zoom out<kbd>-</kbd></span>
      </button>
      <button class="ds-tool" title="Reset zoom" @click="emit('zoom-reset')" style="font-family:var(--font-mono);font-size:9px;letter-spacing:-.5px">
        1:1
        <span class="ds-tip">Reset zoom</span>
      </button>
    </div>


    <div class="ds-tool-group">
      <button
        class="ds-tool"
        :aria-pressed="dungeonStore.drawMode === 'edit' ? 'true' : 'false'"
        @click="dungeonStore.drawMode = 'edit'"
      >
        <MoveIcon :size="18" />
        <span class="ds-tool-key">E</span>
        <span class="ds-tip">Edit/Move<kbd>E</kbd></span>
      </button>
      <button
        class="ds-tool danger"
        :class="{ disabled: !dungeonStore.selectedElement }"
        title="Delete selected (Del)"
        @click="deleteSelected"
      >
        <TrashIcon :size="18" />
        <span class="ds-tip">Delete<kbd>Del</kbd></span>
      </button>
    </div>

    <div class="ds-tool-group">
      <button
        class="ds-tool"
        :class="{ disabled: !dungeonStore.undoStack.length }"
        title="Undo (Ctrl+Z)"
        @click="dungeonStore.undo()"
      >
        <UndoIcon :size="18" />
        <span class="ds-tip">Undo<kbd>⌘Z</kbd></span>
      </button>
    </div>

    <div class="ds-tool-group">
      <span class="ds-tool-label">Party</span>
      <button
        class="ds-tool"
        :aria-pressed="inventoryVisible ? 'true' : 'false'"
        @click="toggleInventory()"
      >
        <component :is="BagIcon" :size="18" />
        <span class="ds-tip">Party inventory</span>
      </button>
    </div>

  </aside>
</template>

<script setup>
import { h } from 'vue'
import { useD } from '@/stores/dungeonStore.js'
import { useConfirmDialog } from '@/composables/useConfirmDialog.js'
import { useGroupInventory } from '@/composables/useGroupInventory.js'

const dungeonStore = useD()
const { confirm } = useConfirmDialog()
const { visible: inventoryVisible, toggle: toggleInventory } = useGroupInventory()

const emit = defineEmits(['zoom-in', 'zoom-out', 'zoom-reset'])

const CursorIcon  = { render: () => h('svg', { width:20,height:20,viewBox:'0 0 24 24',fill:'currentColor' }, [h('path',{d:'M5 3l5 16 2.5-6.5L19 10z'})]) }
const HandIcon    = { render: () => h('svg', {width:20,height:20,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor','stroke-width':1.6,'stroke-linecap':'round','stroke-linejoin':'round'},[h('path',{d:'M9 11V5.5a1.5 1.5 0 013 0V11'}),h('path',{d:'M12 11V4a1.5 1.5 0 013 0v7'}),h('path',{d:'M15 11V5.5a1.5 1.5 0 013 0V14'}),h('path',{d:'M9 11V8.5a1.5 1.5 0 00-3 0V15c0 3 2 6 6 6h2a4 4 0 004-4v-3'})]) }
const RectIcon    = { render: () => h('svg', {width:20,height:20,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor','stroke-width':1.6,'stroke-linecap':'round'},[h('rect',{x:3,y:5,width:18,height:14})]) }
const CircleIcon  = { render: () => h('svg', {width:20,height:20,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor','stroke-width':1.6},[h('ellipse',{cx:12,cy:12,rx:9,ry:7})]) }
const PolygonIcon = { render: () => h('svg', {width:20,height:20,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor','stroke-width':1.6,'stroke-linecap':'round','stroke-linejoin':'round'},[h('polygon',{points:'12,3 21,9 17,21 7,21 3,9'})]) }
const CorridorIcon= { render: () => h('svg', {width:20,height:20,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor','stroke-width':1.6,'stroke-linecap':'round'},[h('path',{d:'M3 9h18M3 15h18'}),h('path',{d:'M3 9V6M3 18v-3M21 9V6M21 18v-3'})]) }
const DoorIcon    = { render: () => h('svg', {width:20,height:20,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor','stroke-width':1.6,'stroke-linecap':'round','stroke-linejoin':'round'},[h('path',{d:'M5 21V5a2 2 0 012-2h6v18'}),h('path',{d:'M3 21h18'}),h('circle',{cx:11,cy:13,r:.7,fill:'currentColor'})]) }
const ZoomInIcon  = { render: () => h('svg', {width:18,height:18,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor','stroke-width':1.6,'stroke-linecap':'round'},[h('circle',{cx:11,cy:11,r:7}),h('path',{d:'M21 21l-4.3-4.3M11 8v6M8 11h6'})]) }
const ZoomOutIcon = { render: () => h('svg', {width:18,height:18,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor','stroke-width':1.6,'stroke-linecap':'round'},[h('circle',{cx:11,cy:11,r:7}),h('path',{d:'M21 21l-4.3-4.3M8 11h6'})]) }
const MoveIcon    = { render: () => h('svg', {width:18,height:18,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor','stroke-width':1.6,'stroke-linecap':'round'},[h('path',{d:'M12 2v20M2 12h20M9 5l3-3 3 3M9 19l3 3 3-3M5 9l-3 3 3 3M19 9l3 3-3 3'})]) }
const TrashIcon   = { render: () => h('svg', {width:18,height:18,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor','stroke-width':1.6,'stroke-linecap':'round','stroke-linejoin':'round'},[h('path',{d:'M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6'})]) }
const UndoIcon    = { render: () => h('svg', {width:18,height:18,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor','stroke-width':1.6,'stroke-linecap':'round','stroke-linejoin':'round'},[h('polyline',{points:'9 14 4 9 9 4'}),h('path',{d:'M20 20v-7a4 4 0 0 0-4-4H4'})]) }
const BagIcon     = { render: () => h('svg', {width:18,height:18,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor','stroke-width':1.6,'stroke-linecap':'round','stroke-linejoin':'round'},[h('path',{d:'M9 9V7a3 3 0 016 0v2'}),h('rect',{x:4,y:9,width:16,height:12,rx:2})]) }

const selectionTools = [
  { mode: 'select',   icon: CursorIcon,   label: 'Select',   key: 'V' },
  { mode: 'pan',      icon: HandIcon,     label: 'Pan',      key: 'H' },
]
const drawingTools = [
  { mode: 'room',     icon: RectIcon,     label: 'Room',     key: 'R' },
  { mode: 'circle',   icon: CircleIcon,   label: 'Circle',   key: 'O' },
  { mode: 'polygon',  icon: PolygonIcon,  label: 'Polygon',  key: 'W' },
  { mode: 'corridor', icon: CorridorIcon, label: 'Corridor', key: 'C' },
  { mode: 'door',     icon: DoorIcon,     label: 'Door',     key: 'D' },
]

function deleteSelected() {
  if (!dungeonStore.selectedElement) return
  const { type, id, roomId } = dungeonStore.selectedElement
  if (type === 'room') confirm('Delete this room?', () => dungeonStore.deleteRoom(id))
  else if (type === 'door') { dungeonStore.removeDoor(roomId, id); dungeonStore.deselect() }
  else dungeonStore.deleteCorridor(id)
}


</script>
