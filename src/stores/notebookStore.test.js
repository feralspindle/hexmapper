import { describe, test, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { resetKit } from '../../test/helpers/storeTestKit.js'

const kit = vi.hoisted(() => ({ questToasts: [] }))

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
vi.mock('@/composables/useQuestToast.js', () => ({
  useQuestToast: () => ({ push: toast => kit.questToasts.push(toast) }),
}))

import { useNotebookStore } from './notebookStore.js'

const quest = (id, overrides = {}) => ({ id, session_id: 's1', title: `Quest ${id}`, completed: false, ...overrides })
const note = (id, overrides = {}) => ({ id, session_id: 's1', body: `Note ${id}`, ...overrides })

function channelNamed(prefix) {
  return kit.channels.find(c => c.name.startsWith(prefix))
}

describe('notebookStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    resetKit(kit)
    kit.questToasts = []
    vi.useRealTimers()
  })

  test('init loads quests and notes and opens three channels', async () => {
    kit.responses.party_quests = { data: [quest('q1')], error: null }
    kit.responses.party_session_notes = { data: [note('n1')], error: null }
    const store = useNotebookStore()
    await store.init('s1')

    expect(store.quests.map(q => q.id)).toEqual(['q1'])
    expect(store.notes.map(n => n.id)).toEqual(['n1'])
    expect(kit.channels).toHaveLength(3)
  })

  test('quest INSERT/UPDATE/DELETE events keep the list in sync', async () => {
    const store = useNotebookStore()
    await store.init('s1')
    const channel = channelNamed('notebook:quests')

    channel.emitPostgres('party_quests', 'INSERT', quest('q1'))
    channel.emitPostgres('party_quests', 'INSERT', quest('q1'))
    expect(store.quests).toHaveLength(1)

    channel.emitPostgres('party_quests', 'UPDATE', quest('q1', { title: 'Renamed' }))
    expect(store.quests[0].title).toBe('Renamed')

    channel.emitPostgres('party_quests', 'DELETE', {}, { id: 'q1' })
    expect(store.quests).toEqual([])
  })

  test('a quest completed by someone else fires the quest toast exactly once', async () => {
    kit.responses.party_quests = { data: [quest('q1')], error: null }
    const store = useNotebookStore()
    await store.init('s1')
    const channel = channelNamed('notebook:quests')

    channel.emitPostgres('party_quests', 'UPDATE', quest('q1', { completed: true, rewards: ['50 gp'] }))
    channel.emitPostgres('party_quests', 'UPDATE', quest('q1', { completed: true, rewards: ['50 gp'] }))

    expect(kit.questToasts).toEqual([{ title: 'Quest q1', rewards: ['50 gp'] }])
    expect(store.quests[0].completed).toBe(true)
  })

  test('echoes tagged with this client id are ignored', async () => {
    kit.api['post /party-quests'] = body => quest('q1', { source_client: body.source_client })
    const store = useNotebookStore()
    await store.init('s1')
    const created = await store.addQuest()
    const channel = channelNamed('notebook:quests')

    channel.emitPostgres('party_quests', 'INSERT', quest('q1', { source_client: created.source_client }))
    channel.emitPostgres('party_quests', 'UPDATE', quest('q1', { title: 'stomped', source_client: created.source_client }))

    expect(store.quests).toHaveLength(1)
    expect(store.quests[0].title).toBe('Quest q1')
  })

  test('updateQuest patches optimistically and posts the source_client tag', async () => {
    kit.responses.party_quests = { data: [quest('q1')], error: null }
    const store = useNotebookStore()
    await store.init('s1')

    await store.updateQuest('q1', { title: 'New Title' })

    expect(store.quests[0].title).toBe('New Title')
    expect(kit.apiClient.patch).toHaveBeenCalledWith('/party-quests/q1', expect.objectContaining({ title: 'New Title', source_client: expect.any(String) }))
  })

  test('note events unshift newest-first and dedupe', async () => {
    kit.responses.party_session_notes = { data: [note('n1')], error: null }
    const store = useNotebookStore()
    await store.init('s1')
    const channel = channelNamed('notebook:notes')

    channel.emitPostgres('party_session_notes', 'INSERT', note('n2'))
    expect(store.notes.map(n => n.id)).toEqual(['n2', 'n1'])

    channel.emitPostgres('party_session_notes', 'DELETE', {}, { id: 'n1' })
    expect(store.notes.map(n => n.id)).toEqual(['n2'])
  })

  describe('editing indicators', () => {
    test('an editing broadcast from another user shows their name, and done clears it', async () => {
      const store = useNotebookStore()
      await store.init('s1')
      const channel = channelNamed('notebook:editing')

      channel.emitBroadcast('editing', { kind: 'quest', id: 'q1', user_id: 'p1', name: 'Player One' })
      expect(store.editingBy['quest:q1']).toEqual(['Player One'])

      channel.emitBroadcast('done', { kind: 'quest', id: 'q1', user_id: 'p1' })
      expect(store.editingBy['quest:q1']).toBeUndefined()
    })

    test('own editing broadcasts are ignored', async () => {
      const store = useNotebookStore()
      await store.init('s1')
      const channel = channelNamed('notebook:editing')

      channel.emitBroadcast('editing', { kind: 'quest', id: 'q1', user_id: 'me', name: 'Me' })

      expect(store.editingBy).toEqual({})
    })

    test('a stale editing indicator expires after 30s if done never arrives', async () => {
      vi.useFakeTimers()
      const store = useNotebookStore()
      await store.init('s1')
      const channel = channelNamed('notebook:editing')

      channel.emitBroadcast('editing', { kind: 'note', id: 'n1', user_id: 'p1', name: 'Player One' })
      expect(store.editingBy['note:n1']).toEqual(['Player One'])

      await vi.advanceTimersByTimeAsync(30_000)
      expect(store.editingBy['note:n1']).toBeUndefined()
    })

    test('setEditing broadcasts to the editing channel', async () => {
      const store = useNotebookStore()
      await store.init('s1')
      const channel = channelNamed('notebook:editing')

      store.setEditing('quest', 'q1')

      expect(channel.send).toHaveBeenCalledWith(expect.objectContaining({
        event: 'editing',
        payload: expect.objectContaining({ kind: 'quest', id: 'q1', user_id: 'me' }),
      }))
    })
  })

  test('failed deletes are logged but the item stays removed locally', async () => {
    kit.responses.party_quests = { data: [quest('q1')], error: null }
    kit.api['delete /party-quests/q1'] = new kit.ApiError('nope', 500)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const store = useNotebookStore()
    await store.init('s1')

    await store.deleteQuest('q1')

    expect(store.quests).toEqual([])
    errorSpy.mockRestore()
  })

  test('a stale init never subscribes channels for the abandoned session', async () => {
    let resolveFirst
    let questCalls = 0
    kit.responses.party_quests = () => {
      questCalls += 1
      if (questCalls === 1) return new Promise(resolve => (resolveFirst = () => resolve({ data: [], error: null })))
      return { data: [], error: null }
    }
    const store = useNotebookStore()
    const first = store.init('s1')

    await store.init('s2')
    resolveFirst()
    await first

    const liveChannels = kit.channels.filter(c => !c.removed)
    expect(liveChannels).toHaveLength(3)
    expect(liveChannels.every(c => c.name.includes(':s2'))).toBe(true)
  })

  test('cleanup tears down all channels and timers', async () => {
    const store = useNotebookStore()
    await store.init('s1')
    store.cleanup()

    expect(kit.channels.every(c => c.removed)).toBe(true)
    expect(store.quests).toEqual([])
    expect(store.notes).toEqual([])
    expect(store.editingBy).toEqual({})
  })
})
