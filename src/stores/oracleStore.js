import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '@/lib/supabase'
import { createSessionChannel } from '@/lib/sessionChannel.js'
import { apiClient, ApiError } from '@/lib/apiClient.js'
import { useAuthStore } from '@/stores/authStore.js'

const HISTORY_LIMIT = 80

export const YES_NO_ODDS = [
  { value: 'impossible', label: 'Impossible' },
  { value: 'unlikely', label: 'Unlikely' },
  { value: 'even', label: '50/50' },
  { value: 'likely', label: 'Likely' },
  { value: 'almost_certain', label: 'Almost Certain' },
]

export const useOracleStore = defineStore('oracle', () => {
  const tables = ref([])
  const sessionLinks = ref([])
  const rows = ref([])
  const rolls = ref([])
  const loading = ref(false)
  const rolling = ref(false)
  const error = ref(null)

  const sessionTableIds = computed(() => new Set(sessionLinks.value.map(link => link.table_id)))
  // what the session plays with: tables anyone at the table has added here
  const sessionTables = computed(() => tables.value.filter(table => sessionTableIds.value.has(table.id)))
  // the user's own library, session or not
  const libraryTables = computed(() => {
    const userId = useAuthStore().user?.id
    return tables.value.filter(table => table.created_by === userId)
  })

  const rowsByTable = computed(() => {
    const map = {}
    for (const row of rows.value) {
      if (!map[row.table_id]) map[row.table_id] = []
      map[row.table_id].push(row)
    }
    for (const list of Object.values(map)) {
      list.sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || new Date(a.created_at) - new Date(b.created_at))
    }
    return map
  })

  const session = createSessionChannel()

  async function init(sessionId) {
    if (session.key === sessionId) return
    cleanup()
    const generation = session.begin(sessionId)
    loading.value = true
    error.value = null
    try {
      await Promise.all([loadTables(sessionId, generation), loadRolls(sessionId, generation)])
      if (!session.isCurrent(generation)) return
      await loadRows()
      if (!session.isCurrent(generation)) return
      subscribe(sessionId)
    } catch (err) {
      error.value = err instanceof ApiError ? err.message : String(err)
    } finally {
      loading.value = false
    }
  }

  async function refresh(generation = session.generation) {
    const sessionId = session.key
    if (!sessionId) return
    try {
      await Promise.all([loadTables(sessionId, generation), loadRolls(sessionId, generation)])
      if (!session.isCurrent(generation)) return
      await loadRows()
    } catch (err) {
      console.error('oracleStore.refresh:', err instanceof ApiError ? err.message : err)
    }
  }

  // tables are user-owned; the session sees the ones members have added to it
  // (session_oracle_tables), so visible tables = my library + everyone's
  // session additions
  async function loadTables(sessionId = session.key, generation = session.generation) {
    const userId = useAuthStore().user?.id
    if (!userId || !sessionId) return
    const [mine, links] = await Promise.all([
      supabase
        .from('oracle_tables')
        .select('*')
        .eq('created_by', userId)
        .order('updated_at', { ascending: false }),
      supabase
        .from('session_oracle_tables')
        .select('*')
        .eq('session_id', sessionId),
    ])
    if (mine.error) throw mine.error
    if (links.error) throw links.error

    const own = mine.data ?? []
    const ownIds = new Set(own.map(table => table.id))
    const foreignIds = (links.data ?? [])
      .map(link => link.table_id)
      .filter(id => !ownIds.has(id))

    let foreign = []
    if (foreignIds.length) {
      const { data, error: foreignError } = await supabase
        .from('oracle_tables')
        .select('*')
        .in('id', foreignIds)
      if (foreignError) throw foreignError
      foreign = data ?? []
    }

    if (!session.isCurrent(generation)) return
    sessionLinks.value = links.data ?? []
    tables.value = [...own, ...foreign]
      .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
  }

  async function loadRows() {
    const ids = tables.value.map(table => table.id)
    if (!ids.length) {
      rows.value = []
      return
    }
    const { data, error: loadError } = await supabase
      .from('oracle_table_rows')
      .select('*')
      .in('table_id', ids)
      .order('position', { ascending: true })
      .order('created_at', { ascending: true })

    if (loadError) throw loadError
    rows.value = data ?? []
  }

  async function loadRolls(sessionId = session.key, generation = session.generation) {
    if (!sessionId) return
    const { data, error: loadError } = await supabase
      .from('oracle_rolls')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false })
      .limit(HISTORY_LIMIT)

    if (loadError) throw loadError
    if (!session.isCurrent(generation)) return
    rolls.value = data ?? []
  }

  function subscribe(sessionId) {
    const userId = useAuthStore().user?.id
    // no server-side filter: relevant tables are mine or attached here, and
    // rls already caps what the socket can deliver
    session.open(`oracle:tables:${sessionId}`, { sessionId, refresh }, ch => ch
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'oracle_tables',
      }, async (event) => {
        if (event.eventType === 'DELETE') {
          tables.value = tables.value.filter(table => table.id !== event.old.id)
          rows.value = rows.value.filter(row => row.table_id !== event.old.id)
          sessionLinks.value = sessionLinks.value.filter(link => link.table_id !== event.old.id)
        } else {
          const relevant = event.new.created_by === userId
            || sessionTableIds.value.has(event.new.id)
            || tables.value.some(table => table.id === event.new.id)
          if (!relevant) return
          upsertById(tables, event.new)
        }
        tables.value = [...tables.value].sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
        await loadRows()
      }))

    session.open(`oracle:links:${sessionId}`, { sessionId, refresh }, ch => ch
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'session_oracle_tables',
        filter: `session_id=eq.${sessionId}`,
      }, async (event) => {
        if (event.eventType === 'DELETE') {
          const gone = sessionLinks.value.find(link => link.id === event.old.id)
          sessionLinks.value = sessionLinks.value.filter(link => link.id !== event.old.id)
          // a partner's table leaves with its link; my own stays in the library
          if (gone && !libraryTables.value.some(table => table.id === gone.table_id)) {
            tables.value = tables.value.filter(table => table.id !== gone.table_id)
            rows.value = rows.value.filter(row => row.table_id !== gone.table_id)
          }
        } else {
          upsertById(sessionLinks, event.new)
          if (!tables.value.some(table => table.id === event.new.table_id)) {
            // someone shared a table this client has never seen; refetch
            await refresh()
          }
        }
      }))

    session.open(`oracle:rows:${sessionId}`, { sessionId }, ch => ch
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'oracle_table_rows',
      }, (event) => {
        const tableIds = new Set(tables.value.map(table => table.id))
        const tableId = event.new?.table_id ?? event.old?.table_id
        if (!tableIds.has(tableId)) return

        if (event.eventType === 'DELETE') {
          rows.value = rows.value.filter(row => row.id !== event.old.id)
        } else {
          upsertById(rows, event.new)
        }
      }))

    session.open(`oracle:rolls:${sessionId}`, { sessionId }, ch => ch
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'oracle_rolls',
        filter: `session_id=eq.${sessionId}`,
      }, ({ new: row }) => {
        if (rolls.value.some(roll => roll.id === row.id)) return
        rolls.value = [row, ...rolls.value].slice(0, HISTORY_LIMIT)
      }))
  }

  // creating from the panel also adds the table to the current session
  async function createTable({ name, description = '', mode = 'weighted' }) {
    return run(async () => {
      const data = await apiClient.post('/oracle-tables', {
        session_id: session.key ?? undefined,
        name,
        description,
        mode,
      }, 'oracle_table_create')
      upsertById(tables, data)
      if (session.key) {
        upsertById(sessionLinks, {
          id: `local-${data.id}`,
          session_id: session.key,
          table_id: data.id,
          added_by: useAuthStore().user?.id,
        })
      }
      return data
    })
  }

  async function attachTable(tableId) {
    if (!session.key) return
    return run(async () => {
      const link = await apiClient.post(`/oracle-tables/${tableId}/attach`, {
        session_id: session.key,
      }, 'oracle_table_attach')
      sessionLinks.value = sessionLinks.value.filter(l => l.table_id !== tableId)
      upsertById(sessionLinks, link)
      return link
    })
  }

  // optimistic like deleteTable: local state first, realtime corrects drift
  async function detachTable(tableId) {
    if (!session.key) return
    sessionLinks.value = sessionLinks.value.filter(link => link.table_id !== tableId)
    const userId = useAuthStore().user?.id
    const table = tables.value.find(t => t.id === tableId)
    if (table && table.created_by !== userId) {
      tables.value = tables.value.filter(t => t.id !== tableId)
      rows.value = rows.value.filter(row => row.table_id !== tableId)
    }
    return run(() => apiClient.delete(
      `/oracle-tables/${tableId}/attach?session_id=${session.key}`,
      'oracle_table_detach',
    ))
  }

  async function updateTable(id, patch) {
    return run(async () => {
      const data = await apiClient.patch(`/oracle-tables/${id}`, patch, 'oracle_table_update')
      upsertById(tables, data)
      return data
    })
  }

  async function deleteTable(id) {
    tables.value = tables.value.filter(table => table.id !== id)
    rows.value = rows.value.filter(row => row.table_id !== id)
    sessionLinks.value = sessionLinks.value.filter(link => link.table_id !== id)
    return run(() => apiClient.delete(`/oracle-tables/${id}`, 'oracle_table_delete'))
  }

  async function createRow(tableId, row) {
    return run(async () => {
      const data = await apiClient.post(`/oracle-tables/${tableId}/rows`, row, 'oracle_table_row_create')
      upsertById(rows, data)
      return data
    })
  }

  async function updateRow(id, patch) {
    return run(async () => {
      const data = await apiClient.patch(`/oracle-table-rows/${id}`, patch, 'oracle_table_row_update')
      upsertById(rows, data)
      return data
    })
  }

  async function deleteRow(id) {
    rows.value = rows.value.filter(row => row.id !== id)
    return run(() => apiClient.delete(`/oracle-table-rows/${id}`, 'oracle_table_row_delete'))
  }

  async function listPacks() {
    return run(() => apiClient.get('/oracle-packs'))
  }

  async function installPack(packId) {
    if (!session.key) return
    return run(async () => {
      const data = await apiClient.post('/oracle-packs/install', {
        session_id: session.key,
        pack_id: packId,
      }, 'oracle_pack_install')
      // one install creates a lot of tables and rows, cheaper to refetch than
      // to wait on the realtime trickle
      await refresh()
      return data
    })
  }

  async function importTables({ tables: bundle, replace = false }) {
    return run(async () => {
      const data = await apiClient.post('/oracle-tables/import', {
        session_id: session.key ?? undefined,
        replace,
        tables: bundle,
      }, 'oracle_tables_import')
      await refresh()
      return data
    })
  }

  async function rollYesNo({ question, odds }) {
    return roll({ kind: 'yes_no', question, odds })
  }

  async function rollEventPrompt({ question } = {}) {
    return roll({ kind: 'event_prompt', question })
  }

  async function rollTable(tableId, question = '') {
    return roll({ kind: 'table', table_id: tableId, question })
  }

  async function roll(payload) {
    if (!session.key || rolling.value) return
    rolling.value = true
    return run(async () => {
      const data = await apiClient.post('/oracle-rolls', {
        session_id: session.key,
        ...payload,
      }, `oracle_roll_${payload.kind}`)
      if (!rolls.value.some(roll => roll.id === data.id)) {
        rolls.value = [data, ...rolls.value].slice(0, HISTORY_LIMIT)
      }
      return data
    }).finally(() => {
      rolling.value = false
    })
  }

  async function run(fn) {
    error.value = null
    try {
      return await fn()
    } catch (err) {
      error.value = err instanceof ApiError ? err.message : String(err)
      console.error('oracleStore:', error.value)
      return null
    }
  }

  function upsertById(listRef, row) {
    const idx = listRef.value.findIndex(item => item.id === row.id)
    if (idx === -1) {
      listRef.value = [row, ...listRef.value]
    } else {
      listRef.value = listRef.value.map(item => item.id === row.id ? row : item)
    }
  }

  function cleanup() {
    session.close()
    tables.value = []
    sessionLinks.value = []
    rows.value = []
    rolls.value = []
    loading.value = false
    rolling.value = false
    error.value = null
  }

  return {
    tables,
    sessionLinks,
    sessionTableIds,
    sessionTables,
    libraryTables,
    rows,
    rowsByTable,
    rolls,
    loading,
    rolling,
    error,
    init,
    refresh,
    cleanup,
    loadRows,
    createTable,
    updateTable,
    deleteTable,
    attachTable,
    detachTable,
    createRow,
    updateRow,
    deleteRow,
    listPacks,
    installPack,
    importTables,
    rollYesNo,
    rollEventPrompt,
    rollTable,
  }
})
