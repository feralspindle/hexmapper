<template>
  <div class="map-settings-panel">

    <div class="map-settings-header">
      <span class="map-settings-title">Map Settings</span>
      <button class="map-settings-close" data-testid="map-settings-close" title="Close" @click="emit('close')">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <path d="M1 1l10 10M11 1L1 11"/>
        </svg>
      </button>
    </div>

    <div class="map-settings-section">
      <div class="map-settings-subsection">
        <div class="map-settings-label">Scale per hex</div>
        <div class="map-scale-row">
          <div style="position:relative;flex:1">
            <input
              v-model.number="scaleDraft"
              type="number" min="0" step="any"
              placeholder="e.g. 6"
              class="map-rot-input"
              style="padding-right:8px;text-align:left"
              @change="saveScale"
            />
          </div>
          <div class="map-scale-unit-toggle">
            <button
              :class="['map-scale-unit-btn', scaleUnitDraft === 'miles' ? 'active' : '']"
              @click="setUnit('miles')"
            >mi</button>
            <button
              :class="['map-scale-unit-btn', scaleUnitDraft === 'feet' ? 'active' : '']"
              @click="setUnit('feet')"
            >ft</button>
          </div>
        </div>
        <p class="map-settings-hint">Leave blank to hide scale from players.</p>
      </div>
    </div>

    <div class="map-settings-section">
      <div class="map-settings-subsection">
        <div class="map-settings-label">Grid size</div>
        <div class="map-size-row">
          <span class="map-grid-axis-label">Cols</span>
          <button class="map-step-btn" title="Fewer columns" @click="stepGridCols(-GRID_STEP)">−</button>
          <input
            v-model.number="gridColsDraft"
            type="number" :min="GRID_MIN" :max="GRID_MAX" step="1"
            class="map-size-input"
            @input="_gridEdited.cols = true"
            @change="saveGridCols"
          />
          <button class="map-step-btn" title="More columns" @click="stepGridCols(GRID_STEP)">+</button>
        </div>
        <div class="map-size-row" style="margin-top:6px">
          <span class="map-grid-axis-label">Rows</span>
          <button class="map-step-btn" title="Fewer rows" @click="stepGridRows(-GRID_STEP)">−</button>
          <input
            v-model.number="gridRowsDraft"
            type="number" :min="GRID_MIN" :max="GRID_MAX" step="1"
            class="map-size-input"
            @input="_gridEdited.rows = true"
            @change="saveGridRows"
          />
          <button class="map-step-btn" title="More rows" @click="stepGridRows(GRID_STEP)">+</button>
        </div>
        <p class="map-settings-hint">Number of hex columns and rows on the map.</p>
        <button
          v-if="mapStore.mapGridCols != null || mapStore.mapGridRows != null"
          class="map-reset-btn"
          @click="resetGridSize"
        >Reset to default</button>
      </div>
    </div>

    <div v-if="hexMode === 'fow'" class="map-settings-section">
      <div v-if="mapStore.activeMapImageUrl" class="map-preview">
        <img :src="mapStore.activeMapImageUrl" alt="Map image" />
      </div>
      <div v-else class="map-preview-empty">No image uploaded</div>

      <label class="map-upload-btn">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/>
        </svg>
        {{ mapStore.activeMap?.map_image_path ? 'Replace image' : 'Upload map image' }}
        <input type="file" accept="image/jpeg,image/png,image/webp" style="display:none" @change="handleUpload" />
      </label>

      <p v-if="uploadError" class="map-settings-error">{{ uploadError }}</p>
      <p v-if="uploading" class="map-settings-hint">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" style="animation:spin 1s linear infinite;display:inline-block">
          <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
        </svg>
        Uploading…
      </p>
      <p v-else class="map-settings-hint">JPEG, PNG, or WebP I guess if youre a fucking psychopath · max 50 MB</p>
    </div>

    <div v-if="hexMode === 'fow'" :class="['map-settings-section', isAlignmentLocked ? 'map-settings-locked' : '']">

      <div class="map-settings-subsection">
        <div class="map-settings-label">Image rotation</div>
        <div class="map-rot-row">
          <button class="map-rot-btn" title="Rotate image 90° CCW" @click="rotateImageBy(-90)">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 12a9 9 0 109-9M3 3v4h4"/>
            </svg>
          </button>
          <div style="position:relative;flex:1">
            <input
              v-model.number="imageRotationDraft"
              type="number" min="0" max="359"
              class="map-rot-input"
              @change="saveImageRotation"
            />
            <span class="map-rot-unit">°</span>
          </div>
          <button class="map-rot-btn" title="Rotate image 90° CW" @click="rotateImageBy(90)">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 12a9 9 0 11-9-9M21 3v4h-4"/>
            </svg>
          </button>
        </div>
      </div>

      <div class="map-settings-subsection">
        <div class="map-settings-label">Grid rotation</div>
        <div class="map-rot-row">
          <button class="map-rot-btn" title="Rotate grid 90° CCW" @click="rotateGridBy(-90)">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 12a9 9 0 109-9M3 3v4h4"/>
            </svg>
          </button>
          <div style="position:relative;flex:1">
            <input
              v-model.number="gridRotationDraft"
              type="number" min="0" max="359"
              class="map-rot-input"
              @change="saveGridRotation"
            />
            <span class="map-rot-unit">°</span>
          </div>
          <button class="map-rot-btn" title="Rotate grid 90° CW" @click="rotateGridBy(90)">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 12a9 9 0 11-9-9M21 3v4h-4"/>
            </svg>
          </button>
        </div>
      </div>

      <div class="map-settings-subsection">
        <div class="map-settings-label">Image scale</div>
        <div class="map-size-row">
          <input
            v-model.number="imageScaleDraft"
            type="number" min="25" max="400" step="1"
            class="map-size-input"
            @change="saveImageScaleDebounced"
          />
          <span class="map-size-px">%</span>
        </div>
        <input
          v-model.number="imageScaleDraft"
          type="range" min="25" max="400" step="1"
          class="map-slider"
          @input="saveImageScaleDebounced"
        />
        <p class="map-settings-hint">Scale the background image to match the hex grid.</p>
      </div>

      <div class="map-settings-subsection">
        <div class="map-settings-label">Hex size</div>
        <div class="map-size-row">
          <span class="map-size-unit-label">W</span>
          <input
            v-model.number="hexWidthDraft"
            type="number" min="20" max="300" step="0.1"
            class="map-size-input"
            @change="saveHexSizeDebounced"
          />
          <span class="map-size-px">px</span>
        </div>
        <input
          v-model.number="hexWidthDraft"
          type="range" min="20" max="300" step="0.1"
          class="map-slider"
          @input="saveHexSizeDebounced"
        />
        <div class="map-size-row" style="margin-top:6px">
          <span class="map-size-unit-label">H</span>
          <input
            v-model.number="hexHeightDraftInput"
            type="number" min="20" max="300" step="0.1"
            class="map-size-input"
            @change="saveHexSizeDebounced"
          />
          <span class="map-size-px">px</span>
        </div>
        <input
          v-model.number="hexHeightDraftInput"
          type="range" min="20" max="300" step="0.1"
          class="map-slider"
          @input="saveHexSizeDebounced"
        />
        <button class="map-reset-btn" @click="resetHeight">Reset H to auto (√3 ratio)</button>
      </div>

      <div class="map-settings-subsection">
        <div class="map-settings-label">Drag to reposition</div>
        <div class="map-move-row">
          <button
            :class="['map-move-btn', moveMode === 'none' ? 'active' : '']"
            @click="emit('update:moveMode', 'none')"
          >Off</button>
          <button
            :class="['map-move-btn', moveMode === 'image' ? 'active' : '']"
            @click="emit('update:moveMode', 'image')"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>
            </svg>
            Image
          </button>
          <button
            :class="['map-move-btn', moveMode === 'grid' ? 'active' : '']"
            @click="emit('update:moveMode', 'grid')"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z"/>
            </svg>
            Grid
          </button>
        </div>
        <p class="map-settings-hint">Pan and zoom until aligned, then adjust hex size to fit.</p>
      </div>

    </div>

    <div v-if="hexMode === 'fow'" class="map-settings-section map-lock-row">
      <div class="map-lock-state">
        <svg v-if="isAlignmentLocked" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>
        </svg>
        <svg v-else width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 019.9-1"/>
        </svg>
        <span>{{ isAlignmentLocked ? 'Alignment locked' : 'Alignment unlocked' }}</span>
      </div>
      <button class="map-lock-btn" @click="toggleLock">
        {{ isAlignmentLocked ? 'Unlock' : 'Lock' }}
      </button>
    </div>

  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { useMapStore } from '@/stores/mapStore.js'
import { DEFAULT_GRID_COLS, DEFAULT_GRID_ROWS } from '@/composables/useHexGeometry.js'

const props = defineProps({
  moveMode: { type: String, default: 'none' },
  hexMode:  { type: String, default: null },
  effectiveCols: { type: Number, default: null },
  effectiveRows: { type: Number, default: null },
})
const emit = defineEmits(['update:moveMode', 'close'])

const mapStore = useMapStore()

const uploading   = ref(false)
const uploadError = ref('')

const isAlignmentLocked = computed(() => mapStore.mapOffsetLocked)

const GRID_MIN = 10
const GRID_MAX = 150
const GRID_STEP = 5

const hexWidthDraft      = ref(mapStore.mapHexWidth)
const hexHeightDraft     = ref(mapStore.mapHexHeight)
const imageRotationDraft = ref(mapStore.mapImageRotation)
const gridRotationDraft  = ref(mapStore.mapGridRotation)
const scaleDraft         = ref(mapStore.mapScale)
const scaleUnitDraft     = ref(mapStore.mapScaleUnit)
const imageScaleDraft    = ref(Math.round((mapStore.mapImageScale ?? 1) * 100))
const gridColsDraft      = ref(props.effectiveCols ?? mapStore.mapGridCols ?? DEFAULT_GRID_COLS)
const gridRowsDraft      = ref(props.effectiveRows ?? mapStore.mapGridRows ?? DEFAULT_GRID_ROWS)
const _gridEdited        = { cols: false, rows: false }

watch(() => mapStore.activeMap?.id, () => {
  hexWidthDraft.value      = mapStore.mapHexWidth
  hexHeightDraft.value     = mapStore.mapHexHeight
  imageRotationDraft.value = mapStore.mapImageRotation
  gridRotationDraft.value  = mapStore.mapGridRotation
  scaleDraft.value         = mapStore.mapScale
  scaleUnitDraft.value     = mapStore.mapScaleUnit
  imageScaleDraft.value    = Math.round((mapStore.mapImageScale ?? 1) * 100)
  _gridEdited.cols         = false
  _gridEdited.rows         = false
  gridColsDraft.value      = props.effectiveCols ?? mapStore.mapGridCols ?? DEFAULT_GRID_COLS
  gridRowsDraft.value      = props.effectiveRows ?? mapStore.mapGridRows ?? DEFAULT_GRID_ROWS
})
watch(() => mapStore.mapHexWidth,       v => { hexWidthDraft.value      = v })
watch(() => mapStore.mapHexHeight,      v => { hexHeightDraft.value     = v })
watch(() => mapStore.mapImageRotation,  v => { imageRotationDraft.value = v })
watch(() => mapStore.mapGridRotation,   v => { gridRotationDraft.value  = v })
watch(() => mapStore.mapScale,          v => { scaleDraft.value         = v })
watch(() => mapStore.mapScaleUnit,      v => { scaleUnitDraft.value     = v })
watch(() => mapStore.mapImageScale,     v => { imageScaleDraft.value    = Math.round((v ?? 1) * 100) })
watch(() => props.effectiveCols,        v => { if (v != null && !_gridEdited.cols) gridColsDraft.value = v })
watch(() => props.effectiveRows,        v => { if (v != null && !_gridEdited.rows) gridRowsDraft.value = v })

const hexHeightDraftInput = computed({
  get: () => hexHeightDraft.value ?? Math.round(Math.sqrt(3) * hexWidthDraft.value / 2),
  set: (v) => { hexHeightDraft.value = v },
})

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

const _saveTimers = {}
function _scheduleSave(key, getPatch) {
  mapStore.applyLocalPatch(getPatch())
  clearTimeout(_saveTimers[key])
  _saveTimers[key] = setTimeout(() => {
    delete _saveTimers[key]
    mapStore.updateActiveMap(getPatch())
  }, 250)
}
function _cancelSave(key) {
  clearTimeout(_saveTimers[key])
  delete _saveTimers[key]
}

async function rotateImageBy(delta) {
  imageRotationDraft.value = ((imageRotationDraft.value + delta) % 360 + 360) % 360
  mapStore.applyLocalPatch({ mapImageRotation: imageRotationDraft.value })
  await mapStore.updateActiveMap({ mapImageRotation: imageRotationDraft.value })
}
function saveImageRotation() {
  imageRotationDraft.value = _clampDeg(imageRotationDraft.value)
  _scheduleSave('imageRotation', () => ({ mapImageRotation: imageRotationDraft.value }))
}
async function rotateGridBy(delta) {
  gridRotationDraft.value = ((gridRotationDraft.value + delta) % 360 + 360) % 360
  mapStore.applyLocalPatch({ mapGridRotation: gridRotationDraft.value })
  await mapStore.updateActiveMap({ mapGridRotation: gridRotationDraft.value })
}
function saveGridRotation() {
  gridRotationDraft.value = _clampDeg(gridRotationDraft.value)
  _scheduleSave('gridRotation', () => ({ mapGridRotation: gridRotationDraft.value }))
}

function saveImageScaleDebounced() {
  imageScaleDraft.value = Math.max(25, Math.min(400, imageScaleDraft.value || 100))
  _scheduleSave('imageScale', () => ({ mapImageScale: imageScaleDraft.value / 100 }))
}

function saveHexSizeDebounced() {
  if (hexWidthDraft.value != null)
    hexWidthDraft.value = Math.max(20, Math.min(300, hexWidthDraft.value || 20))
  _scheduleSave('hexSize', () => ({
    mapHexWidth:  hexWidthDraft.value,
    mapHexHeight: hexHeightDraft.value,
  }))
}
async function resetHeight() {
  hexHeightDraft.value = null
  await mapStore.updateActiveMap({ mapHexHeight: null })
}

function _clampGrid(v, fallback) {
  const n = Math.round(Number(v))
  if (!Number.isFinite(n)) return fallback
  return Math.max(GRID_MIN, Math.min(GRID_MAX, n))
}

function saveGridCols() {
  _gridEdited.cols = true
  gridColsDraft.value = _clampGrid(gridColsDraft.value, mapStore.mapGridCols ?? DEFAULT_GRID_COLS)
  _scheduleSave('gridCols', () => ({ mapGridCols: gridColsDraft.value }))
}
function saveGridRows() {
  _gridEdited.rows = true
  gridRowsDraft.value = _clampGrid(gridRowsDraft.value, mapStore.mapGridRows ?? DEFAULT_GRID_ROWS)
  _scheduleSave('gridRows', () => ({ mapGridRows: gridRowsDraft.value }))
}
function stepGridCols(delta) {
  gridColsDraft.value = (Number(gridColsDraft.value) || DEFAULT_GRID_COLS) + delta
  saveGridCols()
}
function stepGridRows(delta) {
  gridRowsDraft.value = (Number(gridRowsDraft.value) || DEFAULT_GRID_ROWS) + delta
  saveGridRows()
}

async function resetGridSize() {
  _cancelSave('gridCols')
  _cancelSave('gridRows')
  _gridEdited.cols = false
  _gridEdited.rows = false
  mapStore.applyLocalPatch({ mapGridCols: null, mapGridRows: null })
  await mapStore.updateActiveMap({ mapGridCols: null, mapGridRows: null })
}

async function toggleLock() {
  const locked = !mapStore.mapOffsetLocked
  if (locked) emit('update:moveMode', 'none')
  await mapStore.updateActiveMap({ mapOffsetLocked: locked })
}

async function saveScale() {
  const v = scaleDraft.value
  await mapStore.updateActiveMap({ mapScale: (v === '' || v == null) ? null : Number(v) })
}

async function setUnit(unit) {
  scaleUnitDraft.value = unit
  await mapStore.updateActiveMap({ mapScaleUnit: unit })
}
</script>

<style scoped>
@keyframes spin { to { transform: rotate(360deg); } }

.map-settings-panel {
  position: absolute;
  left: 72px;
  top: 50%;
  transform: translateY(-50%);
  z-index: 20;
  width: 272px;
  background: var(--paper);
  border: 1px solid var(--rule-strong);
  border-radius: 3px;
  box-shadow: 0 6px 24px rgba(26,20,16,0.22), 0 1px 4px rgba(26,20,16,0.12);
  max-height: 90vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

.map-settings-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px 8px;
  border-bottom: 1px solid var(--rule-strong);
  flex-shrink: 0;
}

.map-settings-title {
  font-family: var(--font-display);
  font-size: 12px;
  letter-spacing: .1em;
  text-transform: uppercase;
  color: var(--ink-2);
}

.map-settings-close {
  width: 22px; height: 22px;
  display: flex; align-items: center; justify-content: center;
  color: var(--ink-mute);
  border-radius: 2px;
  transition: color .15s, background .15s;
}
.map-settings-close:hover { color: var(--ink); background: rgba(26,20,16,.08); }

.map-settings-section {
  padding: 10px 12px;
  border-bottom: 1px solid var(--rule);
}
.map-settings-section:last-child { border-bottom: none; }

.map-settings-locked {
  opacity: .4;
  pointer-events: none;
  user-select: none;
}

.map-settings-subsection + .map-settings-subsection {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px dashed var(--rule);
}

.map-settings-label {
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: .06em;
  color: var(--ink-mute);
  text-transform: uppercase;
  margin-bottom: 6px;
}

.map-settings-hint {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--ink-mute);
  margin-top: 4px;
  line-height: 1.4;
  display: flex;
  align-items: center;
  gap: 5px;
}

.map-settings-error {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--accent);
  margin-top: 4px;
}

/* Image preview */
.map-preview {
  border: 1px solid var(--rule-strong);
  border-radius: 2px;
  overflow: hidden;
  margin-bottom: 8px;
}
.map-preview img {
  display: block;
  width: 100%;
  height: 80px;
  object-fit: cover;
}
.map-preview-empty {
  height: 52px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px dashed var(--rule-strong);
  border-radius: 2px;
  margin-bottom: 8px;
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--ink-mute);
  letter-spacing: .04em;
}

.map-upload-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  padding: 6px 10px;
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: .04em;
  color: var(--ink-2);
  background: var(--paper-2);
  border: 1px solid var(--rule-strong);
  border-radius: 2px;
  cursor: pointer;
  transition: background .15s, color .15s;
}
.map-upload-btn:hover { background: var(--paper-3); color: var(--ink); }

/* Rotation controls */
.map-rot-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.map-rot-btn {
  width: 28px; height: 28px;
  flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  background: var(--paper-2);
  border: 1px solid var(--rule-strong);
  border-radius: 2px;
  color: var(--ink-2);
  transition: background .15s, color .15s;
}
.map-rot-btn:hover { background: var(--paper-3); color: var(--ink); }

.map-rot-input {
  width: 100%;
  padding: 4px 24px 4px 8px;
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--ink);
  background: var(--paper-2);
  border: 1px solid var(--rule-strong);
  border-bottom: 2px solid var(--rule-strong);
  border-radius: 2px;
  text-align: center;
  appearance: textfield;
  -moz-appearance: textfield;
}
.map-rot-input::-webkit-inner-spin-button,
.map-rot-input::-webkit-outer-spin-button { -webkit-appearance: none; }
.map-rot-input:focus { outline: none; border-color: var(--accent); }

.map-rot-unit {
  position: absolute;
  right: 7px;
  top: 50%;
  transform: translateY(-50%);
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--ink-mute);
  pointer-events: none;
}

/* Hex size */
.map-size-row {
  display: flex;
  align-items: center;
  gap: 6px;
}
.map-size-unit-label {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--ink-mute);
  width: 10px;
  flex-shrink: 0;
}
.map-size-input {
  width: 64px;
  padding: 4px 20px 4px 8px;
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--ink);
  background: var(--paper-2);
  border: 1px solid var(--rule-strong);
  border-bottom: 2px solid var(--rule-strong);
  border-radius: 2px;
  text-align: center;
  appearance: textfield;
  -moz-appearance: textfield;
}
.map-size-input::-webkit-inner-spin-button,
.map-size-input::-webkit-outer-spin-button { -webkit-appearance: none; }
.map-size-input:focus { outline: none; border-color: var(--accent); }
.map-size-px {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--ink-mute);
}

.map-slider {
  display: block;
  width: 100%;
  margin-top: 5px;
  accent-color: var(--ink-2);
}

.map-grid-axis-label {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--ink-mute);
  width: 26px;
  flex-shrink: 0;
}

.map-step-btn {
  width: 26px; height: 26px;
  flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  font-family: var(--font-mono);
  font-size: 15px;
  line-height: 1;
  color: var(--ink-2);
  background: var(--paper-2);
  border: 1px solid var(--rule-strong);
  border-radius: 2px;
  transition: background .15s, color .15s;
}
.map-step-btn:hover { background: var(--paper-3); color: var(--ink); }

.map-reset-btn {
  margin-top: 4px;
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--ink-mute);
  transition: color .15s;
}
.map-reset-btn:hover { color: var(--ink-2); }

/* Move mode */
.map-move-row {
  display: flex;
  gap: 4px;
}
.map-move-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 5px 4px;
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: .03em;
  color: var(--ink-mute);
  background: var(--paper-2);
  border: 1px solid var(--rule-strong);
  border-radius: 2px;
  transition: background .15s, color .15s, border-color .15s;
}
.map-move-btn:hover { color: var(--ink-2); background: var(--paper-3); }
.map-move-btn.active {
  background: var(--ink);
  color: var(--paper);
  border-color: var(--ink);
}

/* Scale */
.map-scale-row {
  display: flex;
  align-items: center;
  gap: 6px;
}
.map-scale-unit-toggle {
  display: flex;
  border: 1px solid var(--rule-strong);
  border-radius: 2px;
  overflow: hidden;
  flex-shrink: 0;
}
.map-scale-unit-btn {
  padding: 4px 8px;
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: .03em;
  color: var(--ink-mute);
  background: var(--paper-2);
  border: none;
  border-right: 1px solid var(--rule-strong);
  transition: background .15s, color .15s;
}
.map-scale-unit-btn:last-child { border-right: none; }
.map-scale-unit-btn:hover { background: var(--paper-3); color: var(--ink-2); }
.map-scale-unit-btn.active { background: var(--ink); color: var(--paper); }

/* Lock toggle */
.map-lock-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.map-lock-state {
  display: flex;
  align-items: center;
  gap: 6px;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--ink-soft);
}
.map-lock-btn {
  padding: 4px 10px;
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: .04em;
  color: var(--ink-2);
  background: var(--paper-2);
  border: 1px solid var(--rule-strong);
  border-radius: 2px;
  flex-shrink: 0;
  transition: background .15s, color .15s;
}
.map-lock-btn:hover { background: var(--paper-3); color: var(--ink); }
</style>
