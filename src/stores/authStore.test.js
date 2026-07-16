import { describe, test, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

const state = vi.hoisted(() => ({
  session: null,
  authCallbacks: [],
  cleanups: [],
  signInResult: { error: null },
  signUpResult: { data: { session: null }, error: null },
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: () => Promise.resolve({ data: { session: state.session } }),
      onAuthStateChange: cb => {
        state.authCallbacks.push(cb)
        return { data: { subscription: { unsubscribe: () => {} } } }
      },
      signInWithPassword: vi.fn(() => Promise.resolve(state.signInResult)),
      signUp: vi.fn(() => Promise.resolve(state.signUpResult)),
      signInWithOAuth: vi.fn(() => Promise.resolve({ error: null })),
      signOut: vi.fn(() => Promise.resolve({ error: null })),
    },
  },
}))
vi.mock('@/lib/faro.js', () => ({ setFaroUser: vi.fn() }))
vi.mock('@/router/index.js', () => ({ default: { push: vi.fn() } }))

const storeMock = vi.hoisted(() => name => ({ [name]: () => ({ cleanup: () => state.cleanups.push(name) }) }))
vi.mock('@/stores/sessionStore.js', () => storeMock('useSessionStore'))
vi.mock('@/stores/characterStore.js', () => storeMock('useCharacterStore'))
vi.mock('@/stores/hexStore.js', () => storeMock('useHexStore'))
vi.mock('@/stores/diceStore.js', () => storeMock('useDiceStore'))
vi.mock('@/stores/chatStore.js', () => storeMock('useChatStore'))
vi.mock('@/stores/notesStore.js', () => storeMock('useNotesStore'))
vi.mock('@/stores/photoStore.js', () => storeMock('usePhotoStore'))
vi.mock('@/stores/activityStore.js', () => storeMock('useActivityStore'))
vi.mock('@/stores/macroStore.js', () => storeMock('useMacroStore'))

import router from '@/router/index.js'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from './authStore.js'

describe('authStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    state.session = null
    state.authCallbacks = []
    state.cleanups = []
    state.signInResult = { error: null }
    state.signUpResult = { data: { session: null }, error: null }
    vi.mocked(router.push).mockClear()
  })

  test('init resolves the current session user and stops loading', async () => {
    state.session = { user: { id: 'me', email: 'me@example.test' } }
    const store = useAuthStore()
    await store.init()

    expect(store.isAuthenticated).toBe(true)
    expect(store.user.id).toBe('me')
    expect(store.loading).toBe(false)
  })

  test('init is idempotent — repeated calls share one promise', async () => {
    const store = useAuthStore()
    await Promise.all([store.init(), store.init()])
    await store.init()

    expect(state.authCallbacks).toHaveLength(1)
  })

  test('SIGNED_OUT event cleans up every session store and returns home', async () => {
    state.session = { user: { id: 'me' } }
    const store = useAuthStore()
    await store.init()

    state.authCallbacks[0]('SIGNED_OUT', null)

    expect(store.user).toBeNull()
    expect(state.cleanups).toEqual([
      'useSessionStore', 'useCharacterStore', 'useHexStore', 'useDiceStore',
      'useChatStore', 'useNotesStore', 'usePhotoStore', 'useActivityStore', 'useMacroStore',
    ])
    expect(router.push).toHaveBeenCalledWith({ name: 'home' })
  })

  test('a TOKEN_REFRESHED event updates the user without tearing anything down', async () => {
    state.session = { user: { id: 'me' } }
    const store = useAuthStore()
    await store.init()

    state.authCallbacks[0]('TOKEN_REFRESHED', { user: { id: 'me', email: 'new@example.test' } })

    expect(store.user.email).toBe('new@example.test')
    expect(state.cleanups).toEqual([])
  })

  describe('displayName fallback chain', () => {
    const cases = [
      ['full_name', { user_metadata: { full_name: 'Full Name' } }, 'Full Name'],
      ['global_name', { user_metadata: { global_name: 'Global' } }, 'Global'],
      ['discord custom claims', { user_metadata: { custom_claims: { global_name: 'DiscordName' } } }, 'DiscordName'],
      ['identity data', { user_metadata: {}, identities: [{ identity_data: { full_name: 'Identity Name' } }] }, 'Identity Name'],
      ['email', { user_metadata: {}, email: 'me@example.test' }, 'me@example.test'],
      ['default', { user_metadata: {} }, 'Adventurer'],
    ]
    test.each(cases)('falls back to %s', (_label, user, expected) => {
      const store = useAuthStore()
      store.user = user
      expect(store.displayName).toBe(expected)
    })

    test('is null when signed out', () => {
      const store = useAuthStore()
      expect(store.displayName).toBeNull()
    })
  })

  test('avatarUrl prefers metadata then identity data', () => {
    const store = useAuthStore()
    store.user = { user_metadata: { avatar_url: 'https://a.example/x.png' } }
    expect(store.avatarUrl).toBe('https://a.example/x.png')

    store.user = { user_metadata: {}, identities: [{ identity_data: { avatar_url: 'https://b.example/y.png' } }] }
    expect(store.avatarUrl).toBe('https://b.example/y.png')

    store.user = { user_metadata: {} }
    expect(store.avatarUrl).toBeNull()
  })

  test('signUpWithEmail reports whether email confirmation is required', async () => {
    const store = useAuthStore()

    state.signUpResult = { data: { session: null }, error: null }
    expect(await store.signUpWithEmail('user', 'e@x.test', 'pw')).toEqual({ needsConfirmation: true })

    state.signUpResult = { data: { session: {} }, error: null }
    expect(await store.signUpWithEmail('user', 'e@x.test', 'pw')).toEqual({ needsConfirmation: false })
  })

  test('signInWithEmail surfaces auth errors', async () => {
    state.signInResult = { error: new Error('Invalid login credentials') }
    const store = useAuthStore()

    await expect(store.signInWithEmail('e@x.test', 'wrong')).rejects.toThrow('Invalid login credentials')
  })

  test('signOut clears the user and navigates home', async () => {
    state.session = { user: { id: 'me' } }
    const store = useAuthStore()
    await store.init()

    await store.signOut()

    expect(supabase.auth.signOut).toHaveBeenCalled()
    expect(store.user).toBeNull()
    expect(router.push).toHaveBeenCalledWith({ name: 'home' })
  })

})
