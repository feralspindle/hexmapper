import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest'
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

import { useCompendiumStore } from './compendiumStore.js'

const entry = (id, overrides = {}) => ({
  id,
  session_id: 'sess-1',
  kind: 'gear',
  name: `Item ${id}`,
  data: { cost: '5 sp' },
  ...overrides,
})

describe('compendiumStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    resetKit(kit)
  })

  afterEach(() => {
    useCompendiumStore().cleanup()
  })

  test('init loads entries and splits by kind', async () => {
    kit.api['get /compendium-entries?session_id=sess-1'] = [
      entry('e1'),
      entry('e2', { kind: 'spell', name: 'Light' }),
    ]
    const store = useCompendiumStore()
    await store.init('sess-1')

    expect(store.entries).toHaveLength(2)
    expect(store.gear).toHaveLength(1)
    expect(store.spells).toHaveLength(1)
    expect(kit.channels.map(c => c.name)).toContain('compendium:sess-1')
  })

  test('realtime upsert replaces an existing entry by id', async () => {
    kit.api['get /compendium-entries?session_id=sess-1'] = [entry('e1')]
    const store = useCompendiumStore()
    await store.init('sess-1')
    const channel = kit.channels.find(c => c.name === 'compendium:sess-1')

    await channel.emitPostgres('compendium_entries', 'UPDATE', entry('e1', { data: { cost: '10 sp' } }))
    expect(store.entries).toHaveLength(1)
    expect(store.entries[0].data.cost).toBe('10 sp')
  })

  test('realtime delete removes the entry', async () => {
    kit.api['get /compendium-entries?session_id=sess-1'] = [entry('e1')]
    const store = useCompendiumStore()
    await store.init('sess-1')
    const channel = kit.channels.find(c => c.name === 'compendium:sess-1')

    await channel.emitPostgres('compendium_entries', 'DELETE', null, { id: 'e1' })
    expect(store.entries).toHaveLength(0)
  })

  test('removeEntry deletes optimistically and restores on failure', async () => {
    kit.api['get /compendium-entries?session_id=sess-1'] = [entry('e1')]
    kit.api['delete /compendium-entries/e1'] = () => { throw new kit.ApiError('forbidden', 403) }
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const store = useCompendiumStore()
    await store.init('sess-1')

    await store.removeEntry('e1')
    expect(store.entries).toHaveLength(1)
    errorSpy.mockRestore()
  })
})
