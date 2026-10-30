import { describe, test, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const state = vi.hoisted(() => ({
  session: { user: { id: 'u1' } },
  getSessionError: null,
  signOut: null,
}))

const { replaceMock } = vi.hoisted(() => ({ replaceMock: vi.fn() }))

vi.mock('vue-router', () => ({
  useRouter: () => ({ replace: replaceMock, push: vi.fn() }),
}))

vi.mock('@/lib/supabase', () => {
  const signOut = vi.fn(() => Promise.resolve())
  state.signOut = signOut
  return {
    supabase: {
      auth: {
        getSession: () =>
          Promise.resolve({ data: { session: state.session }, error: state.getSessionError }),
        signOut,
      },
    },
  }
})

import AuthCallbackView from './AuthCallbackView.vue'

describe('AuthCallbackView', () => {
  beforeEach(() => {
    state.session = { user: { id: 'u1' } }
    state.getSessionError = null
    state.signOut.mockClear()
    replaceMock.mockClear()
  })

  test('redirects a signed-in user home without signing them out', async () => {
    mount(AuthCallbackView)
    await flushPromises()
    expect(replaceMock).toHaveBeenCalledWith('/')
    expect(state.signOut).not.toHaveBeenCalled()
  })

  test('does not sign out a brand-new user with no sessions', async () => {
    state.session = { user: { id: 'new-user' } }
    mount(AuthCallbackView)
    await flushPromises()
    expect(state.signOut).not.toHaveBeenCalled()
    expect(replaceMock).toHaveBeenCalledWith('/')
  })

  test('shows an error when the session read fails', async () => {
    state.getSessionError = { message: 'boom' }
    const wrapper = mount(AuthCallbackView)
    await flushPromises()
    expect(wrapper.text()).toContain('boom')
    expect(replaceMock).not.toHaveBeenCalled()
    expect(state.signOut).not.toHaveBeenCalled()
  })
})
