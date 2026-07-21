import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { createSessionChannel } from '@/lib/sessionChannel.js'
import { apiClient, ApiError } from '@/lib/apiClient.js'

// server holds the anchors (elapsed_ms + started_at), every client derives the
// same remaining time locally. presets mirror shadowdark-ish durations but
// everything is editable at create time.
export const LIGHT_PRESETS = [
  { kind: 'torch', label: 'Torch', duration_ms: 60 * 60 * 1000, duration_rounds: 10 },
  { kind: 'lantern', label: 'Lantern', duration_ms: 6 * 60 * 60 * 1000, duration_rounds: 60 },
  { kind: 'light_spell', label: 'Light spell', duration_ms: 60 * 60 * 1000, duration_rounds: 10 },
  { kind: 'custom', label: 'Custom', duration_ms: 30 * 60 * 1000, duration_rounds: 5 },
]

export const useLightStore = defineStore('light', () => {
  const sources = ref([])
  const error = ref(null)
  const now = ref(Date.now())

  const session = createSessionChannel()
  let _ticker = null
  // one expire report per source per page load; the server is idempotent
  // anyway, this just avoids hammering it from the 500ms tick
  const _reported = new Set()

  const activeSources = computed(() =>
    sources.value.filter(s => !s.expired),
  )

  async function init(sessionId) {
    if (session.key === sessionId) return
    cleanup()
    const generation = session.begin(sessionId)
    session.open(`lights:${sessionId}`, { sessionId, refresh }, ch => ch
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'light_sources',
        filter: `session_id=eq.${sessionId}`,
      }, (payload) => {
        if (payload.eventType === 'DELETE') {
          sources.value = sources.value.filter(s => s.id !== payload.old?.id)
          return
        }
        const row = payload.new
        if (!row?.id) return
        const existing = sources.value.find(s => s.id === row.id)
        if (existing) {
          // updated events carry only the changed anchors plus the event time
          // as created_at; merge so name/kind/durations survive the echo
          const merged = { ...existing, ...row, created_at: existing.created_at }
          sources.value = sources.value.map(s => (s.id === row.id ? merged : s))
        } else if (payload.eventType === 'INSERT') {
          // created events omit the counter columns the table defaults
          sources.value = [...sources.value, { elapsed_ms: 0, running: false, started_at: null, rounds_elapsed: 0, expired: false, ...row }]
        } else {
          // an update for a source this client never loaded is only a fragment
          void refresh()
        }
      }))
    await refresh(generation)
    _ticker = setInterval(_tick, 500)
  }

  async function refresh(generation = session.generation) {
    const sessionId = session.key
    if (!sessionId) return
    try {
      const rows = (await apiClient.get(`/light-sources?session_id=${sessionId}`)) ?? []
      if (!session.isCurrent(generation)) return
      sources.value = rows
    } catch (err) {
      _fail('refresh', err)
    }
  }

  function cleanup() {
    session.close()
    if (_ticker) { clearInterval(_ticker); _ticker = null }
    sources.value = []
    error.value = null
    _reported.clear()
  }

  // remaining ms for a real_time source, remaining rounds for a rounds source
  function remaining(source) {
    if (source.mode === 'rounds') {
      return Math.max(0, source.duration_rounds - source.rounds_elapsed)
    }
    let elapsed = source.elapsed_ms
    if (source.running && source.started_at) {
      elapsed += Math.max(0, now.value - new Date(source.started_at).getTime())
    }
    return Math.max(0, source.duration_ms - elapsed)
  }

  function _tick() {
    now.value = Date.now()
    for (const source of sources.value) {
      if (
        source.mode === 'real_time' &&
        source.running &&
        !source.expired &&
        remaining(source) <= 0 &&
        !_reported.has(source.id)
      ) {
        _reported.add(source.id)
        void reportExpiry(source.id)
      }
    }
  }

  async function reportExpiry(id) {
    try {
      const row = await apiClient.post(`/light-sources/${id}/expire`, undefined, 'light_expired')
      _apply(row)
    } catch (err) {
      // a race with another tab reporting first lands here, harmless
      _fail('expire', err)
    }
  }

  async function createSource(payload) {
    if (!session.key) return null
    try {
      const row = await apiClient.post('/light-sources', {
        session_id: session.key,
        ...payload,
      }, 'light_create')
      _apply(row)
      return row
    } catch (err) {
      _fail('create', err)
      return null
    }
  }

  async function control(id, action) {
    try {
      const row = await apiClient.post(`/light-sources/${id}/control`, { action }, `light_${action}`)
      if (action === 'reset') _reported.delete(id)
      _apply(row)
      return row
    } catch (err) {
      _fail('control', err)
      return null
    }
  }

  // rounds-mode decrement, the crawling round tracker calls tickAll
  async function tick(id, rounds = 1) {
    try {
      const row = await apiClient.post(`/light-sources/${id}/tick`, { rounds }, 'light_tick')
      _apply(row)
      return row
    } catch (err) {
      _fail('tick', err)
      return null
    }
  }

  async function tickAll(rounds = 1) {
    const targets = sources.value.filter(s => s.mode === 'rounds' && !s.expired)
    await Promise.all(targets.map(s => tick(s.id, rounds)))
  }

  async function removeSource(id) {
    sources.value = sources.value.filter(s => s.id !== id)
    try {
      await apiClient.delete(`/light-sources/${id}`, 'light_delete')
    } catch (err) {
      _fail('delete', err)
      await refresh()
    }
  }

  function _apply(row) {
    if (!row?.id) return
    const idx = sources.value.findIndex(s => s.id === row.id)
    if (idx === -1) sources.value = [...sources.value, row]
    else sources.value = sources.value.map(s => (s.id === row.id ? row : s))
  }

  function _fail(what, err) {
    error.value = err instanceof ApiError ? err.message : String(err)
    console.error(`lightStore.${what}:`, error.value)
  }

  return {
    sources,
    activeSources,
    error,
    now,
    init,
    refresh,
    cleanup,
    remaining,
    createSource,
    control,
    tick,
    tickAll,
    removeSource,
    reportExpiry,
  }
})
