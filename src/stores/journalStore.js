import { defineStore } from 'pinia'
import { ref } from 'vue'
import { realtime } from '@/lib/realtime.js'
import { apiClient, ApiError } from '@/lib/apiClient.js'
import { useCalendarStore } from '@/stores/calendarStore.js'

// the record of play: prose entries and pinned rolls in one chronological
// stream, stamped with the in-game date when the calendar has one
export const useJournalStore = defineStore('journal', () => {
  const entries = ref([])
  const error = ref(null)

  let channel = null
  let _sessionId = null

  async function init(sessionId) {
    if (_sessionId === sessionId) return
    cleanup()
    _sessionId = sessionId
    await refresh()
    _subscribe(sessionId)
  }

  async function refresh() {
    if (!_sessionId) return
    try {
      entries.value = (await apiClient.get(`/journal-entries?session_id=${_sessionId}`)) ?? []
    } catch (err) {
      _fail('refresh', err)
    }
  }

  function cleanup() {
    if (channel) { realtime.removeChannel(channel); channel = null }
    _sessionId = null
    entries.value = []
    error.value = null
  }

  function _subscribe(sessionId) {
    channel = realtime
      .channel(`journal:${sessionId}`, { sessionId, onReconnect: () => refresh() })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'journal_entries',
        filter: `session_id=eq.${sessionId}`,
      }, (payload) => {
        if (payload.eventType === 'DELETE') {
          entries.value = entries.value.filter(e => e.id !== payload.old?.id)
          return
        }
        _apply(payload.new)
      })
      .subscribe()
  }

  function _gameDate() {
    const settings = useCalendarStore().settings
    if (!settings?.current_year) return null
    return {
      year: settings.current_year,
      month: settings.current_month,
      day: settings.current_day,
    }
  }

  async function addProse(body) {
    if (!_sessionId || !body?.trim()) return null
    return _create({ kind: 'prose', body: body.trim() })
  }

  // pin = {source: 'oracle'|'dice', label, text, detail?} - a snapshot, not a
  // reference, so the journal survives history trimming
  async function pin(pinPayload) {
    if (!_sessionId) return null
    return _create({ kind: 'pin', pin: pinPayload })
  }

  async function _create(payload) {
    try {
      const row = await apiClient.post('/journal-entries', {
        session_id: _sessionId,
        game_date: _gameDate(),
        ...payload,
      }, `journal_${payload.kind}`)
      _apply(row)
      return row
    } catch (err) {
      _fail('create', err)
      return null
    }
  }

  async function updateEntry(id, body) {
    try {
      const row = await apiClient.patch(`/journal-entries/${id}`, { body }, 'journal_update')
      _apply(row)
      return row
    } catch (err) {
      _fail('update', err)
      return null
    }
  }

  async function removeEntry(id) {
    entries.value = entries.value.filter(e => e.id !== id)
    try {
      await apiClient.delete(`/journal-entries/${id}`, 'journal_delete')
    } catch (err) {
      _fail('delete', err)
      await refresh()
    }
  }

  // one markdown document, day headers from the calendar stamps, pins as
  // quotes. the caller downloads it
  function exportMarkdown(sessionName = 'Campaign') {
    const lines = [`# ${sessionName} journal`, '']
    let lastDate = null
    for (const entry of entries.value) {
      const date = entry.game_date
        ? `${entry.game_date.year}-${entry.game_date.month}-${entry.game_date.day}`
        : null
      if (date && date !== lastDate) {
        lines.push(`## day ${date}`, '')
        lastDate = date
      }
      if (entry.kind === 'pin' && entry.pin) {
        const label = entry.pin.label ? `**${entry.pin.label}**: ` : ''
        lines.push(`> ${label}${entry.pin.text ?? ''}`)
        if (entry.pin.detail) lines.push(`> ${entry.pin.detail}`)
        lines.push('')
      } else {
        lines.push(entry.body, '')
      }
    }
    return lines.join('\n')
  }

  function _apply(row) {
    if (!row?.id) return
    const idx = entries.value.findIndex(e => e.id === row.id)
    if (idx === -1) {
      entries.value = [...entries.value, row].sort(
        (a, b) => new Date(a.created_at) - new Date(b.created_at),
      )
    } else {
      entries.value = entries.value.map(e => (e.id === row.id ? row : e))
    }
  }

  function _fail(what, err) {
    error.value = err instanceof ApiError ? err.message : String(err)
    console.error(`journalStore.${what}:`, error.value)
  }

  return {
    entries,
    error,
    init,
    refresh,
    cleanup,
    addProse,
    pin,
    updateEntry,
    removeEntry,
    exportMarkdown,
  }
})
