import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore.js'

export const useUserPrefsStore = defineStore('userPrefs', () => {
  const mapStyle    = ref('classic')
  const density     = ref('regular')
  const palette     = ref('candle')
  const iconStyle   = ref('filled')
  const panelLayout = ref('right')
  const showCursors = ref(true)

  let _loaded = false

  async function load() {
    const authStore = useAuthStore()
    if (!authStore.user?.id) return

    const { data } = await supabase
      .from('user_preferences')
      .select('*')
      .eq('user_id', authStore.user.id)
      .maybeSingle()

    if (data) {
      mapStyle.value    = data.dungeon_map_style    ?? 'classic'
      density.value     = data.dungeon_density      ?? 'regular'
      palette.value     = data.dungeon_palette      ?? 'candle'
      iconStyle.value   = data.dungeon_icon_style   ?? 'filled'
      panelLayout.value = data.dungeon_panel_layout ?? 'right'
      showCursors.value = data.dungeon_show_cursors ?? true
    }
    _loaded = true
  }

  let _saveTimer = null
  function _scheduleSave() {
    clearTimeout(_saveTimer)
    _saveTimer = setTimeout(_save, 600)
  }

  async function _save() {
    const authStore = useAuthStore()
    if (!authStore.user?.id || !_loaded) return
    await supabase.from('user_preferences').upsert({
      user_id:               authStore.user.id,
      dungeon_map_style:    mapStyle.value,
      dungeon_density:      density.value,
      dungeon_palette:      palette.value,
      dungeon_icon_style:   iconStyle.value,
      dungeon_panel_layout: panelLayout.value,
      dungeon_show_cursors: showCursors.value,
      updated_at:           new Date().toISOString(),
    }, { onConflict: 'user_id' })
  }

  function setMapStyle(v)    { mapStyle.value    = v; _scheduleSave() }
  function setDensity(v)     { density.value     = v; _scheduleSave() }
  function setPalette(v)     { palette.value     = v; _scheduleSave() }
  function setIconStyle(v)   { iconStyle.value   = v; _scheduleSave() }
  function setPanelLayout(v) { panelLayout.value = v; _scheduleSave() }
  function setShowCursors(v) { showCursors.value = v; _scheduleSave() }

  return {
    mapStyle, density, palette, iconStyle, panelLayout, showCursors,
    load,
    setMapStyle, setDensity, setPalette, setIconStyle, setPanelLayout, setShowCursors,
  }
})
