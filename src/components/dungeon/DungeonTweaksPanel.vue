<template>
  <div class="ds-tweaks-panel">
    <div class="ds-tweaks-head">
      <h4>Display Settings</h4>
    </div>

    <div class="ds-tweaks-body">
    
      <div>
        <label class="ds-tweaks-label">Map Style</label>
        <div class="ds-radio-row">
          <button
            v-for="s in MAP_STYLES"
            :key="s.value"
            class="ds-radio-chip"
            :class="{ selected: prefs.mapStyle === s.value }"
            @click="prefs.setMapStyle(s.value)"
          >{{ s.label }}</button>
        </div>
      </div>


      <div>
        <label class="ds-tweaks-label">Player Colors</label>
        <div class="ds-radio-row">
          <button
            v-for="p in PALETTES"
            :key="p.value"
            class="ds-radio-chip"
            :class="{ selected: prefs.palette === p.value }"
            @click="prefs.setPalette(p.value)"
          >{{ p.label }}</button>
        </div>
      </div>


      <div>
        <label class="ds-tweaks-label">Iconography</label>
        <div class="ds-radio-row">
          <button class="ds-radio-chip" :class="{ selected: prefs.iconStyle === 'filled' }" @click="prefs.setIconStyle('filled')">Filled</button>
          <button class="ds-radio-chip" :class="{ selected: prefs.iconStyle === 'outlined' }" @click="prefs.setIconStyle('outlined')">Outlined</button>
        </div>
      </div>


      <div>
        <label class="ds-tweaks-label">Density</label>
        <div class="ds-radio-row">
          <button
            v-for="d in DENSITIES"
            :key="d.value"
            class="ds-radio-chip"
            :class="{ selected: prefs.density === d.value }"
            @click="prefs.setDensity(d.value)"
          >{{ d.label }}</button>
        </div>
      </div>


      <div>
        <label class="ds-tweaks-label">Panel Side</label>
        <div class="ds-radio-row">
          <button class="ds-radio-chip" :class="{ selected: prefs.panelLayout === 'right' }" @click="prefs.setPanelLayout('right')">Right</button>
          <button class="ds-radio-chip" :class="{ selected: prefs.panelLayout === 'left' }" @click="prefs.setPanelLayout('left')">Left</button>
          <button class="ds-radio-chip" :class="{ selected: prefs.panelLayout === 'floating' }" @click="prefs.setPanelLayout('floating')">Floating</button>
        </div>
      </div>


      <div>
        <label class="ds-tweaks-label">Collaboration</label>
        <div style="display:flex;align-items:center;gap:8px">
          <button
            class="ds-radio-chip"
            :class="{ selected: prefs.showCursors }"
            @click="prefs.setShowCursors(!prefs.showCursors)"
            style="flex:1;text-align:center"
          >Live Cursors {{ prefs.showCursors ? '✓' : '' }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { useUserPrefsStore } from '@/stores/userPrefsStore.js'

const prefs = useUserPrefsStore()
defineEmits(['close'])

const MAP_STYLES = [
  { value: 'classic',   label: 'Classic' },
  { value: 'parchment', label: 'Parchment' },
  { value: 'blueprint', label: 'Blueprint' },
]
const PALETTES = [
  { value: 'candle', label: 'Candle' },
  { value: 'ember',  label: 'Ember' },
  { value: 'moss',   label: 'Moss' },
  { value: 'ink',    label: 'Ink' },
]
const DENSITIES = [
  { value: 'compact', label: 'Dense' },
  { value: 'regular', label: 'Regular' },
  { value: 'comfy',   label: 'Wide' },
]
</script>
