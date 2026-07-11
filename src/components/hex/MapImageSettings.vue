<template>
  <SettingsPanel panel-class="map-settings-panel" @close="emit('close')">

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
      <UploadControl
        :image-url="mapStore.activeMapImageUrl"
        :has-image="!!mapStore.activeMap?.map_image_path"
        :uploading="uploading"
        :error="uploadError"
        hint="JPEG, PNG, or WebP I guess if youre a fucking psychopath · max 50 MB"
        @file="handleUpload"
      />
    </div>

    <div v-if="hexMode === 'fow'" :class="['map-settings-section', isAlignmentLocked ? 'map-settings-locked' : '']">

      <div class="map-settings-subsection">
        <div class="map-settings-label">Image rotation</div>
        <RotationControl
          v-model="imageRotationDraft"
          what="image"
          @step="(v) => saveRotationField('mapImageRotation', v, true)"
          @commit="(v) => saveRotationField('mapImageRotation', v, false, 'imageRotation')"
        />
      </div>

      <div class="map-settings-subsection">
        <div class="map-settings-label">Grid rotation</div>
        <RotationControl
          v-model="gridRotationDraft"
          what="grid"
          @step="(v) => saveRotationField('mapGridRotation', v, true)"
          @commit="(v) => saveRotationField('mapGridRotation', v, false, 'gridRotation')"
        />
      </div>

      <div class="map-settings-subsection">
        <div class="map-settings-label">Image scale</div>
        <ScaleControl v-model="imageScaleDraft" :min="25" :max="400" @save="saveImageScaleDebounced" />
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
        <MoveModeToggle
          :model-value="moveMode"
          :modes="['image', 'grid']"
          @update:model-value="(v) => emit('update:moveMode', v)"
        />
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

  </SettingsPanel>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { useMapStore } from '@/stores/mapStore.js'
import { DEFAULT_GRID_COLS, DEFAULT_GRID_ROWS } from '@/composables/useHexGeometry.js'
import SettingsPanel from '@/components/common/mapSettings/SettingsPanel.vue'
import UploadControl from '@/components/common/mapSettings/UploadControl.vue'
import RotationControl from '@/components/common/mapSettings/RotationControl.vue'
import ScaleControl from '@/components/common/mapSettings/ScaleControl.vue'
import MoveModeToggle from '@/components/common/mapSettings/MoveModeToggle.vue'

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

async function handleUpload(file) {
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

function saveRotationField(field, value, immediate, debounceKey) {
  if (immediate) {
    mapStore.applyLocalPatch({ [field]: value })
    mapStore.updateActiveMap({ [field]: value })
  } else {
    _scheduleSave(debounceKey, () => ({ [field]: value }))
  }
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
}

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
