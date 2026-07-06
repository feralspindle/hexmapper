<template>
  <div class="dms-panel">

    <div class="dms-header">
      <span class="dms-title">Map Settings</span>
      <button class="dms-close" data-testid="dungeon-settings-close" @click="emit('close')">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <path d="M1 1l10 10M11 1L1 11"/>
        </svg>
      </button>
    </div>

    <div class="dms-section">
      <div v-if="dungeonStore.dungeonImageUrl" class="dms-preview">
        <img :src="dungeonStore.dungeonImageUrl" alt="Map image" />
      </div>
      <div v-else class="dms-preview-empty">No image uploaded</div>

      <label class="dms-upload-btn">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/>
        </svg>
        {{ dungeonStore.dungeon?.map_image_path ? 'Replace image' : 'Upload map image' }}
        <input type="file" accept="image/jpeg,image/png,image/webp" style="display:none" @change="handleUpload" />
      </label>

      <p v-if="uploadError" class="dms-error">{{ uploadError }}</p>
      <p v-if="uploading" class="dms-hint">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" style="animation:dms-spin 1s linear infinite;display:inline-block">
          <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
        </svg>
        Uploading…
      </p>
      <p v-else class="dms-hint">JPEG, PNG, or WebP · max 50 MB</p>
    </div>

    <div v-if="dungeonStore.dungeon?.map_image_path" :class="['dms-section', isLocked ? 'dms-locked' : '']">

      <div class="dms-subsection">
        <div class="dms-label">Image rotation</div>
        <div class="dms-rot-row">
          <button class="dms-rot-btn" @click="rotateBy(-90)">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 12a9 9 0 109-9M3 3v4h4"/>
            </svg>
          </button>
          <div style="position:relative;flex:1">
            <input v-model.number="rotDraft" type="number" min="0" max="359" class="dms-rot-input" @change="saveRotation" />
            <span class="dms-rot-unit">°</span>
          </div>
          <button class="dms-rot-btn" @click="rotateBy(90)">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 12a9 9 0 11-9-9M21 3v4h-4"/>
            </svg>
          </button>
        </div>
      </div>

      <div class="dms-subsection">
        <div class="dms-label">Image scale</div>
        <div class="dms-size-row">
          <input v-model.number="scaleDraft" type="number" min="1" max="1000" step="1" class="dms-size-input" @change="saveScaleDebounced" />
          <span class="dms-size-px">%</span>
        </div>
        <input v-model.number="scaleDraft" type="range" min="1" max="1000" step="1" class="dms-slider" @input="saveScaleDebounced" />
        <p class="dms-hint">Scale the image to match the grid squares.</p>
      </div>

      <div class="dms-subsection">
        <div class="dms-label">Drag to reposition</div>
        <div class="dms-move-row">
          <button :class="['dms-move-btn', moveMode === 'none' ? 'active' : '']" @click="emit('update:moveMode', 'none')">Off</button>
          <button :class="['dms-move-btn', moveMode === 'image' ? 'active' : '']" @click="emit('update:moveMode', 'image')">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>
            </svg>
            Image
          </button>
        </div>
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

    <div class="dms-section">
      <div class="dms-label">Fog of war</div>
      <div class="dms-fog-row">
        <button :class="['dms-fog-btn', dungeonStore.fogMode ? 'active' : '']" data-testid="dungeon-fog-toggle" @click="toggleFogMode">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <path d="M20 17.58A5 5 0 0018 8h-1.26A8 8 0 104 15.25M8 16h.01M12 19h.01M16 16h.01"/>
          </svg>
          {{ dungeonStore.fogMode ? 'Fog on' : 'Fog off' }}
        </button>
      </div>
      <p class="dms-hint">When on, players only see cells you've revealed with the fog brush.</p>

      <div v-if="dungeonStore.fogMode" class="dms-fog-actions">
        <button class="dms-action-btn" @click="revealAll">Reveal all</button>
        <button class="dms-action-btn dms-action-danger" @click="hideAll">Hide all</button>
      </div>
    </div>

  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { useD } from '@/stores/dungeonStore.js'
import { useRoute } from 'vue-router'

defineProps({
  moveMode: { type: String, default: 'none' },
})
const emit = defineEmits(['update:moveMode', 'close'])

const dungeonStore = useD()
const route = useRoute()
const dungeonId = route.params.dungeonId
const sessionId = route.params.sessionId

const uploading   = ref(false)
const uploadError = ref('')

const isLocked = computed(() => dungeonStore.dungeon?.map_offset_locked ?? false)

const rotDraft   = ref(dungeonStore.dungeon?.map_image_rotation ?? 0)
const scaleDraft = ref(Math.round((dungeonStore.dungeon?.map_image_scale ?? 1) * 100))

watch(() => dungeonStore.dungeon?.map_image_rotation, v => { rotDraft.value = v ?? 0 })
watch(() => dungeonStore.dungeon?.map_image_scale,    v => { scaleDraft.value = Math.round((v ?? 1) * 100) })

async function handleUpload(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
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

async function rotateBy(delta) {
  const next = ((rotDraft.value + delta) % 360 + 360) % 360
  rotDraft.value = next
  dungeonStore.applyDungeonLocalPatch({ mapImageRotation: next })
  await dungeonStore.updateDungeon({ mapImageRotation: next })
}

function saveRotation() {
  rotDraft.value = Math.max(0, Math.min(359, rotDraft.value || 0))
  dungeonStore.applyDungeonLocalPatch({ mapImageRotation: rotDraft.value })
  clearTimeout(_rotTimer)
  _rotTimer = setTimeout(() => dungeonStore.updateDungeon({ mapImageRotation: rotDraft.value }), 250)
}

let _rotTimer = null
let _scaleTimer = null

function saveScaleDebounced() {
  const pct = Math.max(1, Math.min(1000, scaleDraft.value || 100))
  scaleDraft.value = pct
  const scale = pct / 100
  dungeonStore.applyDungeonLocalPatch({ mapImageScale: scale })
  clearTimeout(_scaleTimer)
  _scaleTimer = setTimeout(() => dungeonStore.updateDungeon({ mapImageScale: scale }), 250)
}

async function toggleLock() {
  const locked = !isLocked.value
  if (locked) emit('update:moveMode', 'none')
  await dungeonStore.updateDungeon({ mapOffsetLocked: locked })
}

async function toggleFogMode() {
  await dungeonStore.updateDungeon({ fogMode: !dungeonStore.fogMode })
}

async function revealAll() {
  await dungeonStore.revealAllFog(dungeonId)
}

async function hideAll() {
  await dungeonStore.hideAllFog(dungeonId)
}
</script>

<style scoped>
@keyframes dms-spin { to { transform: rotate(360deg); } }

.dms-panel {
  position: absolute;
  left: 72px;
  top: 50%;
  transform: translateY(-50%);
  z-index: 20;
  width: 264px;
  background: var(--paper, #ede1c7);
  border: 1px solid var(--rule-strong, rgba(58,46,34,.35));
  border-radius: 3px;
  box-shadow: 0 6px 24px rgba(0,0,0,.35), 0 1px 4px rgba(0,0,0,.18);
  max-height: 90vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

.dms-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px 8px;
  border-bottom: 1px solid var(--rule-strong, rgba(58,46,34,.3));
  flex-shrink: 0;
}

.dms-title {
  font-family: var(--font-display);
  font-size: 12px;
  letter-spacing: .1em;
  text-transform: uppercase;
  color: var(--ink-2);
}

.dms-close {
  width: 22px; height: 22px;
  display: flex; align-items: center; justify-content: center;
  color: var(--ink-mute);
  border-radius: 2px;
  transition: color .15s, background .15s;
}
.dms-close:hover { color: var(--ink); background: rgba(26,20,16,.08); }

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

.dms-hint {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--ink-mute);
  margin-top: 4px;
  line-height: 1.4;
  display: flex;
  align-items: center;
  gap: 5px;
}

.dms-error {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--accent);
  margin-top: 4px;
}

.dms-preview {
  border: 1px solid var(--rule-strong, rgba(58,46,34,.3));
  border-radius: 2px;
  overflow: hidden;
  margin-bottom: 8px;
}
.dms-preview img {
  display: block;
  width: 100%;
  height: 80px;
  object-fit: cover;
}
.dms-preview-empty {
  height: 52px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px dashed var(--rule-strong, rgba(58,46,34,.3));
  border-radius: 2px;
  margin-bottom: 8px;
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--ink-mute);
  letter-spacing: .04em;
}

.dms-upload-btn {
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
.dms-upload-btn:hover { background: var(--paper-3); color: var(--ink); }

.dms-rot-row {
  display: flex;
  align-items: center;
  gap: 6px;
}
.dms-rot-btn {
  width: 28px; height: 28px;
  flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  background: var(--paper-2);
  border: 1px solid var(--rule-strong);
  border-radius: 2px;
  color: var(--ink-2);
  transition: background .15s, color .15s;
}
.dms-rot-btn:hover { background: var(--paper-3); color: var(--ink); }
.dms-rot-input {
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
.dms-rot-input::-webkit-inner-spin-button,
.dms-rot-input::-webkit-outer-spin-button { -webkit-appearance: none; }
.dms-rot-input:focus { outline: none; border-color: var(--accent); }
.dms-rot-unit {
  position: absolute;
  right: 7px; top: 50%;
  transform: translateY(-50%);
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--ink-mute);
  pointer-events: none;
}

.dms-size-row {
  display: flex;
  align-items: center;
  gap: 6px;
}
.dms-size-input {
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
.dms-size-input::-webkit-inner-spin-button,
.dms-size-input::-webkit-outer-spin-button { -webkit-appearance: none; }
.dms-size-input:focus { outline: none; border-color: var(--accent); }
.dms-size-px {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--ink-mute);
}
.dms-slider {
  display: block;
  width: 100%;
  margin-top: 5px;
  accent-color: var(--ink-2);
}

.dms-move-row { display: flex; gap: 4px; }
.dms-move-btn {
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
.dms-move-btn:hover { color: var(--ink-2); background: var(--paper-3); }
.dms-move-btn.active { background: var(--ink); color: var(--paper); border-color: var(--ink); }

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

.dms-fog-row { display: flex; gap: 4px; margin-bottom: 4px; }
.dms-fog-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: .04em;
  color: var(--ink-mute);
  background: var(--paper-2);
  border: 1px solid var(--rule-strong);
  border-radius: 2px;
  transition: background .15s, color .15s, border-color .15s;
}
.dms-fog-btn:hover { color: var(--ink-2); background: var(--paper-3); }
.dms-fog-btn.active { background: var(--ink); color: var(--paper); border-color: var(--ink); }

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
.dms-action-danger { color: var(--accent); }
.dms-action-danger:hover { background: var(--accent); color: var(--paper); border-color: var(--accent); }
</style>
