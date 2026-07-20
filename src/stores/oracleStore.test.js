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

import { useOracleStore } from './oracleStore.js'
import { useAuthStore } from './authStore.js'

const table = (id, overrides = {}) => ({ id, created_by: 'u1', name: `Table ${id}`, updated_at: '2026-07-01T00:00:00Z', ...overrides })
const row = (id, tableId, overrides = {}) => ({ id, table_id: tableId, text: `Row ${id}`, position: 0, created_at: '2026-07-01T00:00:00Z', ...overrides })
const oracleRoll = (id, overrides = {}) => ({ id, session_id: 's1', kind: 'yes_no', created_at: '2026-07-01T00:00:00Z', ...overrides })

describe('oracleStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    resetKit(kit)
    useAuthStore().user = { id: 'u1' }
  })

  test('init loads tables, their rows, and roll history', async () => {
    kit.responses.oracle_tables = { data: [table('t1')], error: null }
    kit.responses.oracle_table_rows = { data: [row('r1', 't1'), row('r2', 't1', { position: 1 })], error: null }
    kit.responses.oracle_rolls = { data: [oracleRoll('roll1')], error: null }
    const store = useOracleStore()
    await store.init('s1')

    expect(store.tables.map(t => t.id)).toEqual(['t1'])
    expect(store.rowsByTable.t1.map(r => r.id)).toEqual(['r1', 'r2'])
    expect(store.rolls.map(r => r.id)).toEqual(['roll1'])
    expect(store.error).toBeNull()
    expect(kit.channels).toHaveLength(3)
  })

  test('a failed load surfaces the error instead of showing an empty oracle', async () => {
    kit.responses.oracle_tables = { data: null, error: { message: 'blocked' } }
    const store = useOracleStore()
    await store.init('s1')

    expect(store.error).toBeTruthy()
    expect(store.loading).toBe(false)
  })

  test('rowsByTable sorts by position then created_at', async () => {
    kit.responses.oracle_tables = { data: [table('t1')], error: null }
    kit.responses.oracle_table_rows = {
      data: [
        row('later', 't1', { position: 1, created_at: '2026-07-02T00:00:00Z' }),
        row('tie-b', 't1', { position: 0, created_at: '2026-07-02T00:00:00Z' }),
        row('tie-a', 't1', { position: 0, created_at: '2026-07-01T00:00:00Z' }),
      ],
      error: null,
    }
    const store = useOracleStore()
    await store.init('s1')

    expect(store.rowsByTable.t1.map(r => r.id)).toEqual(['tie-a', 'tie-b', 'later'])
  })

  test('deleting a table also drops its rows locally', async () => {
    kit.responses.oracle_tables = { data: [table('t1'), table('t2')], error: null }
    kit.responses.oracle_table_rows = { data: [row('r1', 't1'), row('r2', 't2')], error: null }
    const store = useOracleStore()
    await store.init('s1')

    await store.deleteTable('t1')

    expect(store.tables.map(t => t.id)).toEqual(['t2'])
    expect(store.rows.map(r => r.id)).toEqual(['r2'])
  })

  test('a table DELETE arriving over realtime also removes its rows', async () => {
    kit.responses.oracle_tables = { data: [table('t1')], error: null }
    kit.responses.oracle_table_rows = { data: [row('r1', 't1')], error: null }
    const store = useOracleStore()
    await store.init('s1')

    kit.responses.oracle_table_rows = { data: [], error: null }
    const tablesChannel = kit.channels.find(c => c.name === 'oracle:tables:s1')
    tablesChannel.emitPostgres('oracle_tables', 'DELETE', {}, { id: 't1' })
    await vi.waitFor(() => {
      if (store.rows.length) throw new Error('rows not yet cleared')
    })

    expect(store.tables).toEqual([])
    expect(store.rows).toEqual([])
  })

  test('row events for unknown tables are ignored', async () => {
    kit.responses.oracle_tables = { data: [table('t1')], error: null }
    const store = useOracleStore()
    await store.init('s1')

    const rowsChannel = kit.channels.find(c => c.name === 'oracle:rows:s1')
    rowsChannel.emitPostgres('oracle_table_rows', 'INSERT', row('r-foreign', 'someone-elses-table'))
    rowsChannel.emitPostgres('oracle_table_rows', 'INSERT', row('r-mine', 't1'))

    expect(store.rows.map(r => r.id)).toEqual(['r-mine'])
  })

  test('roll INSERTs are deduped against the API echo', async () => {
    kit.api['post /oracle-rolls'] = body => oracleRoll('roll-new', body)
    const store = useOracleStore()
    await store.init('s1')

    await store.rollYesNo({ question: 'Is it trapped?', odds: 'likely' })
    const rollsChannel = kit.channels.find(c => c.name === 'oracle:rolls:s1')
    rollsChannel.emitPostgres('oracle_rolls', 'INSERT', oracleRoll('roll-new'))

    expect(store.rolls.filter(r => r.id === 'roll-new')).toHaveLength(1)
  })

  test('a second roll while one is in flight is dropped', async () => {
    let resolveRoll
    kit.api['post /oracle-rolls'] = () => new Promise(resolve => (resolveRoll = () => resolve(oracleRoll('only'))))
    const store = useOracleStore()
    await store.init('s1')

    const first = store.rollTable('t1', 'What lurks here?')
    expect(store.rolling).toBe(true)
    await store.rollYesNo({ question: 'again?', odds: 'even' })
    resolveRoll()
    await first

    expect(kit.apiClient.post).toHaveBeenCalledTimes(1)
    expect(store.rolling).toBe(false)
  })

  test('a failed roll records the error and resets rolling', async () => {
    kit.api['post /oracle-rolls'] = new kit.ApiError('rate limited', 429)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const store = useOracleStore()
    await store.init('s1')

    const result = await store.rollEventPrompt({ question: 'omen?' })

    expect(result).toBeNull()
    expect(store.error).toBe('rate limited')
    expect(store.rolling).toBe(false)
    errorSpy.mockRestore()
  })

  test('createTable/createRow upsert results into local state', async () => {
    kit.api['post /oracle-tables'] = body => table('t-new', body)
    kit.api['post /oracle-tables/t-new/rows'] = body => row('r-new', 't-new', body)
    const store = useOracleStore()
    await store.init('s1')

    await store.createTable({ name: 'Weather' })
    await store.createRow('t-new', { text: 'Rain' })

    expect(store.tables.map(t => t.id)).toEqual(['t-new'])
    expect(store.rows.map(r => r.id)).toEqual(['r-new'])
  })

  test('a stale init never subscribes channels for the abandoned session', async () => {
    let resolveFirst
    let tableCalls = 0
    kit.responses.oracle_tables = () => {
      tableCalls += 1
      if (tableCalls === 1) return new Promise(resolve => (resolveFirst = () => resolve({ data: [], error: null })))
      return { data: [], error: null }
    }
    const store = useOracleStore()
    const first = store.init('s1')

    await store.init('s2')
    resolveFirst()
    await first

    const liveChannels = kit.channels.filter(c => !c.removed)
    expect(liveChannels).toHaveLength(3)
    expect(liveChannels.every(c => c.name.endsWith(':s2'))).toBe(true)
  })

  test('cleanup removes channels and clears state', async () => {
    kit.responses.oracle_tables = { data: [table('t1')], error: null }
    const store = useOracleStore()
    await store.init('s1')
    store.cleanup()

    expect(kit.channels.every(c => c.removed)).toBe(true)
    expect(store.tables).toEqual([])
    expect(store.rolls).toEqual([])
  })
})
