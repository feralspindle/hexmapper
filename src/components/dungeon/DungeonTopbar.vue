<template>
  <header class="ds-topbar">
  
    <button
      class="ds-tb-btn"
      style="margin-right:6px;flex-shrink:0"
      title="Back to map"
      @click="goBack"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M19 12H5M12 5l-7 7 7 7"/>
      </svg>
    </button>


    <div class="ds-brand">
      <div class="ds-brand-mark">S</div>
      {{ sessionStore.sessionName }}
    </div>

    <div class="ds-divider" />


    <div class="ds-session-name">
      <span class="ds-ornament">✦</span>
      {{ dungeonStore.dungeon?.name ?? 'Unnamed Dungeon' }}
      <span class="ds-ornament">✦</span>
    </div>

    <div class="ds-divider" />


    <TorchTimer :dungeon-id="dungeonId" />


    <div style="flex:1" />


    <div class="ds-presence" style="margin-right:10px">
      <div
        v-for="user in visibleOnlineUsers"
        :key="user.user_id ?? user._clientId"
        class="ds-avatar"
        :style="{ '--player-color': playerColor(user.user_id ?? user._clientId) }"
        :title="user.display_name"
      >
        <img
          v-if="user.avatar_url"
          :src="user.avatar_url"
          :alt="user.display_name"
          style="width:100%;height:100%;border-radius:50%;object-fit:cover"
        />
        <span v-else>{{ user.display_name?.charAt(0)?.toUpperCase() }}</span>
        <div class="ds-status-dot" />
      </div>
    </div>


    <CharacterPicker style="margin-right:8px" />


    <button
      class="ds-tb-btn"
      :class="{ active: charOpen }"
      style="margin-left:8px"
      title="Character sheet"
      @click="emit('toggle-char')"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>
      </svg>
      <span style="font-size:13px">Sheet</span>
    </button>


    <ShareModal :session-id="sessionStore.sessionId" style="margin-left:4px" />

    <BugReportButton style="margin-left:4px" />


    <div style="display:flex;align-items:center;margin-left:10px;padding-left:10px;border-left:1px solid rgba(237,225,199,.15);gap:8px;flex-shrink:0">
    
      <img
        v-if="authStore.avatarUrl && !avatarErr"
        :src="authStore.avatarUrl"
        :alt="authStore.displayName"
        style="width:24px;height:24px;border-radius:50%;object-fit:cover;border:1px solid rgba(237,225,199,.25);flex-shrink:0"
        @error="avatarErr = true"
      />
      <div
        v-else
        style="width:24px;height:24px;border-radius:50%;background:var(--accent);display:flex;align-items:center;justify-content:center;font-family:var(--font-display);font-size:12px;color:var(--paper);flex-shrink:0"
      >{{ authStore.displayName?.charAt(0)?.toUpperCase() }}</div>

      <span style="font-family:var(--font-body);font-size:13px;color:rgba(237,225,199,.75);max-width:100px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
        {{ authStore.displayName }}
      </span>

  
      <div ref="settingsWrapEl" class="ds-tb-settings-dropdown" style="position:relative;align-self:stretch;display:flex;align-items:center">
        <button
          class="ds-tb-btn"
          :class="{ active: settingsOpen }"
          title="Display settings"
          @click="settingsOpen = !settingsOpen"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
          </svg>
        </button>
        <DungeonTweaksPanel v-if="settingsOpen" @close="settingsOpen = false" />
      </div>
    </div>
  </header>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useSessionStore } from '@/stores/sessionStore.js'
import { useAuthStore } from '@/stores/authStore.js'
import { useD } from '@/stores/dungeonStore.js'
import TorchTimer from '@/components/dungeon/TorchTimer.vue'
import CharacterPicker from '@/components/common/CharacterPicker.vue'
import ShareModal from '@/components/common/ShareModal.vue'
import BugReportButton from '@/components/common/BugReportButton.vue'
import DungeonTweaksPanel from '@/components/dungeon/DungeonTweaksPanel.vue'
import { playerColorFor } from '@/composables/usePlayerColor.js'
import { activeNavDropdown } from '@/composables/useNavDropdown.js'

const props = defineProps({
  dungeonId: String,
  charOpen:  { type: Boolean, default: false },
})
const emit = defineEmits(['toggle-char'])

const router       = useRouter()
const route        = useRoute()
const sessionStore = useSessionStore()
const authStore    = useAuthStore()
const dungeonStore = useD()

const settingsOpen  = ref(false)
const avatarErr     = ref(false)
const settingsWrapEl = ref(null)

function goBack() {
  router.push({ name: 'hex-map', params: { sessionId: route.params.sessionId } })
}

function playerColor(userId) {
  return playerColorFor(userId)
}

const visibleOnlineUsers = computed(() =>
  sessionStore.onlineUsers.slice(0, 6)
)

watch(settingsOpen, (val) => {
  if (val) activeNavDropdown.value = 'settings'
  else if (activeNavDropdown.value === 'settings') activeNavDropdown.value = null
})
watch(activeNavDropdown, (val) => {
  if (val !== null && val !== 'settings') settingsOpen.value = false
})

function onDocClick(e) {
  if (settingsOpen.value && settingsWrapEl.value && !settingsWrapEl.value.contains(e.target)) {
    settingsOpen.value = false
  }
}

onMounted(() => document.addEventListener('mousedown', onDocClick))
onUnmounted(() => document.removeEventListener('mousedown', onDocClick))
</script>
