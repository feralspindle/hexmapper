import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '@/lib/supabase'
import { realtime } from '@/lib/realtime.js'
import { apiClient, ApiError } from '@/lib/apiClient.js'

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
  const rows = ref([])
  const rolls = ref([])
  const loading = ref(false)
  const rolling = ref(false)
  const error = ref(null)

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

  let _sessionId = null
  let tablesChannel = null
  let rowsChannel = null
  let rollsChannel = null

  async function init(sessionId) {
    if (_sessionId === sessionId) return
    cleanup()
    _sessionId = sessionId
    loading.value = true
    error.value = null
    try {
      await Promise.all([loadTables(sessionId), loadRolls(sessionId)])
      if (_sessionId !== sessionId) return
      await loadRows()
      if (_sessionId !== sessionId) return
      subscribe(sessionId)
    } catch (err) {
      error.value = err instanceof ApiError ? err.message : String(err)
    } finally {
      loading.value = false
    }
  }

  async function refresh() {
    const sessionId = _sessionId
    if (!sessionId) return
    try {
      await Promise.all([loadTables(sessionId), loadRolls(sessionId)])
      if (_sessionId !== sessionId) return
      await loadRows()
    } catch (err) {
      console.error('oracleStore.refresh:', err instanceof ApiError ? err.message : err)
    }
  }

  async function loadTables(sessionId = _sessionId) {
    if (!sessionId) return
    const { data, error: loadError } = await supabase
      .from('oracle_tables')
      .select('*')
      .eq('session_id', sessionId)
      .order('updated_at', { ascending: false })

    if (loadError) throw loadError
    if (_sessionId !== sessionId) return
    tables.value = data ?? []
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

  async function loadRolls(sessionId = _sessionId) {
    if (!sessionId) return
    const { data, error: loadError } = await supabase
      .from('oracle_rolls')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false })
      .limit(HISTORY_LIMIT)

    if (loadError) throw loadError
    if (_sessionId !== sessionId) return
    rolls.value = data ?? []
  }

  function subscribe(sessionId) {
    tablesChannel = realtime
      .channel(`oracle:tables:${sessionId}`, { sessionId, onReconnect: () => refresh() })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'oracle_tables',
        filter: `session_id=eq.${sessionId}`,
      }, async (event) => {
        if (event.eventType === 'INSERT') {
          upsertById(tables, event.new)
        } else if (event.eventType === 'UPDATE') {
          upsertById(tables, event.new)
        } else if (event.eventType === 'DELETE') {
          tables.value = tables.value.filter(table => table.id !== event.old.id)
          rows.value = rows.value.filter(row => row.table_id !== event.old.id)
        }
        tables.value = [...tables.value].sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
        await loadRows()
      })
      .subscribe()

    rowsChannel = realtime
      .channel(`oracle:rows:${sessionId}`, { sessionId })
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
      })
      .subscribe()

    rollsChannel = realtime
      .channel(`oracle:rolls:${sessionId}`, { sessionId })
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'oracle_rolls',
        filter: `session_id=eq.${sessionId}`,
      }, ({ new: row }) => {
        if (rolls.value.some(roll => roll.id === row.id)) return
        rolls.value = [row, ...rolls.value].slice(0, HISTORY_LIMIT)
      })
      .subscribe()
  }

  async function createTable({ name, description = '', mode = 'weighted' }) {
    if (!_sessionId) return
    return run(async () => {
      const data = await apiClient.post('/oracle-tables', {
        session_id: _sessionId,
        name,
        description,
        mode,
      }, 'oracle_table_create')
      upsertById(tables, data)
      return data
    })
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
    if (!_sessionId) return
    return run(async () => {
      const data = await apiClient.post('/oracle-packs/install', {
        session_id: _sessionId,
        pack_id: packId,
      }, 'oracle_pack_install')
      // one install creates a lot of tables and rows, cheaper to refetch than
      // to wait on the realtime trickle
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
    if (!_sessionId || rolling.value) return
    rolling.value = true
    return run(async () => {
      const data = await apiClient.post('/oracle-rolls', {
        session_id: _sessionId,
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
    if (tablesChannel) { realtime.removeChannel(tablesChannel); tablesChannel = null }
    if (rowsChannel) { realtime.removeChannel(rowsChannel); rowsChannel = null }
    if (rollsChannel) { realtime.removeChannel(rollsChannel); rollsChannel = null }
    _sessionId = null
    tables.value = []
    rows.value = []
    rolls.value = []
    loading.value = false
    rolling.value = false
    error.value = null
  }

  return {
    tables,
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
    createRow,
    updateRow,
    deleteRow,
    listPacks,
    installPack,
    rollYesNo,
    rollEventPrompt,
    rollTable,
  }
})
