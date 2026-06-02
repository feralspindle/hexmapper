import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { supabase } from '@/lib/supabase'
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

  let _loaded = false
  let _pendingSave = false

  function _snapshot() {
    return { mapStyle: mapStyle.value, density: density.value, palette: palette.value,
             iconStyle: iconStyle.value, panelLayout: panelLayout.value, showCursors: showCursors.value }
  }

  async function load() {
    const authStore = useAuthStore()
    if (!authStore.user?.id) {
      const stop = watch(() => authStore.user?.id, (id) => {
        if (!id) return
        stop()
        load()
      })
      return
    }

    const { data, error } = await supabase
      .from('user_preferences')
      .select('*')
      .eq('user_id', authStore.user.id)
      .maybeSingle()

    if (error) console.error('userPrefsStore.load:', error.message)

    if (data) {
      mapStyle.value    = data.dungeon_map_style    ?? 'classic'
      density.value     = data.dungeon_density      ?? 'regular'
      palette.value     = data.dungeon_palette      ?? 'candle'
      iconStyle.value   = data.dungeon_icon_style   ?? 'filled'
      panelLayout.value = data.dungeon_panel_layout ?? 'right'
      showCursors.value = data.dungeon_show_cursors ?? true
      _writeStorage(_snapshot())
    }
    _loaded = true
    if (_pendingSave) { _pendingSave = false; _scheduleSave() }
  }

  let _saveTimer = null
  function _scheduleSave() {
    clearTimeout(_saveTimer)
    _saveTimer = setTimeout(_save, 600)
  }

  async function _save() {
    const authStore = useAuthStore()
    if (!authStore.user?.id) return
    if (!_loaded) { _pendingSave = true; return }
    const { error } = await supabase.from('user_preferences').upsert({
      user_id:              authStore.user.id,
      dungeon_map_style:    mapStyle.value,
      dungeon_density:      density.value,
      dungeon_palette:      palette.value,
      dungeon_icon_style:   iconStyle.value,
      dungeon_panel_layout: panelLayout.value,
      dungeon_show_cursors: showCursors.value,
      updated_at:           new Date().toISOString(),
    }, { onConflict: 'user_id' })
    if (error) console.error('userPrefsStore.save:', error.message)
  }

  function setMapStyle(v)    { mapStyle.value    = v; _writeStorage(_snapshot()); _scheduleSave() }
  function setDensity(v)     { density.value     = v; _writeStorage(_snapshot()); _scheduleSave() }
  function setPalette(v)     { palette.value     = v; _writeStorage(_snapshot()); _scheduleSave() }
  function setIconStyle(v)   { iconStyle.value   = v; _writeStorage(_snapshot()); _scheduleSave() }
  function setPanelLayout(v) { panelLayout.value = v; _writeStorage(_snapshot()); _scheduleSave() }
  function setShowCursors(v) { showCursors.value = v; _writeStorage(_snapshot()); _scheduleSave() }

  return {
    mapStyle, density, palette, iconStyle, panelLayout, showCursors,
    load,
    setMapStyle, setDensity, setPalette, setIconStyle, setPanelLayout, setShowCursors,
  }
})
