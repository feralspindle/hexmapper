import { describe, test, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { resetKit } from '../../test/helpers/storeTestKit.js'

const kit = vi.hoisted(() => ({}))

vi.mock('@/lib/supabase', async () => {
  const { createSupabaseMock } = await import('../../test/helpers/storeTestKit.js')
  return createSupabaseMock(kit)
})
vi.mock('@/lib/realtime.js', async () => {
  const { createRealtimeMock } = await import('../../test/helpers/storeTestKit.js')
  return createRealtimeMock(kit)
})
vi.mock('@/lib/apiClient.js', async () => {
  const { createApiClientMock } = await import('../../test/helpers/storeTestKit.js')
  return createApiClientMock(kit)
})
vi.mock('@/stores/authStore.js', () => ({
  useAuthStore: () => ({ user: { id: 'me' }, displayName: 'Me' }),
}))
vi.mock('@/lib/diceSound.js', () => ({
  playDiceSound: vi.fn(),
  playChatSound: vi.fn(),
}))

import { playChatSound } from '@/lib/diceSound.js'
import { useChatStore } from './chatStore.js'

const msg = (id, createdAt) => ({ id, session_id: 's1', body: id, created_at: createdAt })

describe('chatStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    resetKit(kit)
    vi.mocked(playChatSound).mockClear()
  })

  test('init loads messages sorted oldest-first even though the query is newest-first', async () => {
    kit.responses.chat_messages = {
      data: [msg('m2', '2026-07-04T10:01:00Z'), msg('m1', '2026-07-04T10:00:00Z')],
      error: null,
    }
    const store = useChatStore()
    await store.init('s1')

    expect(store.messages.map(m => m.id)).toEqual(['m1', 'm2'])
  })

  test('incoming realtime message appends, dedupes, and plays the chat sound', async () => {
    const store = useChatStore()
    await store.init('s1')

    kit.channels[0].emitPostgres('chat_messages', 'INSERT', msg('m1', '2026-07-04T10:00:00Z'))
    kit.channels[0].emitPostgres('chat_messages', 'INSERT', msg('m1', '2026-07-04T10:00:00Z'))

    expect(store.messages).toHaveLength(1)
    expect(store.latestMessage.id).toBe('m1')
    expect(playChatSound).toHaveBeenCalledTimes(1)
  })

  test('history is capped at 100 messages', async () => {
    const store = useChatStore()
    await store.init('s1')

    for (let i = 0; i < 105; i++) {
      kit.channels[0].emitPostgres('chat_messages', 'INSERT', msg(`m${i}`, `2026-07-04T10:00:00Z`))
    }

    expect(store.messages).toHaveLength(100)
    expect(store.messages[0].id).toBe('m5')
  })

  test('sendMessage shows an optimistic message then swaps in the server row', async () => {
    kit.api['post /chat-messages'] = body => msg('server-1', '2026-07-04T10:00:00Z', body.body)
    const store = useChatStore()
    await store.init('s1')

    const promise = store.sendMessage('  hello  ')
    expect(store.messages).toHaveLength(1)
    expect(store.messages[0].id).toMatch(/^pending-/)
    expect(store.messages[0].body).toBe('hello')
    await promise

    expect(store.messages).toHaveLength(1)
    expect(store.messages[0].id).toBe('server-1')
  })

  test('a failed send removes the optimistic message', async () => {
    kit.api['post /chat-messages'] = new kit.ApiError('nope', 500)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const store = useChatStore()
    await store.init('s1')

    await store.sendMessage('hello')

    expect(store.messages).toEqual([])
    errorSpy.mockRestore()
  })

  test('blank messages are not sent', async () => {
    const store = useChatStore()
    await store.init('s1')
    await store.sendMessage('   ')

    expect(kit.apiClient.post).not.toHaveBeenCalled()
    expect(store.messages).toEqual([])
  })

  test('refresh merges the server snapshot without duplicating existing messages', async () => {
    kit.responses.chat_messages = { data: [msg('m1', '2026-07-04T10:00:00Z')], error: null }
    const store = useChatStore()
    await store.init('s1')

    kit.responses.chat_messages = {
      data: [msg('m2', '2026-07-04T10:01:00Z'), msg('m1', '2026-07-04T10:00:00Z')],
      error: null,
    }
    await kit.channels[0].reconnect()

    expect(store.messages.map(m => m.id)).toEqual(['m1', 'm2'])
  })

  test('a stale init response for a previous session is discarded', async () => {
    let resolveFirst
    kit.responses.chat_messages = () => new Promise(resolve => (resolveFirst = () => resolve({ data: [msg('old-session', '2026-07-04T09:00:00Z')], error: null })))
    const store = useChatStore()
    const first = store.init('s1')

    kit.responses.chat_messages = { data: [msg('new-session', '2026-07-04T10:00:00Z')], error: null }
    await store.init('s2')
    resolveFirst()
    await first

    expect(store.messages.map(m => m.id)).toEqual(['new-session'])
    const liveChannels = kit.channels.filter(c => !c.removed)
    expect(liveChannels).toHaveLength(1)
    expect(liveChannels[0].name).toBe('session:s2:chat')
  })

  test('cleanup while an init is in flight prevents a zombie channel', async () => {
    let resolveFetch
    kit.responses.chat_messages = () => new Promise(resolve => (resolveFetch = () => resolve({ data: [msg('late', '2026-07-04T10:00:00Z')], error: null })))
    const store = useChatStore()
    const pending = store.init('s1')

    store.cleanup()
    resolveFetch()
    await pending

    expect(kit.channels).toHaveLength(0)
    expect(store.messages).toEqual([])
  })

  test('cleanup removes the channel and clears messages', async () => {
    kit.responses.chat_messages = { data: [msg('m1', '2026-07-04T10:00:00Z')], error: null }
    const store = useChatStore()
    await store.init('s1')
    store.cleanup()

    expect(kit.channels[0].removed).toBe(true)
    expect(store.messages).toEqual([])
    expect(store.latestMessage).toBeNull()
  })
})
