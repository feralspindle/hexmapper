<template>
  <div class="h-screen flex flex-col bg-stone-950 overflow-hidden">
    <!-- Nav -->
    <div
      ref="navEl"
      class="flex items-center gap-3 px-4 py-2 bg-stone-900 border-b border-stone-700 shrink-0 relative z-50"
    >
      <button
        @click="goBack"
        class="flex items-center gap-1.5 text-xs px-2 py-1 rounded transition-colors text-parchment-400 hover:text-parchment-200 hover:bg-stone-800"
      >
        <i class="fa-solid fa-arrow-left" />
        <span class="hidden sm:inline">Map</span>
      </button>
      <span class="text-stone-600">|</span>
      <span class="text-parchment-200 font-display text-sm">
        {{ dungeonStore.dungeon?.name ?? 'Loading...' }}
      </span>

      <div v-if="onlineOthers.length" class="flex items-center gap-1.5">
        <div
          v-for="viewer in onlineOthers"
          :key="viewer.user_id ?? viewer._clientId"
          class="relative group"
        >
          <img
            v-if="viewer.avatar_url"
            :src="viewer.avatar_url"
            :alt="viewer.display_name"
            class="w-6 h-6 rounded-full border-2 border-stone-600 transition-transform group-hover:scale-110"
          />
          <div
            v-else
            class="w-6 h-6 rounded-full border-2 border-stone-600 flex items-center justify-center text-white text-xs font-display transition-transform group-hover:scale-110"
            :class="viewerColor(viewer.user_id ?? viewer._clientId)"
          >{{ viewer.display_name?.charAt(0)?.toUpperCase() }}</div>
          <div class="absolute top-full left-1/2 -translate-x-1/2 mt-1.5 px-2 py-1 bg-stone-900 border border-stone-700 rounded text-xs text-stone-200 whitespace-nowrap pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity z-50">
            {{ viewer.display_name }}
          </div>
        </div>
      </div>

      <div class="ml-auto flex items-center gap-3">
        <CharacterPicker />

        <button
          class="flex items-center gap-1.5 text-xs transition-colors px-2 py-1 rounded"
          :class="charOpen
            ? 'text-stone-900 bg-parchment-400'
            : 'text-parchment-400 hover:text-parchment-200 hover:bg-stone-800'"
          :title="charOpen ? 'Close character sheet' : 'Character sheet'"
          @click="charOpen = !charOpen"
        >
          <i :class="charOpen ? 'fa-solid fa-xmark' : 'fa-solid fa-user'" />
          <span class="hidden sm:inline">{{ charOpen ? 'Close Character Sheet' : 'Character Sheet' }}</span>
        </button>

        <TorchTimer :dungeon-id="dungeonId" />
        <ShareModal :session-id="sessionId" />
        <BugReportButton />

        <template v-if="authStore.isAuthenticated">
          <div class="flex items-center gap-2 pl-2 border-l border-stone-700">
            <img
              v-if="authStore.avatarUrl && !avatarError"
              :src="authStore.avatarUrl"
              :alt="authStore.displayName"
              class="w-6 h-6 rounded-full border border-stone-600"
              @error="avatarError = true"
            />
            <div
              v-else
              class="w-6 h-6 rounded-full bg-indigo-700 flex items-center justify-center text-white text-xs font-display shrink-0"
            >
              {{ authStore.displayName?.charAt(0)?.toUpperCase() }}
            </div>
            <span class="text-stone-300 text-xs truncate max-w-28">{{ authStore.displayName }}</span>
            <button
              class="text-stone-500 hover:text-stone-300 text-xs transition-colors"
              title="Sign out"
              @click="authStore.signOut()"
            >&times;</button>
          </div>
        </template>
      </div>
    </div>
    <CharacterDrawer :open="charOpen" :nav-height="navHeight" @close="charOpen = false" />

    <div class="flex flex-1 overflow-hidden">
      <div class="flex-1 relative overflow-hidden">
        <div class="absolute top-0 inset-x-0 h-10 bg-gradient-to-b from-black/60 to-transparent pointer-events-none z-[5]" />
        <DungeonToolbar class="absolute left-4 top-4 z-10" :canvas="canvasComp" />

        <DungeonCanvas
          v-if="!dungeonStore.loading && !dungeonStore.loadError"
          ref="canvasComp"
          :dungeon-id="dungeonId"
          class="w-full h-full"
        />
        <div v-else-if="dungeonStore.loadError" class="w-full h-full flex flex-col items-center justify-center gap-3 text-stone-500">
          <i class="fa-solid fa-triangle-exclamation text-2xl text-red-500" />
          <p class="text-sm">Failed to load dungeon</p>
          <button
            class="text-xs px-3 py-1.5 rounded bg-stone-700 hover:bg-stone-600 transition-colors text-stone-300"
            @click="dungeonStore.init(sessionId, dungeonId)"
          >Retry</button>
        </div>
        <div v-else class="w-full h-full flex items-center justify-center text-stone-500">
          Loading dungeon...
        </div>

        <ConfirmDialog />

        <DiceRollToast />

        <ChatToast bottom-class="bottom-20" />

        <ItemPalette class="absolute bottom-4 left-1/2 -translate-x-1/2 z-10" />

        <div
          v-if="itemDrag.active"
          class="fixed pointer-events-none z-50 select-none text-parchment-300 opacity-80"
          :style="{ left: itemDrag.x + 'px', top: itemDrag.y + 'px', transform: 'translate(-50%, -50%)' }"
        ><i :class="[itemDrag.faClass, 'text-xl']" /></div>
      </div>

      <RightSidebar context="dungeon" />
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watchEffect } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useD } from '@/stores/dungeonStore.js'
import { useSessionStore } from '@/stores/sessionStore.js'
import { useDiceStore } from '@/stores/diceStore.js'
import { useChatStore } from '@/stores/chatStore.js'
import { useCharacterStore } from '@/stores/characterStore.js'
import { useAuthStore } from '@/stores/authStore.js'
import DungeonToolbar from '@/components/dungeon/DungeonToolbar.vue'
import DungeonCanvas from '@/components/dungeon/DungeonCanvas.vue'
import RightSidebar from '@/components/common/RightSidebar.vue'
import ShareModal from '@/components/common/ShareModal.vue'
import ConfirmDialog from '@/components/common/ConfirmDialog.vue'
import ItemPalette from '@/components/dungeon/ItemPalette.vue'
import TorchTimer from '@/components/dungeon/TorchTimer.vue'
import DiceRollToast from '@/components/dungeon/DiceRollToast.vue'
import ChatToast from '@/components/common/ChatToast.vue'
import BugReportButton from '@/components/common/BugReportButton.vue'
import CharacterDrawer from '@/components/common/CharacterDrawer.vue'
import CharacterPicker from '@/components/common/CharacterPicker.vue'
import { useItemDrag } from '@/composables/useItemDrag.js'

const route = useRoute()
const router = useRouter()
const sessionId = route.params.sessionId
const dungeonId = route.params.dungeonId

const sessionStore = useSessionStore()
const dungeonStore = useD()
const diceStore = useDiceStore()
const chatStore = useChatStore()
const characterStore = useCharacterStore()
const authStore = useAuthStore()
const avatarError = ref(false)
const canvasComp = ref(null)
const charOpen = ref(false)
const navEl = ref(null)
const navHeight = ref(44)
const { state: itemDrag, updatePosition, endDrag } = useItemDrag()

function measureNav() {
  if (navEl.value) navHeight.value = navEl.value.offsetHeight
}

onMounted(async () => {
  measureNav()
  window.addEventListener('resize', measureNav)

  if (!sessionStore.sessionId) {
    await sessionStore.joinSession(sessionId)
  }
  await dungeonStore.init(sessionId, dungeonId)
  diceStore.init(sessionId)
  chatStore.init(sessionId)
  characterStore.loadAll(sessionId)
  sessionStore.initPresence(sessionId)
})

onUnmounted(() => {
  window.removeEventListener('resize', measureNav)
  dungeonStore.cleanup()
  characterStore.cleanup()
  chatStore.cleanup()
  sessionStore.cleanupPresence()
})

function onGlobalMouseMove(e) {
  if (itemDrag.active) updatePosition(e.clientX, e.clientY)
}

function onGlobalMouseUp(e) {
  if (!itemDrag.active) return
  const drop = endDrag()
  if (drop && canvasComp.value) {
    canvasComp.value.dropItem(drop.type, drop.x, drop.y)
  }
}

watchEffect(() => {
  if (itemDrag.active) {
    window.addEventListener('mousemove', onGlobalMouseMove)
    window.addEventListener('mouseup', onGlobalMouseUp)
  } else {
    window.removeEventListener('mousemove', onGlobalMouseMove)
    window.removeEventListener('mouseup', onGlobalMouseUp)
  }
})

function goBack() {
  router.push({ name: 'hex-map', params: { sessionId } })
}

const onlineOthers = computed(() =>
  sessionStore.onlineUsers.filter(u => u.user_id !== authStore.user?.id)
)

const VIEWER_COLORS = ['bg-indigo-600', 'bg-purple-600', 'bg-rose-600', 'bg-amber-600', 'bg-teal-600', 'bg-sky-600', 'bg-emerald-600', 'bg-pink-600']
function viewerColor(userId) {
  const hash = (userId ?? '').split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)
  return VIEWER_COLORS[hash % VIEWER_COLORS.length]
}
</script>
