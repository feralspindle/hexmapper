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

        <Transition name="ds-map-fade">
          <div v-if="dungeonStore.loading" class="ds-map-loading-overlay">
            <svg class="ds-map-spinner" width="52" height="52" viewBox="0 0 52 52" fill="none">
              <polygon
                points="26,3 47.7,15 47.7,37 26,49 4.3,37 4.3,15"
                stroke="#d4a74b"
                stroke-width="2"
                stroke-linejoin="round"
              />
              <polygon
                points="26,13 40.6,21 40.6,37 26,45 11.4,37 11.4,21"
                stroke="#d4a74b"
                stroke-width="1.2"
                stroke-linejoin="round"
                opacity="0.35"
              />
            </svg>
            <span class="ds-map-loading-label">Loading dungeon…</span>
          </div>
        </Transition>

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
        <DiceRollToast />
        <LuckTokenToast />
        <QuestCompleteToast />
        <LootDealToast />
        <ChatToast bottom-class="bottom-20" />
      </div>

      <DungeonRightPanel />
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
import { useDiceStore } from '@/stores/diceStore.js'
import { useChatStore } from '@/stores/chatStore.js'
import { useOracleStore } from '@/stores/oracleStore.js'
import { useCharacterStore } from '@/stores/characterStore.js'
import { useUserPrefsStore } from '@/stores/userPrefsStore.js'
import { useActivityStore } from '@/stores/activityStore.js'
import { usePhotoStore } from '@/stores/photoStore.js'
import { useItemDrag } from '@/composables/useItemDrag.js'
import { activeNavDropdown } from '@/composables/useNavDropdown.js'

import DungeonTopbar           from '@/components/dungeon/DungeonTopbar.vue'
import DungeonLeftToolbar      from '@/components/dungeon/DungeonLeftToolbar.vue'
import DungeonCanvas           from '@/components/dungeon/DungeonCanvas.vue'
import DungeonContentsBar      from '@/components/dungeon/DungeonContentsBar.vue'
import DungeonMapImageSettings from '@/components/dungeon/DungeonMapImageSettings.vue'
import DungeonRightPanel   from '@/components/dungeon/DungeonRightPanel.vue'
import DungeonPartyPanel   from '@/components/dungeon/DungeonPartyPanel.vue'
import PartyNotebook       from '@/components/common/PartyNotebook.vue'

import CharacterDrawer     from '@/components/common/CharacterDrawer.vue'
import ConfirmDialog       from '@/components/common/ConfirmDialog.vue'
import DiceRollToast       from '@/components/dungeon/DiceRollToast.vue'
import LuckTokenToast      from '@/components/common/LuckTokenToast.vue'
import QuestCompleteToast  from '@/components/common/QuestCompleteToast.vue'
import LootDealToast       from '@/components/common/LootDealToast.vue'
import ChatToast           from '@/components/common/ChatToast.vue'
import PhotoBroadcastModal from '@/components/common/PhotoBroadcastModal.vue'

const route     = useRoute()
const sessionId = route.params.sessionId
const dungeonId = route.params.dungeonId

const dungeonStore   = useD()
const sessionStore   = useSessionStore()
const mapStore       = useMapStore()
const diceStore      = useDiceStore()
const chatStore      = useChatStore()
const oracleStore    = useOracleStore()
const characterStore = useCharacterStore()
const prefs          = useUserPrefsStore()
const activityStore  = useActivityStore()
const photoStore     = usePhotoStore()

function syncOracleStore() {
  if (sessionStore.playMode === 'gm_less') {
    oracleStore.init(sessionId)
  } else {
    oracleStore.cleanup()
  }
}

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

  await prefs.load()

  if (!sessionStore.sessionId) {
    await sessionStore.joinSession(sessionId)
  }
  await mapStore.init(sessionId)
  await dungeonStore.init(sessionId, dungeonId)
  diceStore.init(sessionId)
  chatStore.init(sessionId)
  syncOracleStore()
  characterStore.loadAll(sessionId)
  sessionStore.initPresence(sessionId)
  photoStore.init(sessionId)
  activityStore.init(sessionId, dungeonId)
})

watch(() => sessionStore.playMode, syncOracleStore)

onUnmounted(() => {
  window.removeEventListener('resize', measureTopbar)
  window.removeEventListener('keydown', onKeyDown)
  dungeonStore.cleanup()
  activityStore.cleanup()
  mapStore.cleanup()
  characterStore.cleanup()
  chatStore.cleanup()
  oracleStore.cleanup()
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
.ds-map-loading-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: rgba(8, 12, 22, 0.72);
  backdrop-filter: blur(3px);
  z-index: 10;
  gap: 16px;
  pointer-events: none;
}

.ds-map-spinner {
  animation: ds-hex-spin 2.4s linear infinite;
  transform-origin: center;
}

@keyframes ds-hex-spin {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}

.ds-map-loading-label {
  font-family: 'Cinzel', 'Cormorant Garamond', Georgia, serif;
  font-size: 11px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: rgba(212, 167, 75, 0.7);
}

.ds-map-fade-enter-active,
.ds-map-fade-leave-active {
  transition: opacity 0.3s ease;
}
.ds-map-fade-enter-from,
.ds-map-fade-leave-to {
  opacity: 0;
}
</style>
