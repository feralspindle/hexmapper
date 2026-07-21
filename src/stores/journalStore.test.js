import { describe, test, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { resetKit } from '../../test/helpers/storeTestKit.js'

const kit = vi.hoisted(() => ({}))

vi.mock('@/lib/realtime.js', async () => {
  const { createRealtimeMock } = await import('../../test/helpers/storeTestKit.js')
  return createRealtimeMock(kit)
})
vi.mock('@/lib/apiClient.js', async () => {
  const { createApiClientMock } = await import('../../test/helpers/storeTestKit.js')
  return createApiClientMock(kit)
})
vi.mock('@/stores/calendarStore.js', () => ({
  useCalendarStore: () => ({ settings: { current_year: 2, current_month: 3, current_day: 14 } }),
}))

import { useJournalStore } from './journalStore.js'

const entry = (overrides = {}) => ({
  id: 'e1',
  session_id: 'sess-1',
  author_user_id: 'me',
  author_name: 'Me',
  kind: 'prose',
  body: 'we made camp',
  pin: null,
  game_date: { year: 2, month: 3, day: 14 },
  created_at: '2026-07-07T01:00:00Z',
  ...overrides,
})

describe('journalStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    resetKit(kit)
  })

  test('init loads entries and subscribes', async () => {
    kit.api['get /journal-entries?session_id=sess-1'] = [entry()]
    const store = useJournalStore()
    await store.init('sess-1')

    expect(store.entries).toHaveLength(1)
    expect(kit.channels.map(c => c.name)).toContain('journal:sess-1')
  })

  test('addProse stamps the in-game date', async () => {
    kit.api['get /journal-entries?session_id=sess-1'] = []
    const create = vi.fn(body => entry({ id: 'new', body: body.body, game_date: body.game_date }))
    kit.api['post /journal-entries'] = create
    const store = useJournalStore()
    await store.init('sess-1')

    await store.addProse('we made camp')

    expect(create.mock.calls[0][0].game_date).toEqual({ year: 2, month: 3, day: 14 })
    expect(store.entries).toHaveLength(1)
  })

  test('addProse can speak as a character', async () => {
    kit.api['get /journal-entries?session_id=sess-1'] = []
    const create = vi.fn(body => entry({ id: 'new', body: body.body, character_id: body.character_id, character_name: 'Wren' }))
    kit.api['post /journal-entries'] = create
    const store = useJournalStore()
    await store.init('sess-1')

    await store.addProse('crosses the bridge first', { characterId: 'char-1' })

    expect(create.mock.calls[0][0].character_id).toBe('char-1')
    expect(store.entries[0].character_name).toBe('Wren')
  })

  test('a sparse realtime UPDATE merges into the existing entry', async () => {
    kit.api['get /journal-entries?session_id=sess-1'] = [entry()]
    const store = useJournalStore()
    await store.init('sess-1')

    const channel = kit.channels.find(c => c.name === 'journal:sess-1')
    channel.emitPostgres('journal_entries', 'UPDATE', {
      id: 'e1',
      body: 'we made camp (edited)',
      created_at: '2026-07-08T09:00:00Z',
    })

    const updated = store.entries[0]
    expect(updated.body).toBe('we made camp (edited)')
    expect(updated.kind).toBe('prose')
    expect(updated.author_name).toBe('Me')
    expect(updated.created_at).toBe('2026-07-07T01:00:00Z')
  })

  test('realtime inserts land sorted by creation time', async () => {
    kit.api['get /journal-entries?session_id=sess-1'] = [entry({ id: 'b', created_at: '2026-07-07T02:00:00Z' })]
    const store = useJournalStore()
    await store.init('sess-1')

    const channel = kit.channels.find(c => c.name === 'journal:sess-1')
    channel.emitPostgres('journal_entries', 'INSERT', entry({ id: 'a', created_at: '2026-07-07T01:00:00Z' }))

    expect(store.entries.map(e => e.id)).toEqual(['a', 'b'])

    channel.emitPostgres('journal_entries', 'DELETE', {}, { id: 'a' })
    expect(store.entries.map(e => e.id)).toEqual(['b'])
  })

  test('exportMarkdown groups by day and quotes pins', async () => {
    kit.api['get /journal-entries?session_id=sess-1'] = [
      entry({ id: 'p1', body: 'we made camp' }),
      entry({
        id: 'p2',
        kind: 'pin',
        body: '',
        pin: { source: 'oracle', label: 'Yes / No', text: 'Yes, but... (43)', detail: 'Is the bridge safe?' },
        created_at: '2026-07-07T01:10:00Z',
      }),
      entry({ id: 'p3', body: 'crossed anyway', game_date: { year: 2, month: 3, day: 15 }, created_at: '2026-07-07T02:00:00Z' }),
      entry({ id: 'p4', body: 'I told you so', character_name: 'Wren', game_date: { year: 2, month: 3, day: 15 }, created_at: '2026-07-07T02:10:00Z' }),
    ]
    const store = useJournalStore()
    await store.init('sess-1')

    const md = store.exportMarkdown('The Sunken Keep')
    expect(md).toContain('# The Sunken Keep journal')
    expect(md).toContain('## day 2-3-14')
    expect(md).toContain('## day 2-3-15')
    expect(md).toContain('> **Yes / No**: Yes, but... (43)')
    expect(md).toContain('we made camp')
    expect(md).toContain('**Wren:** I told you so')
    expect(md.indexOf('## day 2-3-14')).toBeLessThan(md.indexOf('## day 2-3-15'))
  })
})
