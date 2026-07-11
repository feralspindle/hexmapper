<template>
  <div
    class="dungeon-scribe"
    :data-density="prefs.density"
    :data-palette="prefs.palette"
    :data-icon-style="prefs.iconStyle"
    :data-panel-layout="prefs.panelLayout"
  >
    <DungeonTopbar
      ref="topbarEl"
      :dungeon-id="dungeonId"
      :char-open="charOpen"
      @toggle-char="charOpen = !charOpen"
    />

    <div class="ds-body">
      <DungeonLeftToolbar
        :map-settings-open="mapSettingsOpen"
        @map-settings="mapSettingsOpen = !mapSettingsOpen"
      />

      <div class="ds-canvas-area" style="position:relative">
        <DungeonCanvas
          v-if="!dungeonStore.loading && !dungeonStore.loadError"
          ref="canvasComp"
          :dungeon-id="dungeonId"
          :map-move-mode="mapMoveMode"
          :image-settings-open="mapSettingsOpen"
          @image-offset-change="onImageOffsetChange"
        />

        <div
          v-else-if="dungeonStore.loadError"
          style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;width:100%;height:100%;color:var(--ink-mute)"
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="color:#c0392b">
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          <span style="font-family:var(--font-body);font-size:13px">Failed to load dungeon</span>
          <button class="ds-btn" @click="dungeonStore.init(sessionId, dungeonId)">Retry</button>
        </div>

        <MapLoadingOverlay :visible="dungeonStore.loading" label="Loading dungeon…" />

        <DungeonMapImageSettings
          v-if="mapSettingsOpen && sessionStore.isGM"
          v-model:move-mode="mapMoveMode"
          @close="mapSettingsOpen = false"
        />

        <div class="hm-zoom" style="top:16px;bottom:auto;left:16px">
          <button class="hm-zoom-btn" title="Zoom in (=)" @click="canvasComp?.zoomIn()">+</button>
          <button class="hm-zoom-btn" title="Reset zoom" style="font-size:9px;letter-spacing:0.02em;font-family:var(--font-mono)" @click="canvasComp?.resetZoom()">1:1</button>
          <button class="hm-zoom-btn" title="Zoom out (-)" @click="canvasComp?.zoomOut()">−</button>
        </div>

        <DungeonContentsBar />

        <ConfirmDialog />
        <SessionToasts chat-bottom-class="bottom-20" />
      </div>

      <SessionRightPanel :inspector="DungeonInspector" :selected="dungeonStore.selectedElement" />
    </div>


    <DungeonPartyPanel />
    <PartyNotebook :session-id="sessionId" />


    <CharacterDrawer parchment :open="charOpen" :nav-height="topbarHeight" @close="charOpen = false" />

    <PhotoBroadcastModal v-if="photoStore.currentBroadcast" />

    <div
      v-if="itemDrag.active"
      class="fixed pointer-events-none z-50 select-none"
      :style="{ left: itemDrag.x + 'px', top: itemDrag.y + 'px', transform: 'translate(-50%, -50%)', color: 'var(--accent-1)' }"
    >
      <i :class="[itemDrag.faClass, 'text-xl']" />
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted, watchEffect } from 'vue'
import { useRoute } from 'vue-router'
import { useD } from '@/stores/dungeonStore.js'
import { useSessionStore } from '@/stores/sessionStore.js'
import { useMapStore } from '@/stores/mapStore.js'
import { useUserPrefsStore } from '@/stores/userPrefsStore.js'
import { useActivityStore } from '@/stores/activityStore.js'
import { usePhotoStore } from '@/stores/photoStore.js'
import { useItemDrag } from '@/composables/useItemDrag.js'
import { useSessionServices } from '@/composables/useSessionServices.js'
import { activeNavDropdown } from '@/composables/useNavDropdown.js'

import DungeonTopbar           from '@/components/dungeon/DungeonTopbar.vue'
import DungeonLeftToolbar      from '@/components/dungeon/DungeonLeftToolbar.vue'
import DungeonCanvas           from '@/components/dungeon/DungeonCanvas.vue'
import DungeonContentsBar      from '@/components/dungeon/DungeonContentsBar.vue'
import DungeonMapImageSettings from '@/components/dungeon/DungeonMapImageSettings.vue'
import SessionRightPanel   from '@/components/common/SessionRightPanel.vue'
import MapLoadingOverlay   from '@/components/common/MapLoadingOverlay.vue'
import DungeonInspector    from '@/components/dungeon/DungeonInspector.vue'
import DungeonPartyPanel   from '@/components/common/DungeonPartyPanel.vue'
import PartyNotebook       from '@/components/common/PartyNotebook.vue'

import CharacterDrawer     from '@/components/common/CharacterDrawer.vue'
import ConfirmDialog       from '@/components/common/ConfirmDialog.vue'
import PhotoBroadcastModal from '@/components/common/PhotoBroadcastModal.vue'
import SessionToasts       from '@/components/common/SessionToasts.vue'

const route     = useRoute()
const sessionId = route.params.sessionId
const dungeonId = route.params.dungeonId

const dungeonStore   = useD()
const sessionStore   = useSessionStore()
const mapStore       = useMapStore()
const prefs          = useUserPrefsStore()
const activityStore  = useActivityStore()
const photoStore     = usePhotoStore()

const { joinSession, initServices, cleanupServices } = useSessionServices(sessionId)

const canvasComp  = ref(null)
const topbarEl    = ref(null)
const topbarHeight = ref(48)
const charOpen    = ref(false)
const mapSettingsOpen = ref(false)
const mapMoveMode     = ref('none')

watch(charOpen, (val) => {
  if (val) activeNavDropdown.value = 'char-sheet'
  else if (activeNavDropdown.value === 'char-sheet') activeNavDropdown.value = null
})
// Image-positioning hijacks left-click to pan the map image; closing the settings
// panel must release it so drawing tools (room/corridor) work again.
watch(mapSettingsOpen, (open) => {
  if (!open) mapMoveMode.value = 'none'
})
watch(activeNavDropdown, (val) => {
  if (val !== null && val !== 'char-sheet') charOpen.value = false
})

const { state: itemDrag, updatePosition, endDrag } = useItemDrag()

async function onImageOffsetChange({ offsetX, offsetY }) {
  dungeonStore.applyDungeonLocalPatch({ mapImageOffsetX: offsetX, mapImageOffsetY: offsetY })
  clearTimeout(_imageOffsetTimer)
  _imageOffsetTimer = setTimeout(() => {
    dungeonStore.updateDungeon({ mapImageOffsetX: offsetX, mapImageOffsetY: offsetY })
  }, 150)
}
let _imageOffsetTimer = null

function measureTopbar() {
  if (topbarEl.value?.$el) topbarHeight.value = topbarEl.value.$el.offsetHeight
}

function onKeyDown(e) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
    const tag = document.activeElement?.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable) return
    e.preventDefault()
    dungeonStore.undo()
  }
}

onMounted(async () => {
  measureTopbar()
  window.addEventListener('resize', measureTopbar)
  window.addEventListener('keydown', onKeyDown)

  await joinSession()
  await mapStore.init(sessionId)
  await dungeonStore.init(sessionId, dungeonId)
  initServices()
  activityStore.init(sessionId, dungeonId)
})

onUnmounted(() => {
  window.removeEventListener('resize', measureTopbar)
  window.removeEventListener('keydown', onKeyDown)
  dungeonStore.cleanup()
  activityStore.cleanup()
  cleanupServices()
  sessionStore.cleanupPresence()
})

let dragMoved = false

function onGlobalMouseMove(e) {
  if (itemDrag.active) { dragMoved = true; updatePosition(e.clientX, e.clientY) }
}

function onGlobalMouseUp() {
  if (!itemDrag.active) return
  const moved = dragMoved
  const drop = endDrag()
  dragMoved = false
  if (drop && canvasComp.value) {
    if (moved) {
      canvasComp.value.dropItem(drop.type, drop.x, drop.y)
    } else {
      canvasComp.value.addToSelectedRoom(drop.type)
    }
  }
}

watchEffect(() => {
  if (itemDrag.active) {
    dragMoved = false
    window.addEventListener('mousemove', onGlobalMouseMove)
    window.addEventListener('mouseup', onGlobalMouseUp)
  } else {
    window.removeEventListener('mousemove', onGlobalMouseMove)
    window.removeEventListener('mouseup', onGlobalMouseUp)
  }
})
</script>

<style scoped>
</style>
