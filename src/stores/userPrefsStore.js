import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { supabase } from '@/lib/supabase'
import { apiClient, ApiError } from '@/lib/apiClient.js'
import { useAuthStore } from '@/stores/authStore.js'

const STORAGE_KEY = 'ds_prefs_v1'

function _readStorage() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') } catch { return null }
}

function _writeStorage(vals) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(vals)) } catch {}
}

export const useUserPrefsStore = defineStore('userPrefs', () => {
  const _cached = _readStorage()
  const mapStyle    = ref(_cached?.mapStyle    ?? 'classic')
  const density     = ref(_cached?.density     ?? 'regular')
  const palette     = ref(_cached?.palette     ?? 'candle')
  const iconStyle   = ref(_cached?.iconStyle   ?? 'filled')
  const panelLayout = ref(_cached?.panelLayout ?? 'right')
  const showCursors = ref(_cached?.showCursors ?? true)
  const showHexMarkers = ref(_cached?.showHexMarkers ?? true)
  const showDungeonItems = ref(_cached?.showDungeonItems ?? true)

  const authStore = useAuthStore()
  let _loaded = false
  let _pendingSave = false

  function _snapshot() {
    return { mapStyle: mapStyle.value, density: density.value, palette: palette.value,
             iconStyle: iconStyle.value, panelLayout: panelLayout.value, showCursors: showCursors.value,
             showHexMarkers: showHexMarkers.value, showDungeonItems: showDungeonItems.value }
  }

  function _reset() {
    mapStyle.value = 'classic'
    density.value = 'regular'
    palette.value = 'candle'
    iconStyle.value = 'filled'
    panelLayout.value = 'right'
    showCursors.value = true
    showHexMarkers.value = true
    showDungeonItems.value = true
    try { localStorage.removeItem(STORAGE_KEY) } catch { /* */ }
  }

  // a pending save or in-flight load from account A must never land on
  // account B - cancel timers, drop loaded state, and reset the values (and
  // the shared localStorage paint cache) whenever the account changes
  watch(() => authStore.user?.id, (id, previous) => {
    if (id === previous) return
    clearTimeout(_saveTimer)
    _pendingSave = false
    _loaded = false
    if (previous) _reset()
    if (id) load()
  })

  async function load() {
    const userId = authStore.user?.id
    if (!userId) return

    const { data, error } = await supabase
      .from('user_preferences')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle()

    if (authStore.user?.id !== userId) return

    if (error) {
      console.error('userPrefsStore.load:', error.message)
      return
    }

    if (data) {
      mapStyle.value    = data.dungeon_map_style    ?? 'classic'
      density.value     = data.dungeon_density      ?? 'regular'
      palette.value     = data.dungeon_palette      ?? 'candle'
      iconStyle.value   = data.dungeon_icon_style   ?? 'filled'
      panelLayout.value = data.dungeon_panel_layout ?? 'right'
      showCursors.value = data.dungeon_show_cursors ?? true
      showHexMarkers.value = data.hex_show_markers ?? true
      showDungeonItems.value = data.dungeon_show_items ?? true
      _writeStorage(_snapshot())
    }
    _loaded = true
    if (_pendingSave) { _pendingSave = false; _scheduleSave() }
  }

  let _saveTimer = null
  function _scheduleSave() {
    clearTimeout(_saveTimer)
    const userId = authStore.user?.id
    _saveTimer = setTimeout(() => _save(userId), 600)
  }

  async function _save(userId) {
    if (!userId || authStore.user?.id !== userId) return
    if (!_loaded) { _pendingSave = true; return }
    try {
      await apiClient.put('/user-preferences', {
        dungeon_map_style:    mapStyle.value,
        dungeon_density:      density.value,
        dungeon_palette:      palette.value,
        dungeon_icon_style:   iconStyle.value,
        dungeon_panel_layout: panelLayout.value,
        dungeon_show_cursors: showCursors.value,
        hex_show_markers:     showHexMarkers.value,
        dungeon_show_items:   showDungeonItems.value,
      })
    } catch (error) {
      console.error('userPrefsStore.save:', error instanceof ApiError ? error.message : error)
    }
  }

  function setMapStyle(v)    { mapStyle.value    = v; _writeStorage(_snapshot()); _scheduleSave() }
  function setDensity(v)     { density.value     = v; _writeStorage(_snapshot()); _scheduleSave() }
  function setPalette(v)     { palette.value     = v; _writeStorage(_snapshot()); _scheduleSave() }
  function setIconStyle(v)   { iconStyle.value   = v; _writeStorage(_snapshot()); _scheduleSave() }
  function setPanelLayout(v) { panelLayout.value = v; _writeStorage(_snapshot()); _scheduleSave() }
  function setShowCursors(v) { showCursors.value = v; _writeStorage(_snapshot()); _scheduleSave() }
  function setShowHexMarkers(v)   { showHexMarkers.value   = v; _writeStorage(_snapshot()); _scheduleSave() }
  function setShowDungeonItems(v) { showDungeonItems.value = v; _writeStorage(_snapshot()); _scheduleSave() }

  return {
    mapStyle, density, palette, iconStyle, panelLayout, showCursors, showHexMarkers, showDungeonItems,
    load,
    setMapStyle, setDensity, setPalette, setIconStyle, setPanelLayout, setShowCursors,
    setShowHexMarkers, setShowDungeonItems,
  }
})
