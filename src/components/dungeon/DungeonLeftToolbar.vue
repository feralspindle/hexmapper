<template>
  <aside class="ds-toolbar" @mouseover="onHover" @mouseleave="onLeave">

    <div class="ds-tool-group">
      <button
        v-for="tool in selectionTools"
        :key="tool.mode"
        class="ds-tool"
        :aria-pressed="dungeonStore.drawMode === tool.mode ? 'true' : 'false'"
        :data-testid="`dungeon-tool-${tool.mode}`"
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
        :data-testid="`dungeon-tool-${tool.mode}`"
        @click="dungeonStore.drawMode = tool.mode"
      >
        <component :is="tool.icon" :size="20" />
        <span class="ds-tool-key">{{ tool.key }}</span>
        <span class="ds-tip">{{ tool.label }}<kbd>{{ tool.key }}</kbd></span>
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
      <button
        class="ds-tool"
        :class="{ disabled: dungeonStore.generating }"
        title="Generate the next room"
        data-testid="dungeon-generate"
        @click="dungeonStore.generateRoom()"
      >
        <component :is="WandIcon" :size="18" />
        <span class="ds-tool-key">G</span>
        <span class="ds-tip">Generate room<kbd>G</kbd></span>
      </button>
    </div>

    <div class="ds-tool-group">
      <span class="ds-tool-label">Party</span>
      <button
        class="ds-tool"
        :aria-pressed="partyVisible ? 'true' : 'false'"
        @click="toggleParty()"
      >
        <component :is="PartyIcon" :size="18" />
        <span class="ds-tip">Party panel</span>
      </button>
      <button
        class="ds-tool"
        :aria-pressed="vaultVisible ? 'true' : 'false'"
        data-testid="dungeon-vault-toggle"
        @click="toggleVault()"
      >
        <component :is="VaultIcon" :size="18" />
        <span class="ds-tip">Party vault</span>
      </button>
    </div>

    <div v-if="sessionStore.isGM" class="ds-tool-group">
      <button
        class="ds-tool"
        :aria-pressed="mapSettingsOpen ? 'true' : 'false'"
        data-testid="dungeon-map-settings"
        @click="emit('map-settings')"
      >
        <component :is="MapImageIcon" :size="18" />
        <span class="ds-tip">Map image &amp; fog settings</span>
      </button>
      <button
        v-if="dungeonStore.fogMode"
        class="ds-tool"
        :aria-pressed="dungeonStore.drawMode === 'fog' ? 'true' : 'false'"
        data-testid="dungeon-tool-fog"
        @click="dungeonStore.drawMode = dungeonStore.drawMode === 'fog' ? 'select' : 'fog'"
      >
        <component :is="FogBrushIcon" :size="18" />
        <span class="ds-tool-key">F</span>
        <span class="ds-tip">Fog brush<kbd>F</kbd></span>
      </button>
    </div>

    <div class="ds-tool-group">
      <button
        class="ds-tool"
        :aria-pressed="!soundEnabled ? 'true' : 'false'"
        @click="toggleSound()"
      >
        <component :is="SoundIcon" :size="18" />
        <span class="ds-tip">{{ soundEnabled ? 'Mute sounds' : 'Unmute sounds' }}</span>
      </button>
    </div>

  </aside>

  <Teleport to="body">
    <div
      v-if="tip.show"
      class="ds-tip ds-tip-portal"
      :style="{ left: tip.x + 'px', top: tip.y + 'px' }"
      v-html="tip.html"
    />
  </Teleport>
</template>

<script setup>
import { h, reactive } from 'vue'
import { useD } from '@/stores/dungeonStore.js'
import { useSessionStore } from '@/stores/sessionStore.js'
import { useConfirmDialog } from '@/composables/useConfirmDialog.js'
import { computed } from 'vue'
import { usePartyNotebook } from '@/composables/usePartyNotebook.js'
import { usePartyPanel } from '@/composables/usePartyPanel.js'
import { soundEnabled, toggleSound } from '@/lib/soundSettings.js'

const dungeonStore = useD()
const sessionStore = useSessionStore()
const { confirm } = useConfirmDialog()
const { visible: inventoryVisible, activeTab: notebookTab, toggle: toggleInventory, open: openNotebook } = usePartyNotebook()
const { visible: partyVisible, toggle: toggleParty } = usePartyPanel()
const vaultVisible = computed(() => inventoryVisible.value && notebookTab.value === 'vault')
function toggleVault() {
  if (vaultVisible.value) { toggleInventory() } else { openNotebook('vault') }
}

defineProps({
  mapSettingsOpen: { type: Boolean, default: false },
})
const emit = defineEmits(['map-settings'])

const CursorIcon  = { render: () => h('svg', { width:20,height:20,viewBox:'0 0 24 24',fill:'currentColor' }, [h('path',{d:'M5 3l5 16 2.5-6.5L19 10z'})]) }
const HandIcon    = { render: () => h('svg', {width:20,height:20,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor','stroke-width':1.6,'stroke-linecap':'round','stroke-linejoin':'round'},[h('path',{d:'M9 11V5.5a1.5 1.5 0 013 0V11'}),h('path',{d:'M12 11V4a1.5 1.5 0 013 0v7'}),h('path',{d:'M15 11V5.5a1.5 1.5 0 013 0V14'}),h('path',{d:'M9 11V8.5a1.5 1.5 0 00-3 0V15c0 3 2 6 6 6h2a4 4 0 004-4v-3'})]) }
const RectIcon    = { render: () => h('svg', {width:20,height:20,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor','stroke-width':1.6,'stroke-linecap':'round'},[h('rect',{x:3,y:5,width:18,height:14})]) }
const CircleIcon  = { render: () => h('svg', {width:20,height:20,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor','stroke-width':1.6},[h('ellipse',{cx:12,cy:12,rx:9,ry:7})]) }
const PolygonIcon = { render: () => h('svg', {width:20,height:20,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor','stroke-width':1.6,'stroke-linecap':'round','stroke-linejoin':'round'},[h('polygon',{points:'12,3 21,9 17,21 7,21 3,9'})]) }
const CorridorIcon= { render: () => h('svg', {width:20,height:20,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor','stroke-width':1.6,'stroke-linecap':'round'},[h('path',{d:'M3 9h18M3 15h18'}),h('path',{d:'M3 9V6M3 18v-3M21 9V6M21 18v-3'})]) }
const DoorIcon    = { render: () => h('svg', {width:20,height:20,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor','stroke-width':1.6,'stroke-linecap':'round','stroke-linejoin':'round'},[h('path',{d:'M5 21V5a2 2 0 012-2h6v18'}),h('path',{d:'M3 21h18'}),h('circle',{cx:11,cy:13,r:.7,fill:'currentColor'})]) }
const WandIcon    = { render: () => h('svg', {width:18,height:18,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor','stroke-width':1.6,'stroke-linecap':'round','stroke-linejoin':'round'},[h('path',{d:'M15 4V2M15 16v-2M8 9h2M20 9h2M17.8 11.8L19 13M17.8 6.2L19 5M3 21l9-9M12.2 6.2L11 5'})]) }
const MoveIcon    = { render: () => h('svg', {width:18,height:18,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor','stroke-width':1.6,'stroke-linecap':'round'},[h('path',{d:'M12 2v20M2 12h20M9 5l3-3 3 3M9 19l3 3 3-3M5 9l-3 3 3 3M19 9l3 3-3 3'})]) }
const TrashIcon   = { render: () => h('svg', {width:18,height:18,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor','stroke-width':1.6,'stroke-linecap':'round','stroke-linejoin':'round'},[h('path',{d:'M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6'})]) }
const UndoIcon    = { render: () => h('svg', {width:18,height:18,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor','stroke-width':1.6,'stroke-linecap':'round','stroke-linejoin':'round'},[h('polyline',{points:'9 14 4 9 9 4'}),h('path',{d:'M20 20v-7a4 4 0 0 0-4-4H4'})]) }
const PartyIcon   = { render: () => h('svg', {width:18,height:18,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor','stroke-width':1.6,'stroke-linecap':'round','stroke-linejoin':'round'},[h('path',{d:'M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2'}),h('circle',{cx:9,cy:7,r:4}),h('path',{d:'M22 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75'})]) }
const VaultIcon   = { render: () => h('svg', {width:18,height:18,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor','stroke-width':1.6,'stroke-linecap':'round','stroke-linejoin':'round'},[h('path',{d:'M3 9h18M3 9V7a1 1 0 011-1h16a1 1 0 011 1v2M3 9v9a1 1 0 001 1h16a1 1 0 001-1V9'}),h('path',{d:'M10 13h4'})]) }
const MapImageIcon = { render: () => h('svg', {width:18,height:18,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor','stroke-width':1.6,'stroke-linecap':'round','stroke-linejoin':'round'},[h('rect',{x:3,y:3,width:18,height:18,rx:2}),h('path',{d:'M3 9l5-5 4 4 4-4 5 5'}),h('circle',{cx:16,cy:15,r:2})]) }
const FogBrushIcon = { render: () => h('svg', {width:18,height:18,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor','stroke-width':1.6,'stroke-linecap':'round','stroke-linejoin':'round'},[h('path',{d:'M20 17.58A5 5 0 0018 8h-1.26A8 8 0 104 15.25'}),h('path',{d:'M8 16h.01M12 19h.01M16 16h.01'})]) }

const SoundIcon   = { render: () => soundEnabled.value
  ? h('svg', {width:18,height:18,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor','stroke-width':1.6,'stroke-linecap':'round','stroke-linejoin':'round'},[h('path',{d:'M11 5L6 9H2v6h4l5 4V5z'}),h('path',{d:'M15.54 8.46a5 5 0 010 7.07'}),h('path',{d:'M19.07 4.93a10 10 0 010 14.14'})])
  : h('svg', {width:18,height:18,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor','stroke-width':1.6,'stroke-linecap':'round','stroke-linejoin':'round'},[h('path',{d:'M11 5L6 9H2v6h4l5 4V5z'}),h('line',{x1:23,y1:9,x2:17,y2:15}),h('line',{x1:17,y1:9,x2:23,y2:15})]) }

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

const tip = reactive({ show: false, x: 0, y: 0, html: '' })
let _lastBtn = null

function onHover(e) {
  const btn = e.target.closest('.ds-tool')
  if (btn === _lastBtn) return
  _lastBtn = btn
  if (!btn) { tip.show = false; return }
  const tipEl = btn.querySelector('.ds-tip')
  if (!tipEl) { tip.show = false; return }
  const rect = btn.getBoundingClientRect()
  tip.x = rect.right + 10
  tip.y = rect.top + rect.height / 2
  tip.html = tipEl.innerHTML
  tip.show = true
}

function onLeave() {
  _lastBtn = null
  tip.show = false
}

function deleteSelected() {
  if (!dungeonStore.selectedElement) return
  const { type, id, roomId } = dungeonStore.selectedElement
  if (type === 'room') confirm('Delete this room?', () => dungeonStore.deleteRoom(id))
  else if (type === 'door') { dungeonStore.removeDoor(roomId, id); dungeonStore.deselect() }
  else dungeonStore.deleteCorridor(id)
}



</script>

