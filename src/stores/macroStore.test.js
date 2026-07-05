import { describe, test, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { resetKit } from '../../test/helpers/storeTestKit.js'

const kit = vi.hoisted(() => ({ auth: { user: { id: 'me' } } }))

vi.mock('@/lib/supabase', async () => {
  const { createSupabaseMock } = await import('../../test/helpers/storeTestKit.js')
  return createSupabaseMock(kit)
})
vi.mock('@/lib/apiClient.js', async () => {
  const { createApiClientMock } = await import('../../test/helpers/storeTestKit.js')
  return createApiClientMock(kit)
})
vi.mock('@/stores/authStore.js', () => ({
  useAuthStore: () => kit.auth,
}))

import { useMacroStore } from './macroStore.js'

describe('macroStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    resetKit(kit)
    kit.auth = { user: { id: 'me' } }
  })

  test('init loads macros once and skips repeat loads', async () => {
    kit.responses.dice_macros = { data: [{ id: 'm1', label: 'attack' }], error: null }
    const store = useMacroStore()
    await store.init()
    await store.init()

    expect(store.macros).toHaveLength(1)
    expect(kit.queries.filter(q => q.table === 'dice_macros')).toHaveLength(1)
  })

  test('init does nothing when signed out', async () => {
    kit.auth = { user: null }
    const store = useMacroStore()
    await store.init()

    expect(kit.queries).toHaveLength(0)
    expect(store.macros).toEqual([])
  })

  test('saveMacro trims the label and appends the server row', async () => {
    kit.api['post /dice-macros'] = body => ({ id: 'm2', ...body })
    const store = useMacroStore()
    await store.saveMacro('  fireball  ', { d6: 8 }, 3)

    expect(store.macros).toEqual([{ id: 'm2', label: 'fireball', pending: { d6: 8 }, modifier: 3 }])
  })

  test('deleteMacro removes optimistically even if the API call fails', async () => {
    kit.responses.dice_macros = { data: [{ id: 'm1' }], error: null }
    kit.api['delete /dice-macros/m1'] = new kit.ApiError('nope', 500)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const store = useMacroStore()
    await store.init()

    await store.deleteMacro('m1')

    expect(store.macros).toEqual([])
    errorSpy.mockRestore()
  })

  test('cleanup resets so the next init reloads', async () => {
    kit.responses.dice_macros = { data: [{ id: 'm1' }], error: null }
    const store = useMacroStore()
    await store.init()
    store.cleanup()
    await store.init()

    expect(kit.queries.filter(q => q.table === 'dice_macros')).toHaveLength(2)
    expect(store.macros).toHaveLength(1)
  })
})
