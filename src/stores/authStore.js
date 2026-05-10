import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase } from '@/lib/supabase'
import router from '@/router/index.js'
// Imported lazily inside cleanupAllStores to avoid circular-dep issues at module load time
import { useSessionStore }   from '@/stores/sessionStore.js'
import { useCharacterStore } from '@/stores/characterStore.js'
import { useHexStore }       from '@/stores/hexStore.js'
import { useDiceStore }      from '@/stores/diceStore.js'
import { useChatStore }      from '@/stores/chatStore.js'
import { useNotesStore }     from '@/stores/notesStore.js'
import { usePhotoStore }     from '@/stores/photoStore.js'
import { useActivityStore }  from '@/stores/activityStore.js'
import { useMacroStore }     from '@/stores/macroStore.js'

function cleanupAllStores() {
  try { useSessionStore().cleanup()   } catch { /* */ }
  try { useCharacterStore().cleanup() } catch { /* */ }
  try { useHexStore().cleanup()       } catch { /* */ }
  try { useDiceStore().cleanup()      } catch { /* */ }
  try { useChatStore().cleanup()      } catch { /* */ }
  try { useNotesStore().cleanup()     } catch { /* */ }
  try { usePhotoStore().cleanup()     } catch { /* */ }
  try { useActivityStore().cleanup()  } catch { /* */ }
  try { useMacroStore().cleanup()     } catch { /* */ }
}

export const useAuthStore = defineStore('auth', () => {
  const user = ref(null)
  const loading = ref(true)

  const isAuthenticated = computed(() => !!user.value)

  const displayName = computed(() => {
    if (!user.value) return null
    const m = user.value.user_metadata ?? {}
    return (
      m.full_name ||
      m.global_name ||
      m.custom_claims?.global_name ||
      m.name ||
      m.user_name ||
      user.value.identities?.[0]?.identity_data?.full_name ||
      user.value.identities?.[0]?.identity_data?.global_name ||
      user.value.identities?.[0]?.identity_data?.name ||
      user.value.email ||
      'Adventurer'
    )
  })

  const avatarUrl = computed(() => {
    const m = user.value?.user_metadata ?? {}
    return (
      m.avatar_url ||
      m.picture ||
      user.value?.identities?.[0]?.identity_data?.avatar_url ||
      null
    )
  })

  let _initPromise = null

  function init() {
    if (_initPromise) return _initPromise
    _initPromise = _doInit()
    return _initPromise
  }

  async function _doInit() {
    loading.value = true
    const { data } = await supabase.auth.getSession()
    user.value = data.session?.user ?? null
    loading.value = false

    supabase.auth.onAuthStateChange((event, session) => {
      user.value = session?.user ?? null
      if (event === 'SIGNED_OUT') {
        cleanupAllStores()
        router.push({ name: 'home' })
      }
    })
  }

  const provider = computed(() => user.value?.app_metadata?.provider ?? null)

  async function signInWithEmail(email, password) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
  }

  async function signUpWithEmail(username, email, password) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: username } },
    })
    if (error) throw error
    return { needsConfirmation: !data.session }
  }

  async function signInWithDiscord() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'discord',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        scopes: 'identify email',
      },
    })
    if (error) throw error
  }

  async function signOut() {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
    user.value = null
    router.push({ name: 'home' })
  }

  async function markWelcomeSeen() {
    const { data } = await supabase.auth.updateUser({ data: { welcome_seen: true } })
    if (data.user) user.value = data.user
  }

  return {
    user, loading, isAuthenticated, displayName, avatarUrl, provider,
    init, signInWithDiscord, signInWithEmail, signUpWithEmail, signOut, markWelcomeSeen,
  }
})
