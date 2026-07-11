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
        <div class="dms-label">Image scale</div>
        <ScaleControl v-model="scaleDraft" :min="1" :max="1000" @save="saveScaleDebounced" />
        <p class="dms-hint">Scale the image to match the grid squares.</p>
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

  </SettingsPanel>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { useD } from '@/stores/dungeonStore.js'
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

function saveRotation(value, immediate) {
  dungeonStore.applyDungeonLocalPatch({ mapImageRotation: value })
  if (immediate) {
    dungeonStore.updateDungeon({ mapImageRotation: value })
  } else {
    clearTimeout(_rotTimer)
    _rotTimer = setTimeout(() => dungeonStore.updateDungeon({ mapImageRotation: value }), 250)
  }
}

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
