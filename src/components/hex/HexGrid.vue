<template>
  <div ref="containerEl" class="w-full h-full overflow-hidden select-none" :class="panMode ? 'cursor-pan' : moveMode !== 'none' ? 'cursor-move' : 'cursor-default'">
    <svg
      ref="svgEl"
      :width="svgWidth"
      :height="svgHeight"
      class="block"
      @mousedown.left="onPanStart"
      @mousemove="onMouseMove"
      @mouseup="onPanEnd"
      @mouseleave="onPanEnd"
      @wheel.prevent="onWheel"
    >
      <g :transform="`translate(${pan.x}, ${pan.y}) scale(${zoom})`">
        <g :transform="imageTransform">
          <image
            v-if="imageMode && mapImageUrl && imageNaturalWidth"
            :href="mapImageUrl"
            x="0" y="0"
            :width="imageNaturalWidth"
            :height="imageNaturalHeight"
            preserveAspectRatio="none"
          />
        </g>

        <g :transform="gridTransform">
          <HexCell
            v-for="coord in visibleCoords"
            :key="`${coord.q}:${coord.r}`"
            :q="coord.q"
            :r="coord.r"
            :cell="hexStore.hexCells.get(`${coord.q}:${coord.r}`) ?? null"
            :is-selected="hexStore.selectedHex?.q === coord.q && hexStore.selectedHex?.r === coord.r"
            :is-g-m="isGM"
            :fog-mode="fogMode"
            :image-mode="imageMode"
            :size="hexSize"
            :hex-h="hexHProp"
            @click="!panMode && !didPan && emit('hex-click', coord.q, coord.r)"
            @contextmenu.prevent="!panMode && emit('hex-context', coord.q, coord.r)"
          />
        </g>
      </g>
    </svg>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useHexStore } from '@/stores/hexStore.js'
import { HEX_SIZE } from '@/composables/useHexGeometry.js'
import HexCell from './HexCell.vue'

const props = defineProps({
  isGM:             { type: Boolean, default: false },
  fogMode:          { type: Boolean, default: false },
  imageMode:        { type: Boolean, default: false },
  mapImageUrl:      { type: String,  default: null  },
  mapHexWidth:      { type: Number,  default: HEX_SIZE * 2 },
  mapHexHeight:     { type: Number,  default: null  },
  mapImageRotation: { type: Number,  default: 0     },
  mapGridRotation:  { type: Number,  default: 0     },
  mapImageOffsetX:  { type: Number,  default: 0     },
  mapImageOffsetY:  { type: Number,  default: 0     },
  mapGridOffsetX:   { type: Number,  default: 0     },
  mapGridOffsetY:   { type: Number,  default: 0     },
  moveMode:         { type: String,  default: 'none' },
})

const emit = defineEmits(['hex-click', 'hex-context', 'image-offset-change', 'grid-offset-change'])

const hexStore = useHexStore()

const containerEl = ref(null)
const svgEl = ref(null)
const svgWidth = ref(800)
const svgHeight = ref(600)
const zoom = ref(1)
const pan = ref({ x: 0, y: 0 })
const panMode = ref(false)
let panning = false
let didPan = false
let panStart = { x: 0, y: 0 }
let panOrigin = { x: 0, y: 0 }

const imageNaturalWidth  = ref(0)
const imageNaturalHeight = ref(0)

const localImageOffsetX = ref(0)
const localImageOffsetY = ref(0)
const localGridOffsetX  = ref(0)
const localGridOffsetY  = ref(0)

watch(() => props.mapImageOffsetX, v => { localImageOffsetX.value = v }, { immediate: true })
watch(() => props.mapImageOffsetY, v => { localImageOffsetY.value = v }, { immediate: true })
watch(() => props.mapGridOffsetX,  v => { localGridOffsetX.value  = v }, { immediate: true })
watch(() => props.mapGridOffsetY,  v => { localGridOffsetY.value  = v }, { immediate: true })

watch(() => props.mapImageUrl, (url) => {
  if (!url) { imageNaturalWidth.value = 0; imageNaturalHeight.value = 0; return }
  const img = new Image()
  img.onload = () => {
    imageNaturalWidth.value  = img.naturalWidth
    imageNaturalHeight.value = img.naturalHeight
  }
  img.src = url
}, { immediate: true })

const hexSize  = computed(() => props.imageMode ? props.mapHexWidth / 2 : HEX_SIZE)
const hexHProp = computed(() => props.imageMode ? props.mapHexHeight : null)

const _pivot = computed(() => ({
  cx: imageNaturalWidth.value  / 2,
  cy: imageNaturalHeight.value / 2,
}))

const imageTransform = computed(() => {
  const ox = localImageOffsetX.value
  const oy = localImageOffsetY.value
  const parts = []
  if (ox !== 0 || oy !== 0) parts.push(`translate(${ox}, ${oy})`)
  if (props.imageMode && props.mapImageRotation) {
    const { cx, cy } = _pivot.value
    parts.push(`rotate(${props.mapImageRotation}, ${cx}, ${cy})`)
  }
  return parts.join(' ')
})

const gridTransform = computed(() => {
  const ox = localGridOffsetX.value
  const oy = localGridOffsetY.value
  const parts = []
  if (ox !== 0 || oy !== 0) parts.push(`translate(${ox}, ${oy})`)
  if (props.imageMode && props.mapGridRotation) {
    const { cx, cy } = _pivot.value
    parts.push(`rotate(${props.mapGridRotation}, ${cx}, ${cy})`)
  }
  return parts.join(' ')
})

const gridCols = computed(() => {
  if (props.imageMode && imageNaturalWidth.value > 0 && hexSize.value > 0) {
    return Math.ceil(imageNaturalWidth.value / (hexSize.value * 1.5)) + 4
  }
  return 30
})

const gridRows = computed(() => {
  const h = hexHProp.value ?? (Math.sqrt(3) * hexSize.value)
  if (props.imageMode && imageNaturalHeight.value > 0 && h > 0) {
    return Math.ceil(imageNaturalHeight.value / h) + 4
  }
  return 20
})

const visibleCoords = computed(() => {
  const coords = []
  for (let q = -2; q < gridCols.value; q++) {
    const qOffset = Math.floor(q / 2)
    for (let r = -qOffset - 2; r < gridRows.value - qOffset + 2; r++) {
      coords.push({ q, r })
    }
  }
  return coords
})

function onPanStart(e) {
  const inMoveMode = props.moveMode !== 'none'
  if (!inMoveMode && !panMode.value && e.target !== svgEl.value && e.target.tagName !== 'svg') return
  panning = true
  didPan = false
  panStart = { x: e.clientX, y: e.clientY }
  if (props.moveMode === 'image') {
    panOrigin = { x: localImageOffsetX.value, y: localImageOffsetY.value }
  } else if (props.moveMode === 'grid') {
    panOrigin = { x: localGridOffsetX.value, y: localGridOffsetY.value }
  } else {
    panOrigin = { x: pan.value.x, y: pan.value.y }
  }
}

function onMouseMove(e) {
  if (!panning) return
  const dx = e.clientX - panStart.x
  const dy = e.clientY - panStart.y
  if (Math.abs(dx) > 2 || Math.abs(dy) > 2) didPan = true
  if (props.moveMode === 'image') {
    localImageOffsetX.value = panOrigin.x + dx
    localImageOffsetY.value = panOrigin.y + dy
  } else if (props.moveMode === 'grid') {
    localGridOffsetX.value = panOrigin.x + dx
    localGridOffsetY.value = panOrigin.y + dy
  } else {
    pan.value = { x: panOrigin.x + dx, y: panOrigin.y + dy }
  }
}

function onPanEnd() {
  if (panning && didPan) {
    if (props.moveMode === 'image') {
      emit('image-offset-change', Math.round(localImageOffsetX.value), Math.round(localImageOffsetY.value))
    } else if (props.moveMode === 'grid') {
      emit('grid-offset-change', Math.round(localGridOffsetX.value), Math.round(localGridOffsetY.value))
    }
  }
  panning = false
}

function onWheel(e) {
  const factor = e.deltaY < 0 ? 1.1 : 0.9
  zoom.value = Math.min(3, Math.max(0.3, zoom.value * factor))
}

function zoomIn()    { zoom.value = Math.min(3, zoom.value * 1.2) }
function zoomOut()   { zoom.value = Math.max(0.3, zoom.value / 1.2) }
function resetZoom() { zoom.value = 1 }
function togglePanMode() { panMode.value = !panMode.value }

defineExpose({ zoomIn, zoomOut, resetZoom, panMode, togglePanMode })

const resizeObserver = new ResizeObserver(entries => {
  for (const entry of entries) {
    svgWidth.value  = entry.contentRect.width
    svgHeight.value = entry.contentRect.height
  }
})

onMounted(() => {
  if (containerEl.value) {
    svgWidth.value  = containerEl.value.clientWidth
    svgHeight.value = containerEl.value.clientHeight
    resizeObserver.observe(containerEl.value)
    pan.value = { x: svgWidth.value * 0.1, y: svgHeight.value * 0.1 }
  }
})

onUnmounted(() => { resizeObserver.disconnect() })
</script>
