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

import { useCalendarStore } from './calendarStore.js'

const day = (id, overrides = {}) => ({
  id,
  session_id: 's1',
  year: 1,
  month: 1,
  day: 1,
  weather: null,
  notes: '',
  ...overrides,
})

describe('calendarStore behavior', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    resetKit(kit)
    kit.responses.party_calendar_settings = { data: null, error: null }
    kit.responses.party_calendar_days = { data: [], error: null }
  })

  test('server settings merge over defaults and realtime updates replace them', async () => {
    kit.responses.party_calendar_settings = {
      data: { session_id: 's1', year_prefix: 'Age of ', current_year: 312 },
      error: null,
    }
    const store = useCalendarStore()
    await store.init('s1')

    expect(store.settings.year_prefix).toBe('Age of ')
    expect(store.settings.current_year).toBe(312)
    expect(store.settings.month_names).toHaveLength(12)

    const settingsChannel = kit.channels.find(c => c.name.startsWith('calendar:settings'))
    settingsChannel.emitPostgres('party_calendar_settings', 'UPDATE', { session_id: 's1', year_prefix: 'Era ' })
    expect(store.settings.year_prefix).toBe('Era ')
    expect(store.settings.days_per_month).toHaveLength(12)
  })

  test('day INSERTs upsert by calendar date so optimistic rows are replaced, not duplicated', async () => {
    const store = useCalendarStore()
    await store.init('s1')
    const daysChannel = kit.channels.find(c => c.name.startsWith('calendar:days'))

    kit.api['post /calendar-days'] = null
    await store.upsertDay(1, 3, 14, { weather: 'rain' })
    expect(store.days).toHaveLength(1)
    expect(store.days[0].id).toBeNull()

    daysChannel.emitPostgres('party_calendar_days', 'INSERT', day('d1', { month: 3, day: 14, weather: 'rain' }))
    expect(store.days).toHaveLength(1)
    expect(store.days[0].id).toBe('d1')
  })

  test('day UPDATE and DELETE events apply by id', async () => {
    kit.responses.party_calendar_days = { data: [day('d1', { notes: 'feast day' })], error: null }
    const store = useCalendarStore()
    await store.init('s1')
    const daysChannel = kit.channels.find(c => c.name.startsWith('calendar:days'))

    daysChannel.emitPostgres('party_calendar_days', 'UPDATE', day('d1', { notes: 'plague day' }))
    expect(store.days[0].notes).toBe('plague day')

    daysChannel.emitPostgres('party_calendar_days', 'DELETE', {}, { id: 'd1' })
    expect(store.days).toEqual([])
  })

  test('upsertDay swaps the optimistic day for the server row on success', async () => {
    kit.api['post /calendar-days'] = body => day('server-day', { ...body.patch, year: body.year, month: body.month, day: body.day })
    const store = useCalendarStore()
    await store.init('s1')

    await store.upsertDay(2, 5, 9, { weather: 'storm' })

    expect(store.days).toHaveLength(1)
    expect(store.days[0]).toMatchObject({ id: 'server-day', weather: 'storm', year: 2 })
  })

  test('a failed upsertDay keeps the optimistic entry and logs', async () => {
    kit.api['post /calendar-days'] = new kit.ApiError('nope', 500)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const store = useCalendarStore()
    await store.init('s1')

    await store.upsertDay(1, 1, 2, { notes: 'ambush' })

    expect(store.days).toHaveLength(1)
    expect(store.days[0].notes).toBe('ambush')
    errorSpy.mockRestore()
  })

  test('updateSettings applies the server response over defaults', async () => {
    kit.api['put /calendar-settings'] = body => ({ session_id: 's1', ...body.settings, year_suffix: ' AR' })
    const store = useCalendarStore()
    await store.init('s1')

    await store.updateSettings({ year_prefix: 'Year ' })

    expect(store.settings.year_prefix).toBe('Year ')
    expect(store.settings.year_suffix).toBe(' AR')
  })

  test('refresh re-fetches every year that was ever loaded', async () => {
    const store = useCalendarStore()
    await store.init('s1')
    kit.responses.party_calendar_days = { data: [day('d5', { year: 5 })], error: null }
    await store.ensureYear(5)

    kit.responses.party_calendar_days = { data: [day('d5', { year: 5, notes: 'updated' })], error: null }
    await store.refresh()

    expect(store.days.find(d => d.id === 'd5').notes).toBe('updated')
  })

  test('cleanup restores default settings and forgets fetched years', async () => {
    kit.responses.party_calendar_settings = { data: { session_id: 's1', year_prefix: 'Age of ' }, error: null }
    kit.responses.party_calendar_days = { data: [day('d1')], error: null }
    const store = useCalendarStore()
    await store.init('s1')
    store.cleanup()

    expect(store.settings.year_prefix).toBe('')
    expect(store.days).toEqual([])
    expect(kit.channels.every(c => c.removed)).toBe(true)
  })
})
