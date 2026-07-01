import { describe, test, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const state = vi.hoisted(() => ({
  owned: { count: 0, error: null },
  joined: { count: 0, error: null },
  signOut: null,
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}))

vi.mock('@/lib/supabase', () => {
  const signOut = vi.fn(() => Promise.resolve())
  state.signOut = signOut
  return {
    supabase: {
      auth: {
        getSession: () =>
          Promise.resolve({ data: { session: { user: { id: 'u1' } } }, error: null }),
        signOut,
      },
      from: (table) => ({
        select: () => ({
          eq: () => Promise.resolve(table === 'sessions' ? state.owned : state.joined),
        }),
      }),
    },
  }
})

import AuthCallbackView from './AuthCallbackView.vue'

describe('AuthCallbackView read/write gap', () => {
  beforeEach(() => {
    state.owned = { count: 0, error: null }
    state.joined = { count: 0, error: null }
    state.signOut.mockClear()
  })

  test('does NOT sign out when a count read fails', async () => {
    state.owned = { count: null, error: { message: 'blocked by client' } }
    state.joined = { count: null, error: null }
    const wrapper = mount(AuthCallbackView)
    await flushPromises()
    expect(state.signOut).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('try again')
  })

  test('signs out only when both reads succeed and the user has no sessions', async () => {
    state.owned = { count: 0, error: null }
    state.joined = { count: 0, error: null }
    mount(AuthCallbackView)
    await flushPromises()
    expect(state.signOut).toHaveBeenCalledTimes(1)
  })

  test('does NOT sign out when the user owns sessions', async () => {
    state.owned = { count: 2, error: null }
    state.joined = { count: 0, error: null }
    mount(AuthCallbackView)
    await flushPromises()
    expect(state.signOut).not.toHaveBeenCalled()
  })
})
