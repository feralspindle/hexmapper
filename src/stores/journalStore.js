import { defineStore } from 'pinia'
import { ref } from 'vue'
import { createSessionChannel } from '@/lib/sessionChannel.js'
import { apiClient, ApiError } from '@/lib/apiClient.js'
import { useCalendarStore } from '@/stores/calendarStore.js'

// the record of play: prose entries and pinned rolls in one chronological
// stream, stamped with the in-game date when the calendar has one
export const useJournalStore = defineStore('journal', () => {
  const entries = ref([])
  const error = ref(null)

  const session = createSessionChannel()

  async function init(sessionId) {
    if (session.key === sessionId) return
    cleanup()
    const generation = session.begin(sessionId)
    session.open(`journal:${sessionId}`, { sessionId, refresh }, ch => ch
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
      }))
    await refresh(generation)
  }

  async function refresh(generation = session.generation) {
    const sessionId = session.key
    if (!sessionId) return
    try {
      const rows = (await apiClient.get(`/journal-entries?session_id=${sessionId}`)) ?? []
      if (!session.isCurrent(generation)) return
      entries.value = rows
    } catch (err) {
      _fail('refresh', err)
    }
  }

  function cleanup() {
    session.close()
    entries.value = []
    error.value = null
  }

  function _gameDate(settings) {
    if (!settings?.current_year) return null
    return {
      year: settings.current_year,
      month: settings.current_month,
      day: settings.current_day,
    }
  }

  // characterId attaches the entry to a party character (solo play: recording
  // what an individual character says or does, distinct from narration)
  async function addProse(body, { characterId = null } = {}) {
    if (!session.key || !body?.trim()) return null
    return _create({ kind: 'prose', body: body.trim(), character_id: characterId })
  }

  // pin = {source: 'oracle'|'dice', label, text, detail?} - a snapshot, not a
  // reference, so the journal survives history trimming
  async function pin(pinPayload) {
    if (!session.key) return null
    return _create({ kind: 'pin', pin: pinPayload })
  }

  async function _create(payload) {
    try {
      const calendarStore = useCalendarStore()
      await calendarStore.init(session.key)
      const row = await apiClient.post('/journal-entries', {
        session_id: session.key,
        game_date: _gameDate(calendarStore.settings),
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
        lines.push(entry.character_name ? `**${entry.character_name}:** ${entry.body}` : entry.body, '')
      }
    }
    return lines.join('\n')
  }

  function _apply(row) {
    if (!row?.id) return
    const existing = entries.value.find(e => e.id === row.id)
    if (!existing) {
      // realtime created events carry the author as user_id, api rows as
      // author_user_id
      const incoming = { author_user_id: row.user_id, ...row }
      entries.value = [...entries.value, incoming].sort(
        (a, b) => new Date(a.created_at) - new Date(b.created_at),
      )
    } else {
      // realtime update payloads are sparse (body plus the event's timestamp
      // as created_at); merge so kind/pin/author survive and the entry keeps
      // its place in the stream
      const merged = { ...existing, ...row, created_at: existing.created_at }
      entries.value = entries.value.map(e => (e.id === row.id ? merged : e))
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
