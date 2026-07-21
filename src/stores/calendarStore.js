import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '@/lib/supabase'
import { createSessionChannel } from '@/lib/sessionChannel.js'
import { apiClient, ApiError } from '@/lib/apiClient.js'
import { pendingKeys } from '@/lib/realtimeProtocol.js'

const DEFAULT_SETTINGS = {
  month_names:    ['January','February','March','April','May','June','July','August','September','October','November','December'],
  days_per_month: [31,28,31,30,31,30,31,31,30,31,30,31],
  weekday_names:  ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'],
  epoch_weekday:  1,
  year_prefix:    '',
  year_suffix:    '',
  current_year:   1,
  current_month:  1,
  current_day:    1,
}

export const useCalendarStore = defineStore('calendar', () => {
  const settings = ref({ ...DEFAULT_SETTINGS })
  const days     = ref([])

  const session = createSessionChannel()
  let _settingsLoaded = false
  let _initPromise = null
  const _fetchedYears = new Set()

  // while our own writes are in flight, realtime echoes and out-of-order
  // responses carry stale data that would stomp newer optimistic edits
  const _settingsWrites = pendingKeys()
  const _dayWrites      = pendingKeys()
  let _settingsQueue    = Promise.resolve()
  const _dayQueues      = new Map()  // 'y-m-d' -> tail of the write chain
  const SETTINGS_KEY    = 'settings'

  function _dayKey(year, month, day) {
    return `${year}-${month}-${day}`
  }

  async function init(sessionId) {
    if (session.key === sessionId) {
      await _initPromise
      return
    }
    cleanup()
    const generation = session.begin(sessionId)
    const promise = (async () => {
      await _loadSettings(sessionId, generation)
      await _loadDays(sessionId, settings.value.current_year, generation)
      if (!session.isCurrent(generation)) return
      _subscribeSettings(sessionId)
      _subscribeDays(sessionId)
    })()
    _initPromise = promise
    try {
      await promise
    } finally {
      if (_initPromise === promise) _initPromise = null
    }
  }

  async function refresh(generation = session.generation) {
    const sessionId = session.key
    if (!sessionId) return
    await _loadSettings(sessionId, generation)
    for (const year of [..._fetchedYears]) {
      const { data, error } = await supabase
        .from('party_calendar_days')
        .select('*')
        .eq('session_id', sessionId)
        .eq('year', year)
      if (error || !session.isCurrent(generation)) return
      days.value = [...days.value.filter(d => d.year !== year), ...(data ?? [])]
    }
  }

  function cleanup() {
    session.close()
    _initPromise = null
    _settingsLoaded = false
    settings.value = { ...DEFAULT_SETTINGS }
    days.value = []
    _fetchedYears.clear()
  }

  async function _loadSettings(sessionId, generation = session.generation) {
    const { data, error } = await supabase
      .from('party_calendar_settings')
      .select('*')
      .eq('session_id', sessionId)
      .maybeSingle()
    if (error) { console.error('calendarStore._loadSettings:', error.message); return }
    if (!session.isCurrent(generation)) return
    if (data) settings.value = { ...DEFAULT_SETTINGS, ...data }
    _settingsLoaded = true
  }

  async function _loadDays(sessionId, year, generation = session.generation) {
    if (_fetchedYears.has(year)) return
    const { data, error } = await supabase
      .from('party_calendar_days')
      .select('*')
      .eq('session_id', sessionId)
      .eq('year', year)
    if (error) { console.error('calendarStore._loadDays:', error.message); return }
    if (!session.isCurrent(generation)) return
    _fetchedYears.add(year)
    if (data) {
      for (const d of data) {
        if (!days.value.find(x => x.id === d.id)) days.value.push(d)
      }
    }
  }

  async function ensureYear(year) {
    if (session.key) await _loadDays(session.key, year)
  }

  function _subscribeSettings(sessionId) {
    session.open(`calendar:settings:${sessionId}:${crypto.randomUUID()}`, { sessionId, refresh }, ch => ch
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'party_calendar_settings',
        filter: `session_id=eq.${sessionId}`,
      }, e => {
        if (e.eventType === 'INSERT' || e.eventType === 'UPDATE') {
          if (_settingsWrites.has(SETTINGS_KEY)) return
          settings.value = { ...DEFAULT_SETTINGS, ...e.new }
        }
      }))
  }

  function _subscribeDays(sessionId) {
    session.open(`calendar:days:${sessionId}:${crypto.randomUUID()}`, { sessionId }, ch => ch
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'party_calendar_days',
        filter: `session_id=eq.${sessionId}`,
      }, e => {
        if ((e.eventType === 'INSERT' || e.eventType === 'UPDATE') &&
            _dayWrites.has(_dayKey(e.new.year, e.new.month, e.new.day))) return
        if (e.eventType === 'INSERT') {
          const idx = days.value.findIndex(d => d.year === e.new.year && d.month === e.new.month && d.day === e.new.day && d.session_id === e.new.session_id)
          if (idx !== -1) days.value[idx] = e.new; else days.value.push(e.new)
        } else if (e.eventType === 'UPDATE') {
          const idx = days.value.findIndex(d => d.id === e.new.id)
          if (idx !== -1) days.value[idx] = e.new; else days.value.push(e.new)
        } else if (e.eventType === 'DELETE') {
          days.value = days.value.filter(d => d.id !== e.old.id)
        }
      }))
  }

  async function upsertDay(year, month, day, patch) {
    const idx = days.value.findIndex(d => d.year === year && d.month === month && d.day === day)
    if (idx !== -1) {
      Object.assign(days.value[idx], patch)
    } else {
      days.value.push({ session_id: session.key, year, month, day, weather: null, notes: '', ...patch, id: null })
    }
    const sessionId = session.key
    const key = _dayKey(year, month, day)
    _dayWrites.begin([key])
    // chain writes to the same day so they commit in order
    const write = (_dayQueues.get(key) ?? Promise.resolve()).then(() =>
      apiClient.post('/calendar-days', { session_id: sessionId, year, month, day, patch })
    )
    _dayQueues.set(key, write.then(() => {}, () => {}))
    try {
      const data = await write
      // only the last outstanding write applies its response - earlier ones
      // are stale once another optimistic edit has happened
      if (data && _dayWrites.count(key) === 1 && session.key === sessionId) {
        const i = days.value.findIndex(d => d.year === year && d.month === month && d.day === day)
        if (i !== -1) days.value[i] = data; else days.value.push(data)
      }
    } catch (error) {
      console.error('upsertDay:', error instanceof ApiError ? error.message : error)
    } finally {
      _dayWrites.end([key])
      if (!_dayWrites.has(key)) _dayQueues.delete(key)
    }
  }

  async function updateSettings(patch) {
    if (!_settingsLoaded) {
      console.warn('calendarStore.updateSettings skipped: settings not loaded (read may be blocked)')
      return
    }
    Object.assign(settings.value, patch)
    const sessionId = session.key
    _settingsWrites.begin([SETTINGS_KEY])
    // each put sends the whole settings blob, so chain them: an earlier put
    // committing after a later one would silently persist stale settings. the
    // snapshot is taken at send time to pick up any newer optimistic edits
    const write = _settingsQueue.then(() =>
      apiClient.put('/calendar-settings', {
        session_id: sessionId,
        settings: { ...DEFAULT_SETTINGS, ...settings.value },
      })
    )
    _settingsQueue = write.then(() => {}, () => {})
    try {
      const data = await write
      if (data && _settingsWrites.count(SETTINGS_KEY) === 1 && session.key === sessionId) {
        settings.value = { ...DEFAULT_SETTINGS, ...data }
      }
    } catch (error) {
      console.error('updateSettings:', error instanceof ApiError ? error.message : error)
    } finally {
      _settingsWrites.end([SETTINGS_KEY])
    }
  }

  return {
    settings, days,
    init, refresh, cleanup,
    upsertDay, updateSettings, ensureYear,
  }
})
