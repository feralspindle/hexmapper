<template>
  <g
    :transform="`translate(${center.x}, ${center.y})`"
    class="hex-cell"
    :class="{ 'cursor-pointer': true }"
    @click.stop="emit('click')"
    @contextmenu.prevent.stop="emit('contextmenu')"
  >

    <polygon
      :points="polygonPoints"
      :fill="hexFill"
      :stroke="hexStroke"
      :stroke-width="isSelected ? 2.5 / (size / 48) : 0.8 / (size / 48)"
      class="hex-cell-poly transition-colors duration-150"
    />

    <g
      v-if="blankMode && visibleToPlayer && cell?.terrain_type"
      :transform="terrainIconTransform"
      class="pointer-events-none"
      fill="none"
      stroke="currentColor"
      :stroke-width="1.4"
      stroke-linecap="round"
      stroke-linejoin="round"
      :color="terrainIconColor"
      opacity="0.55"
    >
      <template v-if="cell.terrain_type === 'plains'">
        <path d="M3 17c3-3 6-3 9 0s6 3 9 0M3 13c3-3 6-3 9 0s6 3 9 0"/>
      </template>
      <template v-else-if="cell.terrain_type === 'forest'">
        <path d="M12 3l5 8h-3l3 5h-4l-1 5-1-5H7l3-5H7z"/>
      </template>
      <template v-else-if="cell.terrain_type === 'mountain'">
        <path d="M3 19l5-9 4 6 3-4 6 7z"/>
      </template>
      <template v-else-if="cell.terrain_type === 'water'">
        <path d="M3 8c3-2 6 2 9 0s6-2 9 0M3 14c3-2 6 2 9 0s6-2 9 0M3 20c3-2 6 2 9 0s6-2 9 0"/>
      </template>
      <template v-else-if="cell.terrain_type === 'desert'">
        <circle cx="12" cy="9" r="3" fill="currentColor" stroke="none" opacity="0.6"/>
        <path d="M3 18c3-2 6 2 9 0s6-2 9 0"/>
      </template>
      <template v-else-if="cell.terrain_type === 'swamp'">
        <path d="M3 17c3-1 6 1 9 0s6-1 9 0"/>
        <path d="M7 14v-4M11 13V8M15 14v-3M19 14v-5"/>
      </template>
      <template v-else-if="cell.terrain_type === 'city'">
        <path d="M3 21V12l4-3v12z"/><path d="M9 21V8l5-4 5 4v13z"/><path d="M19 21V14l3 2v5z"/>
      </template>
      <template v-else-if="cell.terrain_type === 'dungeon'">
        <path d="M5 21V10a7 7 0 0114 0v11z"/><rect x="10" y="14" width="4" height="7" fill="currentColor" stroke="none" opacity="0.5"/>
      </template>
      <template v-else-if="cell.terrain_type === 'snow'">
        <path d="M12 3L12 21 M4.2 7.5L19.8 16.5 M19.8 7.5L4.2 16.5 M12 9l1.73-1 M12 9l-1.73-1 M12 15l1.73 1 M12 15l-1.73 1 M14.6 10.5l1.73 1 M14.6 10.5l0-2 M9.4 13.5l-1.73-1 M9.4 13.5l0 2 M9.4 10.5l0-2 M9.4 10.5l-1.73 1 M14.6 13.5l0 2 M14.6 13.5l1.73-1"/>
      </template>
      <template v-else-if="cell.terrain_type === 'volcanic'">
        <path d="M3 19l5-9 4 6 3-4 6 7z"/><path d="M12 10v-4M9 7l3-3 3 3"/>
      </template>
    </g>

    <g v-if="blankMode && visibleToPlayer && markerCount" class="pointer-events-none">
      <circle
        cx="0" cy="0"
        :r="markerR"
        fill="var(--paper, #f4e8cc)"
        stroke="var(--ink, #1a0f06)"
        :stroke-width="1.5 / (size / 48)"
      />
      <g :transform="`translate(${markerGlyphOffset}, ${markerGlyphOffset}) scale(${markerGlyphScale})`" fill="var(--ink, #1a0f06)">
        <template v-if="firstMarker?.kind === 'town'">
          <path d="M4 20V11l4-3 4 3v9z"/><path d="M12 20v-7l4-2 4 2v7z"/>
          <rect x="6" y="14" width="2" height="3" fill="var(--paper, #f4e8cc)"/>
          <rect x="15" y="15" width="2" height="3" fill="var(--paper, #f4e8cc)"/>
        </template>
        <template v-else-if="firstMarker?.kind === 'city'">
          <path d="M3 21V12l4-3v12z"/><path d="M9 21V8l5-4 5 4v13z"/><path d="M19 21V14l3 2v5z"/>
          <rect x="11" y="12" width="2" height="3" fill="var(--paper, #f4e8cc)"/>
          <rect x="15" y="12" width="2" height="3" fill="var(--paper, #f4e8cc)"/>
        </template>
        <template v-else-if="firstMarker?.kind === 'dungeon'">
          <path d="M5 21V10a7 7 0 0114 0v11z"/><rect x="10" y="14" width="4" height="7" fill="var(--paper, #f4e8cc)"/>
        </template>
        <template v-else-if="firstMarker?.kind === 'landmark'">
          <path d="M12 3l3 6 6 .8-4.5 4 1 6.2-5.5-3-5.5 3 1-6.2L3 9.8 9 9z"/>
        </template>
      </g>
      <g v-if="markerCount > 1" :transform="`translate(${badgeX}, ${badgeY})`">
        <circle :r="badgeR" fill="var(--accent, #8a4a1c)" stroke="var(--paper, #f4e8cc)" :stroke-width="1 / (size / 48)" />
        <text text-anchor="middle" dy=".35em" :font-size="badgeR * 1.1" fill="#fff5e8" style="font-family: var(--font-mono, monospace); font-weight: 700;">{{ markerCount }}</text>
      </g>
      <text
        v-if="firstMarker?.label"
        text-anchor="middle"
        :y="markerR + size * 0.2"
        :font-size="10 * (size / 48)"
        fill="var(--ink, #1a0f06)"
        style="font-family: 'Cormorant Garamond', Georgia, serif; font-style: italic; font-weight: 600;"
      >{{ firstMarker.label.slice(0, 16) }}</text>
    </g>

    <g v-if="visibleToPlayer && cell?.has_dungeon" transform="translate(16, -20)" class="pointer-events-none">
      <circle r="7" fill="#1c1522" stroke="#9b7bb5" stroke-width="1.5" />
      <text text-anchor="middle" dy="4" font-size="9" fill="#c9a8e0">D</text>
    </g>

    <template v-if="visibleToPlayer && !imageMode">
      <text
        v-if="blankMode"
        text-anchor="middle"
        :y="-(size * 0.68)"
        :font-size="Math.max(7, size * 0.16)"
        fill="rgba(58,46,34,.38)"
        class="pointer-events-none"
        style="font-family: 'JetBrains Mono', ui-monospace, monospace; letter-spacing: 0.03em;"
      >{{ q }},{{ r }}</text>
      <!-- hex label: bottom -->
      <text
        v-if="cell?.label"
        text-anchor="middle"
        :y="size * 0.74"
        :font-size="labelSize"
        :fill="blankMode ? 'rgba(26,20,16,.75)' : '#ccc'"
        class="pointer-events-none"
        :style="`font-family: 'Cormorant Garamond', Georgia, serif; font-style: italic;`"
      >
        <title v-if="displayLabel !== cell.label">{{ cell.label }}</title>
        {{ displayLabel }}
      </text>
    </template>

    <polygon
      v-if="isGM && !isRevealed && fogMode"
      :points="polygonPoints"
      fill="rgba(8, 12, 22, 0.55)"
      class="pointer-events-none"
    />

    <polygon
      v-if="isGM && fogMode"
      :points="polygonPoints"
      fill="none"
      stroke="rgba(148, 163, 184, 0.4)"
      :stroke-width="2 / (size / 48)"
      class="pointer-events-none"
    />

    <g v-if="isParty" class="pointer-events-none">

      <polygon
        :points="polygonPoints"
        fill="none"
        stroke="#7a1a1a"
        :stroke-width="3 / (size / 48)"
      />

      <g :transform="`translate(${-size * 0.3}, ${size * 0.1})`" style="filter: drop-shadow(0 3px 6px rgba(40,0,0,0.7)) drop-shadow(0 1px 3px rgba(0,0,0,0.5))">
  
        <path
          :d="`M${-size*0.065},${-size*0.24} L0,0 L${size*0.065},${-size*0.24}Z`"
          fill="#7a1a1a"
        />

        <circle
          :cy="-size*0.42"
          :r="size*0.2"
          fill="#7a1a1a"
          stroke="var(--paper, #f4e8cc)"
          :stroke-width="1.5 / (size / 48)"
        />

        <circle
          :cy="-size*0.42"
          :r="size*0.07"
          fill="var(--paper, #f4e8cc)"
          opacity="0.95"
        />
      </g>
    </g>
  </g>
</template>

<script setup>
import { computed } from 'vue'
import { hexToPixel, hexCorners, cornersToPoints, HEX_SIZE } from '@/composables/useHexGeometry.js'
import { TERRAIN_TYPES, parseMarkers } from '@/stores/hexStore.js'

const props = defineProps({
  q: Number,
  r: Number,
  cell: Object,
  isSelected: Boolean,
  isGM: { type: Boolean, default: false },
  fogMode:         { type: Boolean, default: false },
  imageMode:       { type: Boolean, default: false },
  settingsOpen:    { type: Boolean, default: false },
  mapFogRevealAll: { type: Boolean, default: false },
  isParty:         { type: Boolean, default: false },
  size: { type: Number, default: HEX_SIZE },
  hexH: { type: Number, default: null },
})

const emit = defineEmits(['click', 'contextmenu'])

const center = computed(() => hexToPixel(props.q, props.r, props.size, props.hexH))

const polygonPoints = computed(() => {
  const corners = hexCorners(0, 0, props.size, props.hexH)
  return cornersToPoints(corners)
})

const blankMode = computed(() => !props.fogMode && !props.imageMode)
const isRevealed = computed(() => {
  if (!props.fogMode) return props.mapFogRevealAll
  if (props.cell != null) return props.cell.revealed
  return props.mapFogRevealAll
})

const visibleToPlayer = computed(() => props.isGM || isRevealed.value)

const terrainColor = computed(() => {
  if (props.cell?.color) return props.cell.color
  if (props.cell?.terrain_type) {
    const t = TERRAIN_TYPES.find(t => t.id === props.cell.terrain_type)
    if (t) return t.color
  }
  return null
})

const hexFill = computed(() => {
  if (props.imageMode) {
    return !visibleToPlayer.value ? '#0a0f1a' : 'transparent'
  }
  if (!visibleToPlayer.value) return '#111827'
  if (terrainColor.value) return terrainColor.value
  return blankMode.value ? '#f4e8cc' : '#1f2937'
})

const hexStroke = computed(() => {
  if (props.isSelected) return '#8a1c1c'
  if (props.imageMode) return props.settingsOpen ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.18)'
  return blankMode.value ? 'rgba(26,20,16,.55)' : '#374151'
})

const terrainIconScale     = computed(() => (props.size * 0.55) / 24)
const terrainIconOffset    = computed(() => -12 * terrainIconScale.value)
const terrainIconTransform = computed(() =>
  `translate(${terrainIconOffset.value}, ${terrainIconOffset.value}) scale(${terrainIconScale.value})`
)


const terrainIconColor = computed(() => {
  const t = TERRAIN_TYPES.find(t => t.id === props.cell?.terrain_type)
  if (!t) return '#1a1410'
  const color = t.color
  const r = parseInt(color.slice(1, 3), 16)
  const g = parseInt(color.slice(3, 5), 16)
  const b = parseInt(color.slice(5, 7), 16)
  const luma = (r * 299 + g * 587 + b * 114) / 1000
  return luma > 100 ? 'rgba(26,20,16,.7)' : 'rgba(237,225,199,.6)'
})

const markerKinds       = computed(() => parseMarkers(props.cell?.marker_color))
const firstMarker       = computed(() => markerKinds.value[0] ?? null)
const markerCount       = computed(() => markerKinds.value.length)
const markerR           = computed(() => Math.max(8, props.size * 0.3))
const markerGlyphScale  = computed(() => (markerR.value * 1.1) / 12)
const markerGlyphOffset = computed(() => -12 * markerGlyphScale.value)
const badgeR            = computed(() => Math.max(5, markerR.value * 0.38))
const badgeX            = computed(() => markerR.value * 0.65)
const badgeY            = computed(() => -markerR.value * 0.65)

const labelSize = computed(() => {
  const len = (props.cell?.label ?? '').length
  if (len <= 8) return 13
  if (len <= 14) return 11
  return 9
})

const displayLabel = computed(() => {
  const label = props.cell?.label ?? ''

  const maxChars = Math.max(4, Math.floor((props.size * 1.146) / (labelSize.value * 0.52)))
  if (label.length <= maxChars) return label
  return label.slice(0, maxChars - 1) + '…'
})
</script>
