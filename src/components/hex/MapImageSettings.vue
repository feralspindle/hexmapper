<template>
  <div class="absolute left-12 top-1/2 -translate-y-1/2 z-20 w-80 bg-stone-900 border border-stone-600 rounded-lg shadow-2xl p-4 flex flex-col gap-4 max-h-[90vh] overflow-y-auto">
    <div class="text-xs font-display text-parchment-200 uppercase tracking-wider">Map Settings</div>

    <div class="flex gap-2">
      <button
        :class="['flex-1 py-1.5 text-xs rounded transition-colors', mapStore.gmMapType === 'hex' ? 'bg-parchment-500 text-stone-900 font-semibold' : 'bg-stone-700 text-stone-400 hover:text-stone-200']"
        @click="setMapType('hex')"
      ><i class="fa-solid fa-border-all mr-1" />Standard Grid</button>
      <button
        :class="['flex-1 py-1.5 text-xs rounded transition-colors', mapStore.gmMapType === 'image' ? 'bg-parchment-500 text-stone-900 font-semibold' : 'bg-stone-700 text-stone-400 hover:text-stone-200']"
        @click="setMapType('image')"
      ><i class="fa-solid fa-image mr-1" />Custom Image</button>
    </div>

    <template v-if="mapStore.gmMapType === 'image'">

      <div>
        <div v-if="mapStore.gmMapImageUrl" class="mb-2 rounded overflow-hidden border border-stone-600">
          <img :src="mapStore.gmMapImageUrl" class="w-full h-24 object-cover block" alt="Map image" />
        </div>
        <div v-else class="mb-2 h-14 rounded border border-dashed border-stone-600 flex items-center justify-center text-xs text-stone-500">
          No image uploaded
        </div>

        <label class="block w-full py-2 px-3 bg-stone-700 hover:bg-stone-600 text-xs text-stone-200 text-center rounded cursor-pointer transition-colors">
          <i class="fa-solid fa-upload mr-1.5" />{{ mapStore.gmMap?.map_image_path ? 'Replace image' : 'Upload map image' }}
          <input type="file" accept="image/jpeg,image/png,image/webp" class="hidden" @change="handleUpload" />
        </label>
        <p class="text-xs text-stone-600 mt-1">JPEG, PNG, or WebP · max 10 MB</p>
        <p v-if="uploadError" class="text-xs text-red-400 mt-1">{{ uploadError }}</p>
        <div v-if="uploading" class="flex items-center gap-2 text-xs text-stone-400 mt-1">
          <i class="fa-solid fa-spinner fa-spin" />Uploading…
        </div>
      </div>

      <div :class="isAlignmentLocked ? 'opacity-40 pointer-events-none select-none' : ''">

        <div class="mb-4">
          <div class="text-xs text-stone-500 mb-2">Image rotation</div>
          <div class="flex items-center gap-2">
            <button class="w-8 h-8 rounded bg-stone-700 hover:bg-stone-600 text-stone-300 flex items-center justify-center shrink-0 transition-colors" title="Rotate image 90° CCW" @click="rotateImageBy(-90)"><i class="fa-solid fa-rotate-left text-xs" /></button>
            <div class="flex-1 relative">
              <input v-model.number="imageRotationDraft" type="number" min="0" max="359"
                class="w-full bg-stone-700 border border-stone-600 rounded px-2 py-1.5 text-xs text-stone-200 text-center focus:outline-none focus:border-parchment-400 [appearance:textfield]"
                @change="saveImageRotation" />
              <span class="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-stone-500 pointer-events-none">°</span>
            </div>
            <button class="w-8 h-8 rounded bg-stone-700 hover:bg-stone-600 text-stone-300 flex items-center justify-center shrink-0 transition-colors" title="Rotate image 90° CW" @click="rotateImageBy(90)"><i class="fa-solid fa-rotate-right text-xs" /></button>
          </div>
        </div>

        <div class="mb-4">
          <div class="text-xs text-stone-500 mb-2">Grid rotation</div>
          <div class="flex items-center gap-2">
            <button class="w-8 h-8 rounded bg-stone-700 hover:bg-stone-600 text-stone-300 flex items-center justify-center shrink-0 transition-colors" title="Rotate grid 90° CCW" @click="rotateGridBy(-90)"><i class="fa-solid fa-rotate-left text-xs" /></button>
            <div class="flex-1 relative">
              <input v-model.number="gridRotationDraft" type="number" min="0" max="359"
                class="w-full bg-stone-700 border border-stone-600 rounded px-2 py-1.5 text-xs text-stone-200 text-center focus:outline-none focus:border-parchment-400 [appearance:textfield]"
                @change="saveGridRotation" />
              <span class="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-stone-500 pointer-events-none">°</span>
            </div>
            <button class="w-8 h-8 rounded bg-stone-700 hover:bg-stone-600 text-stone-300 flex items-center justify-center shrink-0 transition-colors" title="Rotate grid 90° CW" @click="rotateGridBy(90)"><i class="fa-solid fa-rotate-right text-xs" /></button>
          </div>
        </div>

        <div class="flex flex-col gap-3 mb-1">
          <div class="text-xs text-stone-500">Hex size</div>

          <div>
            <div class="flex justify-between text-xs mb-1">
              <span class="text-stone-400">Width</span>
              <span class="text-stone-300 font-mono">{{ hexWidthDraft }}&thinsp;px</span>
            </div>
            <input
              v-model.number="hexWidthDraft"
              type="range" min="20" max="300" step="2"
              class="w-full accent-parchment-400"
              @mouseup="saveHexSize" @touchend="saveHexSize"
            />
          </div>

          <div>
            <div class="flex justify-between text-xs mb-1">
              <span class="text-stone-400">Height</span>
              <span class="text-stone-300 font-mono">{{ displayHeight }}&thinsp;px<span v-if="hexHeightDraft === null" class="text-stone-500 ml-1">(auto)</span></span>
            </div>
            <input
              v-model.number="hexHeightDraftInput"
              type="range" min="20" max="300" step="2"
              class="w-full accent-parchment-400"
              @mouseup="saveHexSize" @touchend="saveHexSize"
            />
            <button
              class="mt-1 text-xs text-stone-500 hover:text-stone-300 transition-colors"
              @click="resetHeight"
            >Reset to auto (√3 ratio)</button>
          </div>
        </div>

        <p class="text-xs text-stone-600">Pan/zoom until the grid aligns with your image, then adjust width and height until hex outlines match.</p>

        <div class="mt-4">
          <div class="flex gap-1.5">
            <button
              :class="['flex-1 py-1.5 text-xs rounded transition-colors', moveMode === 'none' ? 'bg-parchment-500 text-stone-900 font-semibold' : 'bg-stone-700 text-stone-400 hover:text-stone-200']"
              @click="emit('update:moveMode', 'none')"
            >Off</button>
            <button
              :class="['flex-1 py-1.5 text-xs rounded transition-colors', moveMode === 'image' ? 'bg-parchment-500 text-stone-900 font-semibold' : 'bg-stone-700 text-stone-400 hover:text-stone-200']"
              @click="emit('update:moveMode', 'image')"
            ><i class="fa-solid fa-image mr-1" />Image</button>
            <button
              :class="['flex-1 py-1.5 text-xs rounded transition-colors', moveMode === 'grid' ? 'bg-parchment-500 text-stone-900 font-semibold' : 'bg-stone-700 text-stone-400 hover:text-stone-200']"
              @click="emit('update:moveMode', 'grid')"
            ><i class="fa-solid fa-border-all mr-1" />Grid</button>
          </div>
          <p class="text-xs text-stone-600 mt-1">Select Image or Grid, then drag on the canvas to reposition it.</p>
        </div>

      </div><!-- end alignment controls -->

      <div class="border-t border-stone-700 pt-3">

        <template v-if="isAlignmentLocked && hasHexData">
          <div class="flex items-start gap-2 text-xs text-amber-500/90 mb-2">
            <i class="fa-solid fa-lock mt-0.5 shrink-0" />
            <span>Alignment is permanently locked — this map has hex annotations. Moving or resizing the grid would misalign them with the image.</span>
          </div>
          <button
            :disabled="cloning"
            class="w-full py-1.5 text-xs rounded bg-stone-700 text-stone-300 hover:bg-stone-600 hover:text-stone-100 disabled:opacity-50 transition-colors"
            @click="cloneForRealignment"
          >
            <i class="fa-solid fa-copy mr-1.5" />{{ cloning ? 'Cloning…' : 'Clone map for re-alignment' }}
          </button>
          <p class="text-xs text-stone-600 mt-1">Creates a copy of this map with the same image and grid settings but no hex data, so you can adjust alignment freely.</p>
        </template>

        <template v-else-if="isAlignmentLocked">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-1.5 text-xs text-stone-400">
              <i class="fa-solid fa-lock text-xs" />
              <span>Alignment locked</span>
            </div>
            <button
              title="Unlock alignment"
              class="flex items-center gap-1.5 px-2 py-1 text-xs rounded bg-stone-700 text-stone-400 hover:text-stone-200 transition-colors"
              @click="toggleLock"
            >
              Unlock
            </button>
          </div>
          <p class="text-xs text-stone-600 mt-1">Image and grid move together during panning.</p>
        </template>

        <template v-else>
          <div class="flex items-center justify-between mb-2">
            <span class="text-xs text-stone-500">Lock alignment when done</span>
            <button
              title="Lock alignment — prevents accidental nudges"
              class="flex items-center gap-1.5 px-2 py-1 text-xs rounded bg-stone-700 text-stone-400 hover:text-stone-200 transition-colors"
              @click="toggleLock"
            >
              <i class="fa-solid fa-lock-open" />
              Lock
            </button>
          </div>
          <p class="text-xs text-stone-600">Locking is required before going live. It prevents the grid from shifting and misaligning hex annotations.</p>
        </template>

      </div>

    </template>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { useMapStore } from '@/stores/mapStore.js'
import { useHexStore } from '@/stores/hexStore.js'

const props = defineProps({
  moveMode: { type: String, default: 'none' },
})
const emit = defineEmits(['update:moveMode'])

const mapStore = useMapStore()
const hexStore = useHexStore()

const uploading   = ref(false)
const uploadError = ref('')
const cloning     = ref(false)

const isAlignmentLocked = computed(() => mapStore.gmMapOffsetLocked)
const hasHexData        = computed(() => hexStore.hexCells.size > 0)

const hexWidthDraft      = ref(mapStore.gmMapHexWidth)
const hexHeightDraft     = ref(mapStore.gmMapHexHeight)
const imageRotationDraft = ref(mapStore.gmMapImageRotation)
const gridRotationDraft  = ref(mapStore.gmMapGridRotation)

watch(() => mapStore.gmMap?.id, () => {
  hexWidthDraft.value      = mapStore.gmMapHexWidth
  hexHeightDraft.value     = mapStore.gmMapHexHeight
  imageRotationDraft.value = mapStore.gmMapImageRotation
  gridRotationDraft.value  = mapStore.gmMapGridRotation
})
watch(() => mapStore.gmMapHexWidth,       v => { hexWidthDraft.value      = v })
watch(() => mapStore.gmMapHexHeight,      v => { hexHeightDraft.value     = v })
watch(() => mapStore.gmMapImageRotation,  v => { imageRotationDraft.value = v })
watch(() => mapStore.gmMapGridRotation,   v => { gridRotationDraft.value  = v })

const hexHeightDraftInput = computed({
  get: () => hexHeightDraft.value ?? Math.round(Math.sqrt(3) * hexWidthDraft.value / 2),
  set: (v) => { hexHeightDraft.value = v },
})
const displayHeight = computed(() =>
  hexHeightDraft.value ?? Math.round(Math.sqrt(3) * hexWidthDraft.value / 2)
)

async function setMapType(type) {
  uploadError.value = ''
  await mapStore.updateActiveMap({ mapType: type })
}

async function handleUpload(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  uploadError.value = ''
  uploading.value = true
  try {
    const path = await mapStore.uploadMapImage(file)
    await mapStore.updateActiveMap({ mapImagePath: path, mapType: 'image' })
  } catch (e) {
    uploadError.value = e.message
  } finally {
    uploading.value = false
  }
}

function _clampDeg(v) { return Math.max(0, Math.min(359, v || 0)) }

async function rotateImageBy(delta) {
  imageRotationDraft.value = ((imageRotationDraft.value + delta) % 360 + 360) % 360
  await mapStore.updateActiveMap({ mapImageRotation: imageRotationDraft.value })
}
async function saveImageRotation() {
  imageRotationDraft.value = _clampDeg(imageRotationDraft.value)
  await mapStore.updateActiveMap({ mapImageRotation: imageRotationDraft.value })
}
async function rotateGridBy(delta) {
  gridRotationDraft.value = ((gridRotationDraft.value + delta) % 360 + 360) % 360
  await mapStore.updateActiveMap({ mapGridRotation: gridRotationDraft.value })
}
async function saveGridRotation() {
  gridRotationDraft.value = _clampDeg(gridRotationDraft.value)
  await mapStore.updateActiveMap({ mapGridRotation: gridRotationDraft.value })
}

async function saveHexSize() {
  await mapStore.updateActiveMap({
    mapHexWidth:  hexWidthDraft.value,
    mapHexHeight: hexHeightDraft.value,
  })
}
async function resetHeight() {
  hexHeightDraft.value = null
  await mapStore.updateActiveMap({ mapHexHeight: null })
}

async function toggleLock() {
  const locked = !mapStore.gmMapOffsetLocked
  if (locked) emit('update:moveMode', 'none')
  await mapStore.updateActiveMap({ mapOffsetLocked: locked })
}

async function cloneForRealignment() {
  cloning.value = true
  await mapStore.cloneMap(mapStore.gmMap?.id)
  cloning.value = false
  emit('update:moveMode', 'none')
}
</script>
