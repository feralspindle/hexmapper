<template>
  <div v-if="activeTool === 'paint' || activeTool === 'marker'" class="hm-contents-bar">

    <template v-if="activeTool === 'paint'">
      <span class="hm-contents-bar-label">Terrain</span>
      <button
        v-for="t in terrains"
        :key="t.id"
        class="hm-stamp-btn"
        :aria-pressed="activeTerrain === t.id"
        :style="{ background: t.color, color: t.iconColor }"
        @click="emit('terrain', t.id)"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" :stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="hm-stamp-glyph">
          <template v-if="t.id === 'plains'">
            <path d="M3 17c3-3 6-3 9 0s6 3 9 0M3 13c3-3 6-3 9 0s6 3 9 0"/>
          </template>
          <template v-else-if="t.id === 'forest'">
            <path d="M12 3l5 8h-3l3 5h-4l-1 5-1-5H7l3-5H7z"/>
          </template>
          <template v-else-if="t.id === 'mountain'">
            <path d="M3 19l5-9 4 6 3-4 6 7z"/>
          </template>
          <template v-else-if="t.id === 'water'">
            <path d="M3 8c3-2 6 2 9 0s6-2 9 0M3 14c3-2 6 2 9 0s6-2 9 0M3 20c3-2 6 2 9 0s6-2 9 0"/>
          </template>
          <template v-else-if="t.id === 'desert'">
            <circle cx="12" cy="9" r="3" fill="currentColor" stroke="none" opacity="0.7"/>
            <path d="M3 18c3-2 6 2 9 0s6-2 9 0"/>
          </template>
          <template v-else-if="t.id === 'swamp'">
            <path d="M3 17c3-1 6 1 9 0s6-1 9 0"/>
            <path d="M7 14v-4M11 13V8M15 14v-3M19 14v-5"/>
          </template>
          <template v-else-if="t.id === 'city'">
            <path d="M3 21V12l4-3v12z"/><path d="M9 21V8l5-4 5 4v13z"/><path d="M19 21V14l3 2v5z"/>
          </template>
          <template v-else-if="t.id === 'dungeon'">
            <path d="M5 21V10a7 7 0 0114 0v11z"/><rect x="10" y="14" width="4" height="7" fill="currentColor" stroke="none" opacity="0.6"/>
          </template>
          <template v-else-if="t.id === 'snow'">
            <path d="M12 2v20M2 12h20M9 5l3-3 3 3M9 19l3 3 3-3M5 9l-3 3 3 3M19 9l3 3-3 3"/>
          </template>
          <template v-else-if="t.id === 'volcanic'">
            <path d="M3 19l5-9 4 6 3-4 6 7z"/><path d="M12 10v-4M9 7l3-3 3 3"/>
          </template>
        </svg>
        <span class="hm-stamp-lbl">{{ t.label }}</span>
      </button>
    </template>

    <template v-else-if="activeTool === 'marker'">
      <span class="hm-contents-bar-label">Marker</span>
      <button
        v-for="m in MARKER_KINDS"
        :key="m.id"
        class="hm-stamp-btn"
        :aria-pressed="activeMarkerColor === m.id"
        @click="emit('marker-color', m.id)"
      >
        <svg viewBox="0 0 24 24" fill="currentColor" class="hm-stamp-glyph">
          <template v-if="m.id === 'town'">
            <path d="M4 20V11l4-3 4 3v9z"/><path d="M12 20v-7l4-2 4 2v7z"/>
            <rect x="6" y="14" width="2" height="3" fill="var(--paper, #f4e8cc)"/>
            <rect x="15" y="15" width="2" height="3" fill="var(--paper, #f4e8cc)"/>
          </template>
          <template v-else-if="m.id === 'city'">
            <path d="M3 21V12l4-3v12z"/><path d="M9 21V8l5-4 5 4v13z"/><path d="M19 21V14l3 2v5z"/>
            <rect x="11" y="12" width="2" height="3" fill="var(--paper, #f4e8cc)"/>
            <rect x="15" y="12" width="2" height="3" fill="var(--paper, #f4e8cc)"/>
          </template>
          <template v-else-if="m.id === 'dungeon'">
            <path d="M5 21V10a7 7 0 0114 0v11z"/><rect x="10" y="14" width="4" height="7" fill="var(--paper, #f4e8cc)"/>
          </template>
          <template v-else-if="m.id === 'landmark'">
            <path d="M12 3l3 6 6 .8-4.5 4 1 6.2-5.5-3-5.5 3 1-6.2L3 9.8 9 9z"/>
          </template>
        </svg>
        <span class="hm-stamp-lbl">{{ m.label }}</span>
      </button>
    </template>

  </div>
</template>

<script setup>
import { computed } from 'vue'
import { TERRAIN_TYPES, MARKER_KINDS } from '@/stores/hexStore.js'

defineProps({
  activeTool:        { type: String, default: null },
  activeTerrain:     { type: String, default: null },
  activeMarkerColor: { type: String, default: null },
})

const emit = defineEmits(['terrain', 'marker-color'])

function iconColor(hex) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  const luma = (r * 299 + g * 587 + b * 114) / 1000
  return luma > 100 ? 'rgba(26,20,16,.75)' : 'rgba(237,225,199,.7)'
}

const terrains = computed(() =>
  TERRAIN_TYPES.map(t => ({ ...t, iconColor: iconColor(t.color) }))
)
</script>
