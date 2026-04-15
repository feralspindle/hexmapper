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
      :stroke="isSelected ? '#f5d76e' : (imageMode ? 'rgba(255,255,255,0.18)' : '#374151')"
      :stroke-width="isSelected ? 2.5 / (size / 48) : 1 / (size / 48)"
      class="transition-colors duration-150"
    />

    <g v-if="visibleToPlayer && cell?.marker_color" class="pointer-events-none">
      <circle
        :cx="0" :cy="-markerY"
        :r="markerR"
        :fill="markerFill"
        stroke="rgba(0,0,0,0.7)"
        :stroke-width="1.5 / (size / 48)"
      />
      <text
        v-if="cell?.marker_label"
        text-anchor="middle"
        :y="-markerY + markerR + 8"
        :font-size="7 * (size / 48)"
        fill="#f3f0e8"
        style="text-shadow: 0 1px 3px rgba(0,0,0,1); font-family: 'Crimson Text', serif;"
      >{{ cell.marker_label.slice(0, 14) }}</text>
    </g>

    <template v-if="visibleToPlayer && !imageMode">

      <g v-if="cell?.has_dungeon" transform="translate(16, -20)">
        <circle r="7" fill="#1c1522" stroke="#9b7bb5" stroke-width="1.5" />
        <text text-anchor="middle" dy="4" font-size="9" fill="#c9a8e0">D</text>
      </g>


      <text
        v-if="cell?.label"
        text-anchor="middle"
        dy="4"
        :font-size="labelSize"
        fill="#f3f0e8"
        class="pointer-events-none"
        style="text-shadow: 0 1px 2px rgba(0,0,0,0.9); font-family: 'Crimson Text', serif;"
      >
        {{ cell.label }}
      </text>
    </template>


    <polygon
      v-if="isGM && !isRevealed"
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
  </g>
</template>

<script setup>
import { computed } from 'vue'
import { hexToPixel, hexCorners, cornersToPoints, HEX_SIZE } from '@/composables/useHexGeometry.js'
import { TERRAIN_TYPES, MARKER_COLORS } from '@/stores/hexStore.js'

const props = defineProps({
  q: Number,
  r: Number,
  cell: Object,
  isSelected: Boolean,
  isGM: { type: Boolean, default: false },
  fogMode: { type: Boolean, default: false },
  imageMode: { type: Boolean, default: false },
  size: { type: Number, default: HEX_SIZE },
  hexH: { type: Number, default: null },
})

const emit = defineEmits(['click', 'contextmenu'])

const center = computed(() => hexToPixel(props.q, props.r, props.size, props.hexH))

const polygonPoints = computed(() => {
  const corners = hexCorners(0, 0, props.size, props.hexH)
  return cornersToPoints(corners)
})

const isRevealed = computed(() => props.cell?.revealed ?? false)

const visibleToPlayer = computed(() => props.isGM || isRevealed.value)

const terrainColor = computed(() => {
  if (props.cell?.color) return props.cell.color
  if (props.cell?.terrain_type) {
    const t = TERRAIN_TYPES.find(t => t.id === props.cell.terrain_type)
    if (t) return t.color
  }
  return '#1f2937'
})

const hexFill = computed(() => {
  if (props.imageMode) {

    return (!visibleToPlayer.value) ? '#0a0f1a' : 'transparent'
  }
  return visibleToPlayer.value ? terrainColor.value : '#111827'
})


const markerR    = computed(() => Math.max(4, props.size * 0.11))
const markerY    = computed(() => props.size * 0.52)
const markerFill = computed(() => MARKER_COLORS.find(m => m.id === props.cell?.marker_color)?.color ?? '#ffffff')

const labelSize = computed(() => {
  const len = (props.cell?.label ?? '').length
  if (len <= 6) return 11
  if (len <= 12) return 9
  return 7
})
</script>
