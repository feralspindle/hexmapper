import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '@/lib/supabase'
import { realtime } from '@/lib/realtime.js'
import { apiClient, ApiError } from '@/lib/apiClient.js'

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

  let settingsChannel = null
  let daysChannel     = null
  let _sessionId      = null
  let _settingsLoaded = false
  const _fetchedYears = new Set()

  async function init(sessionId) {
    if (_sessionId === sessionId) return
    cleanup()
    _sessionId = sessionId
    await _loadSettings(sessionId)
    await _loadDays(sessionId, settings.value.current_year)
    _subscribeSettings(sessionId)
    _subscribeDays(sessionId)
  }

  async function refresh() {
    const sessionId = _sessionId
    if (!sessionId) return
    await _loadSettings(sessionId)
    for (const year of [..._fetchedYears]) {
      const { data, error } = await supabase
        .from('party_calendar_days')
        .select('*')
        .eq('session_id', sessionId)
        .eq('year', year)
      if (error || _sessionId !== sessionId) return
      days.value = [...days.value.filter(d => d.year !== year), ...(data ?? [])]
    }
  }

  function cleanup() {
    if (settingsChannel) { realtime.removeChannel(settingsChannel); settingsChannel = null }
    if (daysChannel)     { realtime.removeChannel(daysChannel);     daysChannel     = null }
    _sessionId = null
    _settingsLoaded = false
    settings.value = { ...DEFAULT_SETTINGS }
    days.value = []
    _fetchedYears.clear()
  }

  async function _loadSettings(sessionId) {
    const { data, error } = await supabase
      .from('party_calendar_settings')
      .select('*')
      .eq('session_id', sessionId)
      .maybeSingle()
    if (error) { console.error('calendarStore._loadSettings:', error.message); return }
    if (_sessionId !== sessionId) return
    if (data) settings.value = { ...DEFAULT_SETTINGS, ...data }
    _settingsLoaded = true
  }

  async function _loadDays(sessionId, year) {
    if (_fetchedYears.has(year)) return
    const { data, error } = await supabase
      .from('party_calendar_days')
      .select('*')
      .eq('session_id', sessionId)
      .eq('year', year)
    if (error) { console.error('calendarStore._loadDays:', error.message); return }
    _fetchedYears.add(year)
    if (data) {
      for (const d of data) {
        if (!days.value.find(x => x.id === d.id)) days.value.push(d)
      }
    }
  }

  async function ensureYear(year) {
    if (_sessionId) await _loadDays(_sessionId, year)
  }

  function _subscribeSettings(sessionId) {
    let subscribedRefreshed = false
    settingsChannel = realtime
      .channel(`calendar:settings:${sessionId}:${crypto.randomUUID()}`, { sessionId, onReconnect: () => refresh() })
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'party_calendar_settings',
        filter: `session_id=eq.${sessionId}`,
      }, e => {
        if (e.eventType === 'INSERT' || e.eventType === 'UPDATE') {
          settings.value = { ...DEFAULT_SETTINGS, ...e.new }
        }
      })
      .subscribe(status => {
        if (status !== 'SUBSCRIBED' || subscribedRefreshed) return
        subscribedRefreshed = true
        void refresh()
      })
  }

  function _subscribeDays(sessionId) {
    daysChannel = realtime
      .channel(`calendar:days:${sessionId}:${crypto.randomUUID()}`, { sessionId })
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'party_calendar_days',
        filter: `session_id=eq.${sessionId}`,
      }, e => {
        if (e.eventType === 'INSERT') {
          const idx = days.value.findIndex(d => d.year === e.new.year && d.month === e.new.month && d.day === e.new.day && d.session_id === e.new.session_id)
          if (idx !== -1) days.value[idx] = e.new; else days.value.push(e.new)
        } else if (e.eventType === 'UPDATE') {
          const idx = days.value.findIndex(d => d.id === e.new.id)
          if (idx !== -1) days.value[idx] = e.new; else days.value.push(e.new)
        } else if (e.eventType === 'DELETE') {
          days.value = days.value.filter(d => d.id !== e.old.id)
        }
      })
      .subscribe()
  }

  async function upsertDay(year, month, day, patch) {
    const idx = days.value.findIndex(d => d.year === year && d.month === month && d.day === day)
    if (idx !== -1) {
      Object.assign(days.value[idx], patch)
    } else {
      days.value.push({ session_id: _sessionId, year, month, day, weather: null, notes: '', ...patch, id: null })
    }
    try {
      const data = await apiClient.post('/calendar-days', { session_id: _sessionId, year, month, day, patch })
      if (data) {
        const i = days.value.findIndex(d => d.year === year && d.month === month && d.day === day)
        if (i !== -1) days.value[i] = data; else days.value.push(data)
      }
    } catch (error) {
      console.error('upsertDay:', error instanceof ApiError ? error.message : error)
    }
  }

  async function updateSettings(patch) {
    if (!_settingsLoaded) {
      console.warn('calendarStore.updateSettings skipped: settings not loaded (read may be blocked)')
      return
    }
    Object.assign(settings.value, patch)
    try {
      const data = await apiClient.put('/calendar-settings', {
        session_id: _sessionId,
        settings: { ...DEFAULT_SETTINGS, ...settings.value, ...patch },
      })
      if (data) settings.value = { ...DEFAULT_SETTINGS, ...data }
    } catch (error) {
      console.error('updateSettings:', error instanceof ApiError ? error.message : error)
    }
  }

  return {
    settings, days,
    init, refresh, cleanup,
    upsertDay, updateSettings, ensureYear,
  }
})
