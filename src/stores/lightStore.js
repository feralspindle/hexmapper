import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { realtime } from '@/lib/realtime.js'
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

  let channel = null
  let _sessionId = null
  let _ticker = null
  // one expire report per source per page load; the server is idempotent
  // anyway, this just avoids hammering it from the 500ms tick
  const _reported = new Set()

  const activeSources = computed(() =>
    sources.value.filter(s => !s.expired),
  )

  async function init(sessionId) {
    if (_sessionId === sessionId) return
    cleanup()
    _sessionId = sessionId
    await refresh()
    _subscribe(sessionId)
    _ticker = setInterval(_tick, 500)
  }

  async function refresh() {
    if (!_sessionId) return
    try {
      sources.value = (await apiClient.get(`/light-sources?session_id=${_sessionId}`)) ?? []
    } catch (err) {
      _fail('refresh', err)
    }
  }

  function cleanup() {
    if (channel) { realtime.removeChannel(channel); channel = null }
    if (_ticker) { clearInterval(_ticker); _ticker = null }
    _sessionId = null
    sources.value = []
    error.value = null
    _reported.clear()
  }

  function _subscribe(sessionId) {
    channel = realtime
      .channel(`lights:${sessionId}`, { sessionId, onReconnect: () => refresh() })
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
        const idx = sources.value.findIndex(s => s.id === row.id)
        if (idx === -1) sources.value = [...sources.value, row]
        else sources.value = sources.value.map(s => (s.id === row.id ? row : s))
      })
      .subscribe()
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
    if (!_sessionId) return null
    try {
      const row = await apiClient.post('/light-sources', {
        session_id: _sessionId,
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
