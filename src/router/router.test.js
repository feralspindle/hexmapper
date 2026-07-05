import { describe, test, expect, beforeEach, vi } from 'vitest'

const auth = vi.hoisted(() => ({ state: { isAuthenticated: false, init: null } }))

const stubView = vi.hoisted(() => () => ({ default: { render: () => null } }))
vi.mock('@/views/HomeView.vue', stubView)
vi.mock('@/views/AuthCallbackView.vue', stubView)
vi.mock('@/views/HexMapView.vue', stubView)
vi.mock('@/views/DungeonView.vue', stubView)
vi.mock('@/views/CampaignNotesView.vue', stubView)
vi.mock('@/stores/authStore.js', () => ({
  useAuthStore: () => auth.state,
}))

import router from './index.js'

describe('router auth guard', () => {
  beforeEach(async () => {
    auth.state = { isAuthenticated: false, init: vi.fn(() => Promise.resolve()) }
    await router.replace('/')
  })

  test('unauthenticated visitors to a session are sent home after auth resolves', async () => {
    await router.push('/session/abc-123')

    expect(auth.state.init).toHaveBeenCalled()
    expect(router.currentRoute.value.name).toBe('home')
  })

  test('authenticated users reach the session map', async () => {
    auth.state.isAuthenticated = true
    await router.push('/session/abc-123')

    expect(router.currentRoute.value.name).toBe('hex-map')
    expect(router.currentRoute.value.params.sessionId).toBe('abc-123')
  })

  test('dungeon and notes routes are also guarded', async () => {
    await router.push('/session/abc/dungeon/d1')
    expect(router.currentRoute.value.name).toBe('home')

    await router.push('/session/abc/notes')
    expect(router.currentRoute.value.name).toBe('home')

    auth.state.isAuthenticated = true
    await router.push('/session/abc/dungeon/d1')
    expect(router.currentRoute.value.name).toBe('dungeon')
  })

  test('public routes never wait on auth', async () => {
    await router.push('/auth/callback')

    expect(router.currentRoute.value.name).toBe('auth-callback')
    expect(auth.state.init).not.toHaveBeenCalled()
  })

  test('unknown paths redirect home', async () => {
    await router.push('/no/such/page')

    expect(router.currentRoute.value.name).toBe('home')
  })
})
