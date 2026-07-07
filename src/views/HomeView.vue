<template>
  <div class="min-h-screen bg-stone-900 flex flex-col items-center py-12 px-6">
    <div class="w-full max-w-lg">

      <div class="text-center mb-10">
        <div class="text-6xl mb-4">⬡</div>
        <h1 class="text-4xl font-display text-parchment-200 mb-2">Hex Map</h1>
        <p class="text-stone-400 font-body text-lg">mapping for overland & dungeon</p>
      </div>

      <template v-if="!authStore.isAuthenticated">
        <div class="bg-stone-800 border border-stone-600 rounded-lg overflow-hidden">

          <div class="flex border-b border-stone-700">
            <button
              v-for="t in ['discord', 'email']"
              :key="t"
              :data-testid="`auth-tab-${t}`"
              class="flex-1 py-3 text-sm font-display transition-colors"
              :class="authTab === t
                ? 'text-parchment-200 bg-stone-750 border-b-2 border-parchment-400'
                : 'text-stone-500 hover:text-stone-300'"
              @click="authTab = t; authError = null; emailConfirmSent = false; discordBlockedHint = false"
            >
              {{ t === 'discord' ? 'Discord' : 'Email' }}
            </button>
          </div>

          <div class="p-6">

            <template v-if="authTab === 'discord'">
              <p class="text-stone-400 text-sm mb-5">Sign in with your Discord account.</p>
              <button
                @click="handleDiscordLogin"
                :disabled="loggingIn"
                class="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-display rounded px-4 py-2.5 transition-colors"
              >
                <svg class="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057c.002.022.015.043.033.055a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
                </svg>
                {{ loggingIn ? 'Redirecting to Discord…' : 'Continue with Discord' }}
              </button>
              <p v-if="discordBlockedHint" class="text-amber-300 text-sm mt-3">
                Couldn't reach Discord — an ad blocker or privacy extension may be blocking it. Try
                allowlisting this site, or
                <button class="underline hover:text-amber-200" @click="switchToEmail">sign in with email</button>.
              </p>
            </template>

            <template v-else>
              <form @submit.prevent="handleEmailSubmit" class="space-y-3">
                <div>
                  <label class="block text-stone-400 text-sm mb-1">Email</label>
                  <input
                    v-model="emailField"
                    data-testid="auth-email"
                    type="email"
                    required
                    autocomplete="email"
                    placeholder="you@example.com"
                    class="w-full bg-stone-700 border border-stone-600 rounded px-3 py-2 text-stone-100 placeholder-stone-500 focus:outline-none focus:border-parchment-400 text-sm"
                  />
                </div>
                <div>
                  <label class="block text-stone-400 text-sm mb-1">Password</label>
                  <input
                    v-model="passwordField"
                    data-testid="auth-password"
                    type="password"
                    required
                    autocomplete="current-password"
                    placeholder="••••••••"
                    class="w-full bg-stone-700 border border-stone-600 rounded px-3 py-2 text-stone-100 placeholder-stone-500 focus:outline-none focus:border-parchment-400 text-sm"
                  />
                </div>
                <button
                  type="submit"
                  data-testid="auth-submit"
                  :disabled="emailLoading"
                  class="w-full bg-parchment-500 hover:bg-parchment-400 disabled:opacity-50 text-stone-900 font-display rounded px-4 py-2.5 transition-colors mt-1"
                >
                  {{ emailLoading ? '…' : 'Sign in' }}
                </button>
              </form>
            </template>

            <p v-if="authError" class="text-red-400 text-sm mt-3">{{ authError }}</p>
          </div>
        </div>
      </template>

      <template v-else>

        <div class="flex items-center gap-3 mb-6">
          <img
            v-if="authStore.avatarUrl"
            :src="authStore.avatarUrl"
            :alt="authStore.displayName"
            class="w-9 h-9 rounded-full border border-stone-600"
          />
          <div
            v-else
            class="w-9 h-9 rounded-full bg-indigo-700 flex items-center justify-center text-white font-display"
          >
            {{ authStore.displayName?.charAt(0)?.toUpperCase() }}
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-parchment-200 font-display truncate">{{ authStore.displayName }}</p>
            <p class="text-stone-500 text-sm">{{ authStore.provider === 'discord' ? 'Signed in via Discord' : 'Signed in via email' }}</p>
          </div>
          <button
            @click="authStore.signOut()"
            class="text-stone-500 hover:text-stone-300 text-sm transition-colors"
          >
            Sign out
          </button>
        </div>

        <div class="bg-stone-800 border border-stone-600 rounded-lg p-5 mb-4">
          <h2 class="text-parchment-200 font-display text-lg mb-4">New Campaign</h2>
          <div class="flex rounded-md overflow-hidden border border-stone-700 mb-3">
            <button
              type="button"
              data-testid="campaign-mode-gm"
              class="flex-1 px-3 py-2 text-sm font-display transition-colors"
              :class="newPlayMode === 'gm' ? 'bg-stone-700 text-parchment-200' : 'bg-stone-800 text-stone-400 hover:text-stone-200'"
              @click="newPlayMode = 'gm'"
            >
              GM-led
            </button>
            <button
              type="button"
              data-testid="campaign-mode-gm-less"
              class="flex-1 px-3 py-2 text-sm font-display transition-colors border-l border-stone-700"
              :class="newPlayMode === 'gm_less' ? 'bg-stone-700 text-parchment-200' : 'bg-stone-800 text-stone-400 hover:text-stone-200'"
              @click="newPlayMode = 'gm_less'"
            >
              Solo / Co-op
            </button>
          </div>
          <div class="flex gap-2">
            <input
              v-model="newName"
              data-testid="campaign-name"
              type="text"
              placeholder="The Verdant Reaches…"
              class="flex-1 bg-stone-700 border border-stone-500 rounded px-3 py-2 text-stone-100 placeholder-stone-500 focus:outline-none focus:border-parchment-400"
              @keyup.enter="create"
            />
            <button
              data-testid="campaign-create"
              @click="create"
              :disabled="sessionStore.loading"
              class="bg-parchment-500 hover:bg-parchment-400 disabled:opacity-50 text-stone-900 font-display rounded px-4 py-2 transition-colors shrink-0"
            >
              {{ sessionStore.loading ? 'Creating…' : 'Create' }}
            </button>
          </div>
          <p v-if="sessionStore.error" class="text-red-400 text-sm mt-2">{{ sessionStore.error }}</p>
        </div>

        <div class="bg-stone-800 border border-stone-600 rounded-lg p-5 mb-6">
          <h2 class="text-parchment-200 font-display text-lg mb-4">Join Campaign</h2>
          <div class="flex gap-2">
            <input
              v-model="joinInput"
              data-testid="campaign-join-input"
              type="text"
              placeholder="Paste the session URL or UUID…"
              class="flex-1 bg-stone-700 border border-stone-500 rounded px-3 py-2 text-stone-100 placeholder-stone-500 focus:outline-none focus:border-parchment-400"
              @keyup.enter="join"
            />
            <button
              data-testid="campaign-join"
              @click="join"
              :disabled="sessionStore.loading || !joinInput.trim()"
              class="bg-stone-600 hover:bg-stone-500 disabled:opacity-50 text-stone-100 font-display rounded px-4 py-2 transition-colors shrink-0"
            >
              Join
            </button>
          </div>
          <p v-if="joinError" class="text-red-400 text-sm mt-2">{{ joinError }}</p>
        </div>

        <div class="mb-6">
          <h2 class="text-parchment-200 font-display text-lg mb-3">Your Campaigns</h2>

          <div v-if="sessionStore.sessionsLoading" class="text-stone-500 text-sm py-4 text-center">
            Loading…
          </div>

          <div
            v-else-if="!sessionStore.userSessions.length"
            class="text-stone-600 text-sm py-4 text-center italic"
          >
            No campaigns yet. Create one above.
          </div>

          <div v-else class="flex flex-col gap-2">
            <div
              v-for="s in sessionStore.userSessions"
              :key="s.id"
              class="w-full flex items-center bg-stone-800 border border-stone-700 hover:border-stone-500 rounded-lg overflow-hidden transition-colors group"
            >
              <button
                class="flex-1 flex items-center justify-between px-4 py-3 text-left hover:bg-stone-750 transition-colors min-w-0"
                @click="openSession(s.id)"
              >
                <div class="min-w-0">
                  <p class="text-parchment-200 font-display truncate group-hover:text-parchment-100">{{ s.name }}</p>
                  <p class="text-stone-500 text-sm mt-0.5">{{ formatDate(s.updated_at) }}</p>
                </div>
                <span class="text-stone-600 group-hover:text-stone-400 text-lg ml-3 shrink-0">›</span>
              </button>
              <RouterLink
                :to="{ name: 'campaign-notes', params: { sessionId: s.id } }"
                class="flex items-center gap-1.5 px-3 py-3 border-l border-stone-700 text-stone-500 hover:text-parchment-300 hover:bg-stone-750 transition-colors text-sm shrink-0 self-stretch"
                title="View hex notes"
              >
                <i class="fa-solid fa-scroll" />
                <span class="hidden sm:inline">Notes</span>
              </RouterLink>
              <button
                class="flex items-center px-3 py-3 border-l border-stone-700 text-stone-600 hover:text-red-400 hover:bg-stone-750 transition-colors text-sm shrink-0 self-stretch"
                title="Delete campaign"
                @click.stop="deleteSession(s.id)"
              >
                <i class="fa-solid fa-trash" />
              </button>
            </div>
          </div>
        </div>

        <div v-if="sessionStore.joinedSessions.length || sessionStore.sessionsLoading">
          <h2 class="text-parchment-200 font-display text-lg mb-3">Joined Campaigns</h2>

          <div v-if="sessionStore.sessionsLoading" class="text-stone-500 text-sm py-4 text-center">
            Loading…
          </div>

          <div v-else class="flex flex-col gap-2">
            <div
              v-for="s in sessionStore.joinedSessions"
              :key="s.id"
              class="w-full flex items-center bg-stone-800 border border-stone-700 hover:border-stone-500 rounded-lg overflow-hidden transition-colors group"
            >
              <button
                class="flex-1 flex items-center justify-between px-4 py-3 text-left hover:bg-stone-750 transition-colors min-w-0"
                @click="openSession(s.id)"
              >
                <div class="min-w-0">
                  <p class="text-parchment-200 font-display truncate group-hover:text-parchment-100">{{ s.name }}</p>
                  <p class="text-stone-500 text-sm mt-0.5">{{ formatDate(s.updated_at) }}</p>
                </div>
                <span class="text-stone-600 group-hover:text-stone-400 text-lg ml-3 shrink-0">›</span>
              </button>
              <RouterLink
                :to="{ name: 'campaign-notes', params: { sessionId: s.id } }"
                class="flex items-center gap-1.5 px-3 py-3 border-l border-stone-700 text-stone-500 hover:text-parchment-300 hover:bg-stone-750 transition-colors text-sm shrink-0 self-stretch"
                title="View hex notes"
              >
                <i class="fa-solid fa-scroll" />
                <span class="hidden sm:inline">Notes</span>
              </RouterLink>
              <button
                class="flex items-center px-3 py-3 border-l border-stone-700 text-stone-600 hover:text-red-400 hover:bg-stone-750 transition-colors text-sm shrink-0 self-stretch"
                title="Leave campaign"
                @click.stop="leaveSession(s.id)"
              >
                <i class="fa-solid fa-right-from-bracket" />
              </button>
            </div>
          </div>
        </div>

      </template>
    </div>
    <ConfirmDialog />
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter, RouterLink } from 'vue-router'
import { useSessionStore } from '@/stores/sessionStore.js'
import { useAuthStore } from '@/stores/authStore.js'
import { useConfirmDialog } from '@/composables/useConfirmDialog.js'
import ConfirmDialog from '@/components/common/ConfirmDialog.vue'

const router = useRouter()
const sessionStore = useSessionStore()
const authStore = useAuthStore()
const { confirm } = useConfirmDialog()

const newName = ref('Untitled Campaign')
const newPlayMode = ref('gm')
const joinInput = ref('')
const joinError = ref(null)

const authTab = ref('discord')
const loggingIn = ref(false)
const emailLoading = ref(false)
const authError = ref(null)
const discordBlockedHint = ref(false)
const emailField = ref('')
const passwordField = ref('')

let discordRedirectTimer = null

onMounted(async () => {
  await authStore.init()
  if (authStore.isAuthenticated) {
    await sessionStore.fetchUserSessions()
  }
})

async function handleDiscordLogin() {
  loggingIn.value = true
  authError.value = null
  discordBlockedHint.value = false
  clearTimeout(discordRedirectTimer)
  discordRedirectTimer = setTimeout(() => {
    loggingIn.value = false
    discordBlockedHint.value = true
  }, 6000)
  try {
    await authStore.signInWithDiscord()
  } catch (e) {
    clearTimeout(discordRedirectTimer)
    loggingIn.value = false
    discordBlockedHint.value = true
    authError.value = e.message
  }
}

function switchToEmail() {
  authTab.value = 'email'
  discordBlockedHint.value = false
  authError.value = null
}

onUnmounted(() => clearTimeout(discordRedirectTimer))

async function handleEmailSubmit() {
  authError.value = null
  emailLoading.value = true
  try {
    await authStore.signInWithEmail(emailField.value, passwordField.value)
    await sessionStore.fetchUserSessions()
  } catch (e) {
    authError.value = e.message
  } finally {
    emailLoading.value = false
  }
}

async function create() {
  sessionStore.sessionName = newName.value || 'Untitled Campaign'
  await sessionStore.createSession(newPlayMode.value)
}

async function join() {
  joinError.value = null
  const raw = joinInput.value.trim()
  if (!raw) return
  const id = raw.includes('/session/') ? raw.split('/session/')[1].split('/')[0] : raw
  await sessionStore.joinSession(id)
  if (sessionStore.error) {
    joinError.value = sessionStore.error
  } else {
    router.push({ name: 'hex-map', params: { sessionId: id } })
  }
}

function openSession(id) {
  router.push({ name: 'hex-map', params: { sessionId: id } })
}

function deleteSession(id) {
  const s = sessionStore.userSessions.find(s => s.id === id)
  if (!s) return
  confirm(
    `Delete "${s.name}"? This cannot be undone.`,
    () => sessionStore.deleteSession(id),
  )
}

function leaveSession(id) {
  sessionStore.leaveSession(id)
}

function formatDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}
</script>
