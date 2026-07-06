<template>
  <div class="pc-root">

    <div class="pc-today-bar">
      <span class="pc-today-label" data-testid="calendar-today-label">
        {{ s.year_prefix }}{{ s.current_year }}{{ s.year_suffix }} ·
        {{ s.month_names[s.current_month - 1] }} {{ s.current_day }}
      </span>
      <button class="pc-jump-btn" @click="jumpToToday">Today</button>
      <button v-if="isGM" class="pc-advance-btn" data-testid="calendar-advance-day" @click="advanceDay">Advance Day →</button>
    </div>

    <template v-if="!settingsOpen">
      <div class="pc-nav">
        <button class="pc-nav-btn" @click="prevMonth">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
        <span class="pc-month-title">{{ monthName }} · {{ yearLabel }}</span>
        <button class="pc-nav-btn" @click="nextMonth">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M9 18l6-6-6-6"/></svg>
        </button>
        <button v-if="isGM" class="pc-gear-btn" title="Calendar settings" @click="openSettings">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/>
          </svg>
        </button>
      </div>

      <div class="pc-grid-wrap">
        <div class="pc-grid" :style="{ gridTemplateColumns: `repeat(${numWeekdays}, 1fr)` }">
          <div v-for="wd in s.weekday_names" :key="wd" class="pc-wd">{{ wd }}</div>
          <div v-for="blank in leadingBlanks" :key="blank" class="pc-cell pc-cell--blank" />
          <button
            v-for="d in daysInViewMonth"
            :key="d"
            class="pc-cell"
            :class="{
              'pc-cell--today': isToday(d),
              'pc-cell--selected': selectedDay === d,
              'pc-cell--has-data': dayHasData(d),
            }"
            @click="selectDay(d)"
          >
            <span class="pc-cell-num">{{ d }}</span>
            <span v-if="dayHasData(d)" class="pc-cell-dot" />
          </button>
        </div>
      </div>

      <div v-if="selectedDay !== null" class="pc-detail">
        <div class="pc-detail-head">
          <span class="pc-detail-title">
            {{ monthName }} {{ selectedDay }}, {{ yearLabel }}
          </span>
        </div>

        <div class="pc-weather-section">
          <span class="pc-detail-label">Weather</span>
          <div class="pc-weather-chips">
            <button
              v-for="w in WEATHER"
              :key="w.value"
              class="pc-weather-chip"
              :class="{ active: selectedEntry?.weather === w.value }"
              @click="setWeather(w.value)"
            >{{ w.label }}</button>
          </div>
        </div>

        <div class="pc-notes-section">
          <span class="pc-detail-label">Notes</span>
          <textarea
            class="pc-notes"
            :value="selectedEntry?.notes ?? ''"
            placeholder="Notes for this day…"
            @input="debounceNotes($event.target.value)"
          />
        </div>
      </div>

      <div v-else class="pc-select-prompt">Select a day to add weather or notes</div>
    </template>

    <template v-else>
      <div class="pc-settings">
        <div class="pc-settings-head">
          <span class="pc-settings-title">Calendar Settings</span>
          <button class="pc-settings-close" @click="settingsOpen = false">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>

        <div class="pc-settings-body">

          <div class="pc-sf-group">
            <div class="pc-sf-label">Current In-Game Date</div>
            <div class="pc-sf-row">
              <label class="pc-sf-field-label">Year</label>
              <input v-model.number="draft.current_year" type="number" min="1" class="pc-sf-input pc-sf-input--sm" />
              <label class="pc-sf-field-label">Month</label>
              <select v-model.number="draft.current_month" class="pc-sf-input">
                <option v-for="(name, i) in draft.month_names" :key="i" :value="i + 1">{{ name }}</option>
              </select>
              <label class="pc-sf-field-label">Day</label>
              <input v-model.number="draft.current_day" type="number" min="1" :max="draft.days_per_month[draft.current_month - 1] ?? 30" class="pc-sf-input pc-sf-input--sm" />
            </div>
          </div>

          <div class="pc-sf-group">
            <div class="pc-sf-label">Year Display</div>
            <div class="pc-sf-row">
              <input v-model="draft.year_prefix" class="pc-sf-input pc-sf-input--sm" placeholder="prefix" />
              <span class="pc-sf-year-example">{{ draft.year_prefix || '' }}{{ draft.current_year }}{{ draft.year_suffix || '' }}</span>
              <input v-model="draft.year_suffix" class="pc-sf-input pc-sf-input--sm" placeholder="suffix" />
            </div>
          </div>

          <div class="pc-sf-group">
            <div class="pc-sf-label-row">
              <span class="pc-sf-label">Months</span>
              <button class="pc-sf-add-btn" @click="addMonth">+ Add</button>
            </div>
            <div class="pc-sf-month-list">
              <div v-for="(name, i) in draft.month_names" :key="i" class="pc-sf-month-row">
                <input v-model="draft.month_names[i]" class="pc-sf-input pc-sf-input--name" placeholder="Month name" />
                <input v-model.number="draft.days_per_month[i]" type="number" min="1" max="99" class="pc-sf-input pc-sf-input--days" />
                <span class="pc-sf-days-label">days</span>
                <button class="pc-sf-remove-btn" @click="removeMonth(i)">
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
                </button>
              </div>
            </div>
          </div>

          <div class="pc-sf-group">
            <div class="pc-sf-label-row">
              <span class="pc-sf-label">Days of the Week</span>
              <button class="pc-sf-add-btn" @click="addWeekday">+ Add</button>
            </div>
            <div class="pc-sf-weekday-list">
              <div v-for="(wd, i) in draft.weekday_names" :key="i" class="pc-sf-weekday-row">
                <input v-model="draft.weekday_names[i]" class="pc-sf-input pc-sf-input--wd" placeholder="Day name" />
                <button class="pc-sf-remove-btn" @click="removeWeekday(i)">
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
                </button>
              </div>
            </div>
          </div>

          <div class="pc-sf-group">
            <div class="pc-sf-label">Year 1, Month 1, Day 1 falls on</div>
            <select v-model.number="draft.epoch_weekday" class="pc-sf-input">
              <option v-for="(wd, i) in draft.weekday_names" :key="i" :value="i">{{ wd }}</option>
            </select>
          </div>

          <div class="pc-sf-actions">
            <button class="pc-sf-save-btn" @click="saveSettings">Save Settings</button>
            <button class="pc-sf-cancel-btn" @click="settingsOpen = false">Cancel</button>
          </div>

        </div>
      </div>
    </template>

  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useCalendarStore } from '@/stores/calendarStore.js'
import { useSessionStore }  from '@/stores/sessionStore.js'

const props = defineProps({ sessionId: { type: String, required: true } })

onMounted(() => calendarStore.init(props.sessionId))

const calendarStore = useCalendarStore()
const sessionStore  = useSessionStore()

const isGM = computed(() => sessionStore.isGM)
const s    = computed(() => calendarStore.settings)

const viewYear   = ref(s.value.current_year)
const viewMonth  = ref(s.value.current_month)
const selectedDay = ref(null)
const settingsOpen = ref(false)

watch(() => [s.value.current_year, s.value.current_month], ([y, m]) => {
  viewYear.value  = y
  viewMonth.value = m
})

const numWeekdays    = computed(() => Math.max(1, s.value.weekday_names.length))
const daysInViewMonth = computed(() => s.value.days_per_month[viewMonth.value - 1] ?? 30)
const monthName       = computed(() => s.value.month_names[viewMonth.value - 1] ?? '')
const yearLabel       = computed(() => `${s.value.year_prefix}${viewYear.value}${s.value.year_suffix}`)

function daysFromEpoch(year, month, day) {
  const dpy = s.value.days_per_month.reduce((a, b) => a + b, 0) || 365
  let total = (year - 1) * dpy
  for (let m = 0; m < month - 1; m++) total += s.value.days_per_month[m] ?? 30
  return total + day - 1
}

const leadingBlanks = computed(() => {
  const n = numWeekdays.value
  const elapsed = daysFromEpoch(viewYear.value, viewMonth.value, 1)
  return (s.value.epoch_weekday + elapsed) % n
})

function isToday(d) {
  return d === s.value.current_day && viewMonth.value === s.value.current_month && viewYear.value === s.value.current_year
}

function dayHasData(d) {
  const entry = calendarStore.days.find(x => x.year === viewYear.value && x.month === viewMonth.value && x.day === d)
  return !!(entry?.weather || entry?.notes?.trim())
}

const selectedEntry = computed(() =>
  selectedDay.value === null ? null :
  calendarStore.days.find(x => x.year === viewYear.value && x.month === viewMonth.value && x.day === selectedDay.value) ?? null
)

function selectDay(d) {
  selectedDay.value = selectedDay.value === d ? null : d
}

async function prevMonth() {
  let m = viewMonth.value - 1
  let y = viewYear.value
  if (m < 1) { m = Math.max(1, s.value.month_names.length); y-- }
  if (y < 1) return
  viewMonth.value  = m
  viewYear.value   = y
  selectedDay.value = null
  await calendarStore.ensureYear(y)
}

async function nextMonth() {
  let m = viewMonth.value + 1
  let y = viewYear.value
  const numMonths = Math.max(1, s.value.month_names.length)
  if (m > numMonths) { m = 1; y++ }
  viewMonth.value  = m
  viewYear.value   = y
  selectedDay.value = null
  await calendarStore.ensureYear(y)
}

function jumpToToday() {
  viewYear.value   = s.value.current_year
  viewMonth.value  = s.value.current_month
  selectedDay.value = s.value.current_day
}

function advanceDay() {
  const dpm = s.value.days_per_month
  const numMonths = Math.max(1, s.value.month_names.length)
  let y = s.value.current_year
  let m = s.value.current_month
  let d = s.value.current_day + 1
  if (d > (dpm[m - 1] ?? 30)) {
    d = 1
    m++
    if (m > numMonths) { m = 1; y++ }
  }
  calendarStore.updateSettings({ current_year: y, current_month: m, current_day: d })
  viewYear.value   = y
  viewMonth.value  = m
  selectedDay.value = d
}

const WEATHER = [
  { value: 'clear',    label: 'Clear'    },
  { value: 'cloudy',   label: 'Cloudy'   },
  { value: 'overcast', label: 'Overcast' },
  { value: 'fog',      label: 'Fog'      },
  { value: 'rain',     label: 'Rain'     },
  { value: 'storm',    label: 'Storm'    },
  { value: 'snow',     label: 'Snow'     },
  { value: 'blizzard', label: 'Blizzard' },
  { value: 'hot',      label: 'Scorching'},
  { value: 'windy',    label: 'Windy'    },
  { value: 'cold',     label: 'Freezing' },
]

async function setWeather(val) {
  if (selectedDay.value === null) return
  const current = selectedEntry.value?.weather
  await calendarStore.upsertDay(viewYear.value, viewMonth.value, selectedDay.value, {
    weather: current === val ? null : val,
  })
}

let _noteTimer = null
function debounceNotes(val) {
  clearTimeout(_noteTimer)
  if (selectedDay.value === null) return
  const y = viewYear.value, m = viewMonth.value, d = selectedDay.value
  const entry = calendarStore.days.find(x => x.year === y && x.month === m && x.day === d)
  if (entry) { entry.notes = val }
  _noteTimer = setTimeout(() => calendarStore.upsertDay(y, m, d, { notes: val }), 600)
}


const draft = ref(null)

function openSettings() {
  const s = calendarStore.settings
  draft.value = {
    current_year:   s.current_year,
    current_month:  s.current_month,
    current_day:    s.current_day,
    year_prefix:    s.year_prefix,
    year_suffix:    s.year_suffix,
    month_names:    [...s.month_names],
    days_per_month: [...s.days_per_month],
    weekday_names:  [...s.weekday_names],
    epoch_weekday:  s.epoch_weekday,
  }
  settingsOpen.value = true
}

function addMonth() {
  draft.value.month_names.push('New Month')
  draft.value.days_per_month.push(30)
}

function removeMonth(i) {
  if (draft.value.month_names.length <= 1) return
  draft.value.month_names.splice(i, 1)
  draft.value.days_per_month.splice(i, 1)
  if (draft.value.current_month > draft.value.month_names.length) {
    draft.value.current_month = draft.value.month_names.length
  }
}

function addWeekday() {
  draft.value.weekday_names.push('Day')
}

function removeWeekday(i) {
  if (draft.value.weekday_names.length <= 1) return
  draft.value.weekday_names.splice(i, 1)
  if (draft.value.epoch_weekday >= draft.value.weekday_names.length) {
    draft.value.epoch_weekday = 0
  }
}

async function saveSettings() {
  await calendarStore.updateSettings({ ...draft.value })
  viewYear.value  = draft.value.current_year
  viewMonth.value = draft.value.current_month
  selectedDay.value = null
  settingsOpen.value = false
}
</script>

<style scoped>
.pc-root {
  display: flex;
  flex-direction: column;
}

.pc-today-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 12px;
  border-bottom: 1px solid var(--rule-strong);
  background: var(--paper-2);
}
.pc-today-label {
  flex: 1;
  font-family: var(--font-display);
  font-style: italic;
  font-size: 18px;
  color: var(--ink);
}
.pc-jump-btn {
  font-family: var(--font-zine);
  font-size: 13px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  background: var(--paper-2);
  border: 1px solid var(--rule-strong);
  color: var(--ink-soft);
  padding: 4px 10px;
  border-radius: 2px;
  cursor: default;
  transition: color 0.1s, border-color 0.1s;
}
.pc-jump-btn:hover { color: var(--ink); border-color: var(--ink-soft); }
.pc-advance-btn {
  font-family: var(--font-zine);
  font-size: 13px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  background: var(--ink);
  border: 1px solid var(--ink);
  color: var(--paper);
  padding: 4px 10px;
  border-radius: 2px;
  cursor: default;
  transition: opacity 0.12s;
}
.pc-advance-btn:hover { opacity: 0.8; }

.pc-nav {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--rule);
}
.pc-nav-btn {
  background: none;
  border: 1px solid var(--rule-strong);
  color: var(--ink-soft);
  width: 30px;
  height: 30px;
  display: grid;
  place-items: center;
  border-radius: 2px;
  cursor: default;
  flex: 0 0 auto;
  transition: color 0.1s, border-color 0.1s;
}
.pc-nav-btn:hover { color: var(--ink); border-color: var(--ink-soft); }
.pc-month-title {
  flex: 1;
  font-family: var(--font-display);
  font-style: italic;
  font-size: 20px;
  color: var(--ink);
  text-align: center;
}
.pc-gear-btn {
  background: none;
  border: 1px solid var(--rule-strong);
  color: var(--ink-soft);
  width: 30px;
  height: 30px;
  display: grid;
  place-items: center;
  border-radius: 2px;
  cursor: default;
  flex: 0 0 auto;
  transition: color 0.1s, border-color 0.1s;
}
.pc-gear-btn:hover { color: var(--ink); border-color: var(--ink-soft); }

.pc-grid-wrap {
  padding: 8px 10px 6px;
  border-bottom: 1px solid var(--rule);
}
.pc-grid {
  display: grid;
  gap: 3px;
}
.pc-wd {
  font-family: var(--font-zine);
  font-size: 11px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--ink-mute);
  text-align: center;
  padding: 4px 0;
}
.pc-cell {
  height: 43px;
  background: none;
  border: 1px solid var(--rule);
  border-radius: 2px;
  cursor: default;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  position: relative;
  transition: background 0.1s, border-color 0.1s;
  min-width: 0;
  padding: 0;
}
.pc-cell:hover { background: var(--paper-2); border-color: var(--ink-soft); }
.pc-cell--blank { border-color: transparent; pointer-events: none; }
.pc-cell--today {
  background: var(--ink);
  border-color: var(--ink);
}
.pc-cell--today .pc-cell-num { color: var(--paper); font-weight: 700; }
.pc-cell--today .pc-cell-dot { background: var(--paper-2); }
.pc-cell--selected:not(.pc-cell--today) {
  background: var(--paper-3, #d8ccb4);
  border-color: var(--ink-soft);
}
.pc-cell-num {
  font-family: var(--font-mono);
  font-size: 14px;
  color: var(--ink);
  line-height: 1;
}
.pc-cell-dot {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--accent-2);
  flex-shrink: 0;
}

.pc-detail {
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.pc-detail-head {
  border-bottom: 1px dashed var(--rule);
  padding-bottom: 9px;
}
.pc-detail-title {
  font-family: var(--font-display);
  font-style: italic;
  font-size: 19px;
  color: var(--ink);
}
.pc-detail-label {
  font-family: var(--font-zine);
  font-size: 13px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--ink-soft);
  display: block;
  margin-bottom: 6px;
}
.pc-weather-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.pc-weather-chip {
  font-family: var(--font-zine);
  font-size: 13px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  background: var(--paper-2);
  border: 1px solid var(--rule-strong);
  color: var(--ink-soft);
  padding: 5px 11px;
  border-radius: 2px;
  cursor: default;
  transition: background 0.1s, color 0.1s, border-color 0.1s;
  white-space: nowrap;
}
.pc-weather-chip:hover { color: var(--ink); border-color: var(--ink-soft); }
.pc-weather-chip.active {
  background: var(--ink);
  color: var(--paper);
  border-color: var(--ink);
}
.pc-notes {
  width: 100%;
  box-sizing: border-box;
  background: none;
  border: none;
  border-top: 1px dashed var(--rule);
  font-family: var(--font-body);
  font-size: 18px;
  color: var(--ink-soft);
  padding: 8px 0 0;
  resize: none;
  outline: none;
  line-height: 1.55;
  field-sizing: content;
  min-height: 4.65em;
}

.pc-select-prompt {
  font-family: var(--font-body);
  font-style: italic;
  font-size: 16px;
  color: var(--ink-mute);
  text-align: center;
  padding: 16px 12px;
}


.pc-settings {
  display: flex;
  flex-direction: column;
}
.pc-settings-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-bottom: 1px solid var(--rule-strong);
  background: var(--paper-2);
}
.pc-settings-title {
  font-family: var(--font-zine);
  font-size: 14px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--ink-soft);
}
.pc-settings-close {
  background: none;
  border: none;
  color: var(--ink-mute);
  cursor: default;
  display: grid;
  place-items: center;
  padding: 2px;
  transition: color 0.1s;
}
.pc-settings-close:hover { color: var(--accent); }

.pc-settings-body {
  padding: 10px 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.pc-sf-group { display: flex; flex-direction: column; gap: 8px; }
.pc-sf-label {
  font-family: var(--font-zine);
  font-size: 13px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--ink-soft);
}
.pc-sf-label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.pc-sf-add-btn {
  font-family: var(--font-zine);
  font-size: 13px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--accent-2);
  background: none;
  border: none;
  cursor: default;
  padding: 0;
}
.pc-sf-add-btn:hover { color: var(--accent); }

.pc-sf-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.pc-sf-field-label {
  font-family: var(--font-zine);
  font-size: 13px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--ink-mute);
  flex: 0 0 auto;
}
.pc-sf-year-example {
  font-family: var(--font-display);
  font-style: italic;
  font-size: 18px;
  color: var(--ink);
  padding: 0 5px;
  flex: 1;
  text-align: center;
}

.pc-sf-input {
  background: var(--paper-2);
  border: 1px solid var(--rule-strong);
  border-radius: 2px;
  font-family: var(--font-body);
  font-size: 16px;
  color: var(--ink);
  padding: 5px 9px;
  outline: none;
  box-sizing: border-box;
}
.pc-sf-input:focus { border-color: var(--ink-soft); }
.pc-sf-input--sm  { width: 80px; text-align: center; }
.pc-sf-input--name { flex: 1; min-width: 0; }
.pc-sf-input--days { width: 65px; text-align: center; }
.pc-sf-input--wd   { flex: 1; min-width: 0; }

.pc-sf-month-list,
.pc-sf-weekday-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.pc-sf-month-row,
.pc-sf-weekday-row {
  display: flex;
  align-items: center;
  gap: 5px;
}
.pc-sf-days-label {
  font-family: var(--font-zine);
  font-size: 13px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--ink-mute);
  flex: 0 0 auto;
}
.pc-sf-remove-btn {
  background: none;
  border: none;
  color: var(--ink-mute);
  cursor: default;
  padding: 3px;
  display: grid;
  place-items: center;
  opacity: 0;
  transition: opacity 0.1s, color 0.1s;
  flex: 0 0 auto;
}
.pc-sf-month-row:hover .pc-sf-remove-btn,
.pc-sf-weekday-row:hover .pc-sf-remove-btn { opacity: 0.6; }
.pc-sf-remove-btn:hover { opacity: 1 !important; color: var(--accent); }

.pc-sf-actions {
  display: flex;
  gap: 6px;
  padding-top: 4px;
  border-top: 1px solid var(--rule);
}
.pc-sf-save-btn {
  flex: 1;
  background: var(--ink);
  color: var(--paper);
  border: none;
  font-family: var(--font-zine);
  font-size: 14px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  padding: 9px 13px;
  cursor: default;
  border-radius: 2px;
  transition: opacity 0.12s;
}
.pc-sf-save-btn:hover { opacity: 0.8; }
.pc-sf-cancel-btn {
  background: var(--paper-2);
  color: var(--ink-soft);
  border: 1px solid var(--rule-strong);
  font-family: var(--font-zine);
  font-size: 14px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  padding: 9px 18px;
  cursor: default;
  border-radius: 2px;
  transition: color 0.1s;
}
.pc-sf-cancel-btn:hover { color: var(--ink); border-color: var(--ink-soft); }
</style>
