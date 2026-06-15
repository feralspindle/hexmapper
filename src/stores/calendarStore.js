import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '@/lib/supabase'
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

  function cleanup() {
    if (settingsChannel) { supabase.removeChannel(settingsChannel); settingsChannel = null }
    if (daysChannel)     { supabase.removeChannel(daysChannel);     daysChannel     = null }
    _sessionId = null
    settings.value = { ...DEFAULT_SETTINGS }
    days.value = []
    _fetchedYears.clear()
  }

  async function _loadSettings(sessionId) {
    const { data } = await supabase
      .from('party_calendar_settings')
      .select('*')
      .eq('session_id', sessionId)
      .maybeSingle()
    if (data) settings.value = { ...DEFAULT_SETTINGS, ...data }
  }

  async function _loadDays(sessionId, year) {
    if (_fetchedYears.has(year)) return
    _fetchedYears.add(year)
    const { data } = await supabase
      .from('party_calendar_days')
      .select('*')
      .eq('session_id', sessionId)
      .eq('year', year)
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
    settingsChannel = supabase
      .channel(`calendar:settings:${sessionId}:${crypto.randomUUID()}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'party_calendar_settings',
        filter: `session_id=eq.${sessionId}`,
      }, e => {
        if (e.eventType === 'INSERT' || e.eventType === 'UPDATE') {
          settings.value = { ...DEFAULT_SETTINGS, ...e.new }
        }
      })
      .subscribe()
  }

  function _subscribeDays(sessionId) {
    daysChannel = supabase
      .channel(`calendar:days:${sessionId}:${crypto.randomUUID()}`)
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
    init, cleanup,
    upsertDay, updateSettings, ensureYear,
  }
})
