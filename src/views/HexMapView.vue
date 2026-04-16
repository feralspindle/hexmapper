<template>
  <div class="h-screen flex flex-col bg-stone-900 overflow-hidden">
    <AppNav :session-id="sessionId" v-model:char-open="charOpen" />

    <div class="flex flex-1 overflow-hidden">

      <div class="flex-1 relative overflow-hidden">

      <div class="absolute top-0 inset-x-0 h-10 bg-gradient-to-b from-black/60 to-transparent pointer-events-none z-[5]" />

      <div
        v-if="sessionStore.isGM && mapStore.gmMapId === sessionStore.activeMapId"
        class="absolute top-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1.5 bg-stone-900/90 border border-red-700/60 rounded-full px-3 py-1 backdrop-blur"
      >
        <i class="fa-solid fa-tower-broadcast text-red-500 text-xs animate-pulse" />
        <span class="text-xs font-semibold text-red-400 tracking-widest uppercase">Live</span>
      </div>

      <div class="absolute left-3 top-1/2 -translate-y-1/2 z-10 flex flex-col gap-1 bg-stone-900/90 border border-stone-600 rounded-lg p-1.5 backdrop-blur">
        <button
          title="Zoom in (+)"
          class="w-8 h-8 flex items-center justify-center text-stone-300 hover:text-parchment-200 hover:bg-stone-700 rounded transition-colors text-lg font-display leading-none"
          @click="hexGridEl?.zoomIn()"
        >+</button>
        <button
          title="Reset zoom"
          class="w-8 h-8 flex items-center justify-center text-stone-400 hover:text-parchment-200 hover:bg-stone-700 rounded transition-colors text-xs font-mono"
          @click="hexGridEl?.resetZoom()"
        >1:1</button>
        <button
          title="Zoom out (-)"
          class="w-8 h-8 flex items-center justify-center text-stone-300 hover:text-parchment-200 hover:bg-stone-700 rounded transition-colors text-lg font-display leading-none"
          @click="hexGridEl?.zoomOut()"
        >−</button>

        <div class="border-t border-stone-700 my-0.5" />

        <button
          title="Pan mode (drag to scroll the map)"
          :class="[
            'w-8 h-8 flex items-center justify-center rounded transition-colors text-base',
            hexGridEl?.panMode
              ? 'bg-parchment-500 text-stone-900'
              : 'text-stone-300 hover:text-parchment-200 hover:bg-stone-700',
          ]"
          @click="hexGridEl?.togglePanMode()"
        >✥</button>

        <template v-if="sessionStore.isGM && mapStore.gmMode === 'edit'">
          <div class="border-t border-stone-700 my-0.5" />
          <button
            title="Map settings"
            :class="[
              'w-8 h-8 flex items-center justify-center rounded transition-colors text-sm',
              showMapSettings
                ? 'bg-parchment-500 text-stone-900'
                : 'text-stone-300 hover:text-parchment-200 hover:bg-stone-700',
            ]"
            @click="showMapSettings = !showMapSettings"
          >
            <i class="fa-solid fa-map text-xs" />
          </button>
        </template>

        <template v-if="sessionStore.isGM && mapStore.gmMapId !== sessionStore.activeMapId">
          <div class="border-t border-stone-700 my-0.5" />
          <button
            title="Go Live — push this map to players"
            class="w-8 h-8 flex items-center justify-center rounded transition-colors text-sm bg-red-900/60 text-red-400 hover:bg-red-800/80 hover:text-red-200"
            @click="goLive"
          >
            <i class="fa-solid fa-tower-broadcast text-xs" />
          </button>
        </template>

        <template v-if="sessionStore.isGM && mapStore.gmMapId === sessionStore.activeMapId && mapStore.hasDraft">
          <div class="border-t border-stone-700 my-0.5" />
          <button
            title="Push Live — publish your changes to players"
            class="w-8 h-8 flex items-center justify-center rounded transition-colors text-sm bg-amber-900/60 text-amber-400 hover:bg-amber-800/80 hover:text-amber-200"
            @click="pushLive"
          >
            <i class="fa-solid fa-upload text-xs" />
          </button>
        </template>

        <template v-if="sessionStore.isGM && mapStore.gmMapId === sessionStore.activeMapId">
          <div class="border-t border-stone-700 my-0.5" />
          <button
            title="Edit mode — prepare the map before players see it"
            :class="[
              'w-8 h-8 flex items-center justify-center rounded transition-colors text-sm',
              mapStore.gmMode === 'edit'
                ? 'bg-parchment-500 text-stone-900'
                : 'text-stone-400 hover:text-parchment-200 hover:bg-stone-700',
            ]"
            @click="mapStore.gmMode = 'edit'"
          >
            <i class="fa-solid fa-pencil text-xs" />
          </button>
          <button
            title="Live mode — see what players see"
            :class="[
              'w-8 h-8 flex items-center justify-center rounded transition-colors text-sm',
              mapStore.gmMode === 'live'
                ? 'bg-green-700 text-green-100'
                : 'text-stone-400 hover:text-parchment-200 hover:bg-stone-700',
            ]"
            @click="mapStore.gmMode = 'live'"
          >
            <span
              v-if="mapStore.gmMode === 'live'"
              class="w-1.5 h-1.5 rounded-full bg-green-300 animate-pulse"
            />
            <i v-else class="fa-solid fa-eye text-xs" />
          </button>
        </template>
      </div>

      <MapImageSettings
        v-if="showMapSettings && sessionStore.isGM && mapStore.gmMode === 'edit'"
        v-model:move-mode="moveMode"
        @close="showMapSettings = false"
      />

      <HexGrid
        ref="hexGridEl"
        :session-id="sessionId"
        :is-g-m="sessionStore.isGM && mapStore.gmMode === 'edit'"
        :fog-mode="fogMode"
        :image-mode="displayMapType === 'image'"
        :map-image-url="displayImageUrl"
        :map-hex-width="displayMapHexWidth"
        :map-hex-height="displayMapHexHeight"
        :map-image-rotation="displayMapImageRotation"
        :map-grid-rotation="displayMapGridRotation"
        :map-image-offset-x="displayMapImageOffsetX"
        :map-image-offset-y="displayMapImageOffsetY"
        :map-grid-offset-x="displayMapGridOffsetX"
        :map-grid-offset-y="displayMapGridOffsetY"
        :map-fog-reveal-all="displayMapFogRevealAll"
        :move-mode="mapStore.gmMode === 'edit' ? moveMode : 'none'"
        :settings-open="showMapSettings"
        class="absolute inset-0"
        @hex-click="onHexClick"
        @hex-context="onHexContext"
        @image-offset-change="onImageOffsetChange"
        @grid-offset-change="onGridOffsetChange"
      />

      <div
        v-if="fogMode && sessionStore.isGM"
        class="absolute inset-0 pointer-events-none z-[4]"
        style="box-shadow: inset 0 0 0 4px rgba(148,163,184,0.35), inset 0 0 80px rgba(100,116,139,0.18)"
      />

      <HexControls
        v-model:fog-mode="fogMode"
        v-model:marker-color="activeMarkerColor"
        :is-g-m="sessionStore.isGM"
        class="absolute bottom-4 left-1/2 -translate-x-1/2"
      />

      <DiceRollToast />

      <ChatToast />

      <JoinToast />

      </div>

      <RightSidebar context="hex" />
    </div>

    <NewMapModal v-if="mapStore.newMapModalOpen" />
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { useSessionStore } from '@/stores/sessionStore.js'
import { useMapStore } from '@/stores/mapStore.js'
import { useHexStore } from '@/stores/hexStore.js'
import { useDiceStore } from '@/stores/diceStore.js'
import { useCharacterStore } from '@/stores/characterStore.js'
import { useChatStore } from '@/stores/chatStore.js'
import AppNav from '@/components/common/AppNav.vue'
import HexGrid from '@/components/hex/HexGrid.vue'
import HexControls from '@/components/hex/HexControls.vue'
import MapImageSettings from '@/components/hex/MapImageSettings.vue'
import NewMapModal from '@/components/hex/NewMapModal.vue'
import DiceRollToast from '@/components/dungeon/DiceRollToast.vue'
import ChatToast from '@/components/common/ChatToast.vue'
import JoinToast from '@/components/common/JoinToast.vue'
import RightSidebar from '@/components/common/RightSidebar.vue'

const hexGridEl         = ref(null)
const charOpen          = ref(false)
const fogMode           = ref(false)
const activeMarkerColor = ref(null)
const showMapSettings   = ref(false)
const initialized       = ref(false)
const moveMode          = ref('none')

const route = useRoute()
const sessionId = route.params.sessionId

const sessionStore   = useSessionStore()
const mapStore       = useMapStore()
const hexStore       = useHexStore()
const diceStore      = useDiceStore()
const chatStore      = useChatStore()
const characterStore = useCharacterStore()

const displayMapId = computed(() =>
  sessionStore.isGM && mapStore.gmMode === 'edit' && mapStore.gmMapId
    ? mapStore.gmMapId
    : sessionStore.activeMapId
)

const displayMapType           = computed(() => mapStore.gmMode === 'edit' ? mapStore.gmMapType          : mapStore.mapType)
const displayImageUrl          = computed(() => mapStore.gmMode === 'edit' ? mapStore.gmMapImageUrl       : mapStore.activeMapImageUrl)
const displayMapHexWidth       = computed(() => mapStore.gmMode === 'edit' ? mapStore.gmMapHexWidth       : mapStore.mapHexWidth)
const displayMapHexHeight      = computed(() => mapStore.gmMode === 'edit' ? mapStore.gmMapHexHeight      : mapStore.mapHexHeight)
const displayMapImageRotation  = computed(() => mapStore.gmMode === 'edit' ? mapStore.gmMapImageRotation  : mapStore.mapImageRotation)
const displayMapGridRotation   = computed(() => mapStore.gmMode === 'edit' ? mapStore.gmMapGridRotation   : mapStore.mapGridRotation)
const displayMapImageOffsetX   = computed(() => mapStore.gmMode === 'edit' ? mapStore.gmMapImageOffsetX   : mapStore.mapImageOffsetX)
const displayMapImageOffsetY   = computed(() => mapStore.gmMode === 'edit' ? mapStore.gmMapImageOffsetY   : mapStore.mapImageOffsetY)
const displayMapGridOffsetX    = computed(() => mapStore.gmMode === 'edit' ? mapStore.gmMapGridOffsetX    : mapStore.mapGridOffsetX)
const displayMapGridOffsetY    = computed(() => mapStore.gmMode === 'edit' ? mapStore.gmMapGridOffsetY    : mapStore.mapGridOffsetY)
const displayMapFogRevealAll   = computed(() => mapStore.gmMode === 'edit' ? mapStore.gmMapFogRevealAll   : mapStore.mapFogRevealAll)

async function goLive() {
  if (!mapStore.gmMapOffsetLocked) {
    await mapStore.updateActiveMap({ mapOffsetLocked: true })
  }
  await mapStore.setActiveMap(mapStore.gmMapId)
  mapStore.gmMode = 'live'
  showMapSettings.value = false
  moveMode.value = 'none'
  fogMode.value  = false
}

async function pushLive() {
  await mapStore.pushLiveDraft()
}

watch(fogMode, (val) => { if (val) hexStore.deselectHex() })

watch(() => mapStore.maps.length, (newLen, oldLen) => {
  if (initialized.value && oldLen === 0 && newLen > 0 && sessionStore.isGM) {
    showMapSettings.value = true
  }
})

watch(displayMapId, async (newId) => {
  if (newId) {
    moveMode.value = 'none'
    await hexStore.init(sessionId, newId)
  }
})

onMounted(async () => {
  if (!sessionStore.sessionId) {
    await sessionStore.joinSession(sessionId)
  }
  await mapStore.init(sessionId)
  initialized.value = true

  if (mapStore.maps.length === 0) {
    mapStore.newMapModalOpen = true
  } else {
    const startMapId = displayMapId.value
    if (startMapId) await hexStore.init(sessionId, startMapId)
  }

  diceStore.init(sessionId)
  chatStore.init(sessionId)
  characterStore.loadAll(sessionId)
  sessionStore.initPresence(sessionId)
})

onUnmounted(() => {
  hexStore.cleanup()
  characterStore.cleanup()
  chatStore.cleanup()
  mapStore.cleanup()
  sessionStore.cleanup()
})

function onHexClick(q, r) {
  if (fogMode.value && sessionStore.isGM) {
    hexStore.toggleRevealed(q, r)
  } else if (activeMarkerColor.value) {
    hexStore.upsertHex(q, r, { marker_color: activeMarkerColor.value })
    hexStore.selectHex(q, r)
  } else {
    hexStore.selectHex(q, r)
  }
}

function onHexContext(q, r) {
  hexStore.selectHex(q, r)
}

async function onImageOffsetChange(x, y) {
  if (mapStore.gmMapOffsetLocked) return
  await mapStore.updateActiveMap({ mapImageOffsetX: x, mapImageOffsetY: y })
}

async function onGridOffsetChange(x, y) {
  if (mapStore.gmMapOffsetLocked) return
  await mapStore.updateActiveMap({ mapGridOffsetX: x, mapGridOffsetY: y })
}
</script>
