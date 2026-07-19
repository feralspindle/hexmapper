<template>
  <SettingsPanel close-testid="dungeon-settings-close" @close="emit('close')">

    <div class="dms-section">
      <UploadControl
        :image-url="dungeonStore.dungeonImageUrl"
        :has-image="!!dungeonStore.dungeon?.map_image_path"
        :uploading="uploading"
        :error="uploadError"
        @file="handleUpload"
      />
      <button
        v-if="dungeonStore.dungeon?.map_image_path"
        class="dms-action-btn dms-action-danger dms-remove-btn"
        data-testid="dungeon-image-remove"
        @click="removeImage"
      >
        Remove image
      </button>
    </div>

    <div v-if="dungeonStore.dungeon?.map_image_path" :class="['dms-section', isLocked ? 'dms-locked' : '']">

      <div class="dms-subsection">
        <div class="dms-label">Image rotation</div>
        <RotationControl
          v-model="rotDraft"
          @step="(v) => saveRotation(v, true)"
          @commit="(v) => saveRotation(v, false)"
        />
      </div>

      <div class="dms-subsection">
        <div class="dms-label-row">
          <div class="dms-label">Image scale</div>
          <div class="dms-unit-toggle">
            <button
              :class="['dms-unit-btn', scaleUnit === 'percent' ? 'active' : '']"
              data-testid="dungeon-scale-unit-percent"
              @click="setScaleUnit('percent')"
            >%</button>
            <button
              :class="['dms-unit-btn', scaleUnit === 'pixels' ? 'active' : '']"
              data-testid="dungeon-scale-unit-pixels"
              @click="setScaleUnit('pixels')"
            >px</button>
          </div>
        </div>
        <ScaleControl
          v-if="scaleUnit === 'percent'"
          v-model="scaleDraft"
          :min="1" :max="1000"
          @save="saveScaleDebounced"
        />
        <ScaleControl
          v-else
          v-model="squarePxDraft"
          :min="SQUARE_PX_MIN" :max="SQUARE_PX_MAX"
          suffix="px" :fallback="CELL_SIZE"
          @save="saveSquarePxDebounced"
        />
        <p class="dms-hint">
          {{ scaleUnit === 'percent'
            ? 'Scale the image to match the grid squares.'
            : "Size of one grid square in the image's own pixels." }}
        </p>
      </div>

      <div class="dms-subsection">
        <div class="dms-label">Drag to reposition</div>
        <MoveModeToggle
          :model-value="moveMode"
          @update:model-value="(v) => emit('update:moveMode', v)"
        />
        <p class="dms-hint">Pan and zoom to align, then adjust scale.</p>
      </div>

    </div>

    <div v-if="dungeonStore.dungeon?.map_image_path" class="dms-section dms-lock-row">
      <div class="dms-lock-state">
        <svg v-if="isLocked" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>
        </svg>
        <svg v-else width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 019.9-1"/>
        </svg>
        <span>{{ isLocked ? 'Alignment locked' : 'Alignment unlocked' }}</span>
      </div>
      <button class="dms-lock-btn" @click="toggleLock">{{ isLocked ? 'Unlock' : 'Lock' }}</button>
    </div>

    <div v-if="dungeonStore.fogMode" class="dms-section">
      <div class="dms-label">Fog of war</div>
      <p class="dms-hint">Players only see cells you've revealed with the fog brush. Use the Switch button in the topbar to leave fog mode.</p>

      <div class="dms-fog-actions">
        <button class="dms-action-btn" @click="revealAll">Reveal all</button>
        <button class="dms-action-btn dms-action-danger" @click="hideAll">Hide all</button>
      </div>
    </div>

  </SettingsPanel>
</template>

<script setup>
import { ref, computed, watch, onUnmounted } from 'vue'
import { useD } from '@/stores/dungeonStore.js'
import { CELL_SIZE } from '@/composables/useDungeonDraw.js'
import { useConfirmDialog } from '@/composables/useConfirmDialog.js'
import { useRoute } from 'vue-router'
import SettingsPanel from '@/components/common/mapSettings/SettingsPanel.vue'
import UploadControl from '@/components/common/mapSettings/UploadControl.vue'
import RotationControl from '@/components/common/mapSettings/RotationControl.vue'
import ScaleControl from '@/components/common/mapSettings/ScaleControl.vue'
import MoveModeToggle from '@/components/common/mapSettings/MoveModeToggle.vue'

defineProps({
  moveMode: { type: String, default: 'none' },
})
const emit = defineEmits(['update:moveMode', 'close'])

const dungeonStore = useD()
const { confirm } = useConfirmDialog()
const route = useRoute()
const dungeonId = route.params.dungeonId
const sessionId = route.params.sessionId

const uploading   = ref(false)
const uploadError = ref('')

const isLocked = computed(() => dungeonStore.dungeon?.map_offset_locked ?? false)

const SCALE_UNIT_KEY = 'dungeon_scale_unit'
const SQUARE_PX_MIN = 2
const SQUARE_PX_MAX = 2000

const scaleUnit = ref(localStorage.getItem(SCALE_UNIT_KEY) === 'pixels' ? 'pixels' : 'percent')

function setScaleUnit(unit) {
  scaleUnit.value = unit
  try { localStorage.setItem(SCALE_UNIT_KEY, unit) } catch {}
}

const _toSquarePx = (scale) => Math.round(CELL_SIZE / (scale || 1))

const rotDraft      = ref(dungeonStore.dungeon?.map_image_rotation ?? 0)
const scaleDraft    = ref(Math.round((dungeonStore.dungeon?.map_image_scale ?? 1) * 100))
const squarePxDraft = ref(_toSquarePx(dungeonStore.dungeon?.map_image_scale ?? 1))

watch(() => dungeonStore.dungeon?.map_image_rotation, v => { rotDraft.value = v ?? 0 })
watch(() => dungeonStore.dungeon?.map_image_scale, v => {
  scaleDraft.value = Math.round((v ?? 1) * 100)
  squarePxDraft.value = _toSquarePx(v ?? 1)
})

let _rotTimer = null
let _scaleTimer = null

async function handleUpload(file) {
  uploadError.value = ''
  uploading.value = true
  try {
    const path = await dungeonStore.uploadDungeonImage(sessionId, file)
    await dungeonStore.updateDungeon({ mapImagePath: path })
  } catch (e) {
    uploadError.value = e.message
  } finally {
    uploading.value = false
  }
}

// updateDungeon writes to whatever dungeon the store holds when it runs, so
// a timer surviving a dungeon switch would land the patch on the wrong one -
// remember the target, fire only while it still matches, and flush a pending
// patch on unmount instead of dropping the last nudge
let _pendingPatch = null

function _flushPendingPatch() {
  const pending = _pendingPatch
  _pendingPatch = null
  if (pending && dungeonStore.dungeon?.id === pending.dungeonId) {
    dungeonStore.updateDungeon(pending.patch)
  }
}

function _schedulePatch(patch) {
  const dungeonId = dungeonStore.dungeon?.id
  const carried = _pendingPatch?.dungeonId === dungeonId ? _pendingPatch.patch : {}
  _pendingPatch = { dungeonId, patch: { ...carried, ...patch } }
  return setTimeout(_flushPendingPatch, 250)
}

function saveRotation(value, immediate) {
  dungeonStore.applyDungeonLocalPatch({ mapImageRotation: value })
  if (immediate) {
    dungeonStore.updateDungeon({ mapImageRotation: value })
  } else {
    clearTimeout(_rotTimer)
    _rotTimer = _schedulePatch({ mapImageRotation: value })
  }
}

function saveScaleDebounced() {
  const pct = Math.max(1, Math.min(1000, scaleDraft.value || 100))
  scaleDraft.value = pct
  _commitScale(pct / 100)
}

function saveSquarePxDebounced() {
  const px = Math.max(SQUARE_PX_MIN, Math.min(SQUARE_PX_MAX, squarePxDraft.value || CELL_SIZE))
  squarePxDraft.value = px
  _commitScale(CELL_SIZE / px)
}

function _commitScale(scale) {
  dungeonStore.applyDungeonLocalPatch({ mapImageScale: scale })
  clearTimeout(_scaleTimer)
  _scaleTimer = _schedulePatch({ mapImageScale: scale })
}

onUnmounted(() => {
  clearTimeout(_rotTimer)
  clearTimeout(_scaleTimer)
  _flushPendingPatch()
})

async function toggleLock() {
  const locked = !isLocked.value
  if (locked) emit('update:moveMode', 'none')
  await dungeonStore.updateDungeon({ mapOffsetLocked: locked })
}

function removeImage() {
  confirm('Remove the map image? Alignment resets too.', () => dungeonStore.clearMapImage(), {
    confirmLabel: 'Remove',
  })
}

async function revealAll() {
  await dungeonStore.revealAllFog(dungeonId)
}

async function hideAll() {
  await dungeonStore.hideAllFog(dungeonId)
}
</script>

<style scoped>
.dms-section {
  padding: 10px 12px;
  border-bottom: 1px solid var(--rule, rgba(58,46,34,.15));
}
.dms-section:last-child { border-bottom: none; }

.dms-locked { opacity: .4; pointer-events: none; user-select: none; }

.dms-subsection + .dms-subsection {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px dashed var(--rule, rgba(58,46,34,.15));
}

.dms-label {
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: .06em;
  color: var(--ink-mute);
  text-transform: uppercase;
  margin-bottom: 6px;
}

.dms-label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
}
.dms-label-row .dms-label { margin-bottom: 0; }

.dms-unit-toggle {
  display: flex;
  border: 1px solid var(--rule-strong);
  border-radius: 2px;
  overflow: hidden;
  flex-shrink: 0;
}
.dms-unit-btn {
  padding: 3px 8px;
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: .03em;
  color: var(--ink-mute);
  background: var(--paper-2);
  border: none;
  border-right: 1px solid var(--rule-strong);
  transition: background .15s, color .15s;
}
.dms-unit-btn:last-child { border-right: none; }
.dms-unit-btn:hover { background: var(--paper-3); color: var(--ink-2); }
.dms-unit-btn.active { background: var(--ink); color: var(--paper); }

.dms-hint {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--ink-mute);
  margin-top: 4px;
  line-height: 1.4;
}

.dms-lock-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.dms-lock-state {
  display: flex;
  align-items: center;
  gap: 6px;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--ink-soft);
}
.dms-lock-btn {
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
.dms-lock-btn:hover { background: var(--paper-3); color: var(--ink); }

.dms-fog-actions {
  display: flex;
  gap: 4px;
  margin-top: 8px;
}
.dms-action-btn {
  flex: 1;
  padding: 5px 8px;
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: .04em;
  color: var(--ink-2);
  background: var(--paper-2);
  border: 1px solid var(--rule-strong);
  border-radius: 2px;
  transition: background .15s, color .15s;
}
.dms-action-btn:hover { background: var(--paper-3); color: var(--ink); }
.dms-remove-btn { width: 100%; margin-top: 6px; }
.dms-action-danger { color: var(--accent); }
.dms-action-danger:hover { background: var(--accent); color: var(--paper); border-color: var(--accent); }
</style>
