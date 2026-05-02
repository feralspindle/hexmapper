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
        @zoom-in="canvasComp?.zoomIn()"
        @zoom-out="canvasComp?.zoomOut()"
        @zoom-reset="canvasComp?.resetZoom()"
      />

      <div class="ds-canvas-area">
        <DungeonCanvas
          v-if="!dungeonStore.loading && !dungeonStore.loadError"
          ref="canvasComp"
          :dungeon-id="dungeonId"
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

        <div
          v-else
          style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;color:var(--ink-mute);font-family:var(--font-body);font-style:italic;font-size:14px"
        >
          Loading dungeon…
        </div>

        <DungeonContentsBar />

        <ConfirmDialog />
        <DiceRollToast />
        <ChatToast bottom-class="bottom-20" />
      </div>

      <DungeonRightPanel />
    </div>


    <DungeonPartyPanel />


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
import { useRoute, useRouter } from 'vue-router'
import { useD } from '@/stores/dungeonStore.js'
import { useSessionStore } from '@/stores/sessionStore.js'
import { useDiceStore } from '@/stores/diceStore.js'
import { useChatStore } from '@/stores/chatStore.js'
import { useCharacterStore } from '@/stores/characterStore.js'
import { useAuthStore } from '@/stores/authStore.js'
import { useUserPrefsStore } from '@/stores/userPrefsStore.js'
import { useActivityStore } from '@/stores/activityStore.js'
import { usePhotoStore } from '@/stores/photoStore.js'
import { useItemDrag } from '@/composables/useItemDrag.js'
import { activeNavDropdown } from '@/composables/useNavDropdown.js'

import DungeonTopbar       from '@/components/dungeon/DungeonTopbar.vue'
import DungeonLeftToolbar  from '@/components/dungeon/DungeonLeftToolbar.vue'
import DungeonCanvas       from '@/components/dungeon/DungeonCanvas.vue'
import DungeonContentsBar  from '@/components/dungeon/DungeonContentsBar.vue'
import DungeonRightPanel   from '@/components/dungeon/DungeonRightPanel.vue'
import DungeonPartyPanel   from '@/components/dungeon/DungeonPartyPanel.vue'
import CharacterDrawer     from '@/components/common/CharacterDrawer.vue'
import ConfirmDialog       from '@/components/common/ConfirmDialog.vue'
import DiceRollToast       from '@/components/dungeon/DiceRollToast.vue'
import ChatToast           from '@/components/common/ChatToast.vue'
import PhotoBroadcastModal from '@/components/common/PhotoBroadcastModal.vue'

const route     = useRoute()
const router    = useRouter()
const sessionId = route.params.sessionId
const dungeonId = route.params.dungeonId

const dungeonStore   = useD()
const sessionStore   = useSessionStore()
const diceStore      = useDiceStore()
const chatStore      = useChatStore()
const characterStore = useCharacterStore()
const authStore      = useAuthStore()
const prefs          = useUserPrefsStore()
const activityStore  = useActivityStore()
const photoStore     = usePhotoStore()

const canvasComp  = ref(null)
const topbarEl    = ref(null)
const topbarHeight = ref(48)
const charOpen    = ref(false)

watch(charOpen, (val) => {
  if (val) activeNavDropdown.value = 'char-sheet'
  else if (activeNavDropdown.value === 'char-sheet') activeNavDropdown.value = null
})
watch(activeNavDropdown, (val) => {
  if (val !== null && val !== 'char-sheet') charOpen.value = false
})

const { state: itemDrag, updatePosition, endDrag } = useItemDrag()

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
  await dungeonStore.init(sessionId, dungeonId)
  diceStore.init(sessionId)
  chatStore.init(sessionId)
  characterStore.loadAll(sessionId)
  sessionStore.initPresence(sessionId)
  photoStore.init(sessionId)
  activityStore.init(sessionId, dungeonId)
})

onUnmounted(() => {
  window.removeEventListener('resize', measureTopbar)
  window.removeEventListener('keydown', onKeyDown)
  dungeonStore.cleanup()
  characterStore.cleanup()
  chatStore.cleanup()
  sessionStore.cleanupPresence()
})

let dragMoved = false

function onGlobalMouseMove(e) {
  if (itemDrag.active) { dragMoved = true; updatePosition(e.clientX, e.clientY) }
}

function onGlobalMouseUp(e) {
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
