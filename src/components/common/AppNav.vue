<template>
  <header
    ref="headerEl"
    class="flex items-center gap-3 px-4 py-2 bg-stone-900 border-b border-stone-700 shrink-0 relative z-50"
  >
    <RouterLink to="/" class="text-parchment-300 hover:text-parchment-100 font-display text-lg transition-colors">⬡ Hex Map</RouterLink>

    <span class="text-stone-600">|</span>

    <input
      v-if="editing"
      v-model="nameInput"
      ref="nameInputEl"
      type="text"
      class="bg-transparent border-b border-parchment-400 text-parchment-100 font-display text-sm focus:outline-none w-48"
      @blur="commitName"
      @keyup.enter="commitName"
      @keyup.escape="cancelEdit"
    />
    <button
      v-else
      class="text-parchment-200 font-display text-sm hover:text-parchment-100"
      @click="startEdit"
    >
      {{ sessionStore.sessionName }}
    </button>

    <!-- Active players -->
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
        <div class="absolute top-full left-1/2 -translate-x-1/2 mt-1.5 px-2 py-1 bg-stone-900 border border-stone-700 rounded text-sm text-stone-200 whitespace-nowrap pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity z-50">
          {{ viewer.display_name }}
        </div>
      </div>
    </div>

    <div class="ml-auto flex items-center gap-3">
      <MapPicker v-if="sessionStore.isGM" />
      <CharacterPicker />

      <button
        class="flex items-center gap-1.5 text-sm transition-colors px-2 py-1 rounded"
        :class="charOpen
          ? 'text-stone-900 bg-parchment-400'
          : 'text-parchment-400 hover:text-parchment-200 hover:bg-stone-800'"
        :title="charOpen ? 'Close character sheet' : 'Character sheet'"
        @click="$emit('update:charOpen', !charOpen)"
      >
        <i :class="charOpen ? 'fa-solid fa-xmark' : 'fa-solid fa-user'" />
        <span class="hidden sm:inline">{{ charOpen ? 'Close Character Sheet' : 'Character Sheet' }}</span>
      </button>

      <button
        class="flex items-center gap-1.5 text-sm px-2 py-1 rounded transition-colors"
        :class="showLegend
          ? 'text-stone-900 bg-parchment-400'
          : 'text-parchment-400 hover:text-parchment-200 hover:bg-stone-800'"
        @click="showLegend = !showLegend"
      >
        <i class="fa-solid fa-book-atlas" />
        <span class="hidden sm:inline">{{ showLegend ? 'Hide Legend' : 'Legend' }}</span>
      </button>

      <ShareModal :session-id="props.sessionId" />
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
          <span class="text-stone-300 text-sm truncate max-w-28">{{ authStore.displayName }}</span>
          <button
            class="text-stone-500 hover:text-stone-300 text-sm transition-colors"
            title="Sign out"
            @click="authStore.signOut()"
          >
            &times;
          </button>
        </div>
      </template>
    </div>

    <Teleport to="body">
      <div
        v-if="showLegend"
        class="fixed top-12 right-46 z-50"
        @click.outside="showLegend = false"
      >
        <HexLegend />
      </div>
    </Teleport>
  </header>
  <CharacterDrawer
    :open="charOpen"
    :nav-height="navHeight"
    @close="$emit('update:charOpen', false)"
  />
</template>

<script setup>
import { ref, computed, nextTick, onMounted, onUnmounted } from 'vue'
import { useSessionStore } from '@/stores/sessionStore.js'
import { useAuthStore } from '@/stores/authStore.js'
import ShareModal from './ShareModal.vue'
import BugReportButton from './BugReportButton.vue'
import HexLegend from '@/components/hex/HexLegend.vue'
import CharacterDrawer from './CharacterDrawer.vue'
import CharacterPicker from './CharacterPicker.vue'
import MapPicker from './MapPicker.vue'

const props = defineProps({
  sessionId: String,
  charOpen: { type: Boolean, default: false },
})
defineEmits(['update:charOpen'])

const sessionStore = useSessionStore()
const authStore = useAuthStore()

const VIEWER_COLORS = ['bg-indigo-600', 'bg-purple-600', 'bg-rose-600', 'bg-amber-600', 'bg-teal-600', 'bg-sky-600', 'bg-emerald-600', 'bg-pink-600']
function viewerColor(userId) {
  const hash = (userId ?? '').split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)
  return VIEWER_COLORS[hash % VIEWER_COLORS.length]
}
const onlineOthers = computed(() =>
  sessionStore.onlineUsers.filter(u => u.user_id !== authStore.user?.id)
)

const editing = ref(false)
const nameInput = ref('')
const nameInputEl = ref(null)
const showLegend = ref(false)
const avatarError = ref(false)

const headerEl = ref(null)
const navHeight = ref(44)

function measureNav() {
  if (headerEl.value) navHeight.value = headerEl.value.offsetHeight
}

onMounted(() => {
  measureNav()
  window.addEventListener('resize', measureNav)
})
onUnmounted(() => window.removeEventListener('resize', measureNav))

function startEdit() {
  nameInput.value = sessionStore.sessionName
  editing.value = true
  nextTick(() => nameInputEl.value?.focus())
}

function commitName() {
  editing.value = false
  if (nameInput.value.trim()) {
    sessionStore.updateSessionName(nameInput.value.trim())
  }
}

function cancelEdit() {
  editing.value = false
}
</script>
