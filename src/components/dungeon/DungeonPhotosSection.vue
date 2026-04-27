<template>
  <div class="ds-panel-section" :class="{ collapsed: !open }" style="flex:0 0 auto">
    <div class="ds-section-head" @click="open = !open">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" style="flex:0 0 auto">
        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
        <circle cx="12" cy="13" r="4"/>
      </svg>
      <h3>Photos</h3>
      <span class="ds-meta">{{ photoStore.photos.length }} ref</span>
      <svg class="ds-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <path d="M6 9l6 6 6-6"/>
      </svg>
    </div>


    <template v-if="sessionStore.isGM">
      <div class="ds-section-body" style="padding-bottom:6px">


        <div v-if="pendingFile" class="dps-pending">
          <span class="dps-pending-lbl">Name this photo</span>
          <input
            ref="nameInputEl"
            v-model="pendingName"
            class="dps-name-input"
            placeholder="e.g. Ancient Ring"
            @keyup.enter="confirmUpload"
            @keyup.escape="cancelUpload"
          />
          <p v-if="uploadError" class="dps-error">{{ uploadError }}</p>
          <div style="display:flex;gap:6px;margin-top:6px">
            <button
              class="ds-btn tiny"
              style="flex:1"
              :disabled="photoStore.uploading"
              @click="confirmUpload"
            >
              <i v-if="photoStore.uploading" class="fa-solid fa-spinner fa-spin" style="margin-right:4px" />
              {{ photoStore.uploading ? 'Uploading…' : 'Upload' }}
            </button>
            <button class="ds-btn tiny ghost" style="flex:1" @click="cancelUpload">Cancel</button>
          </div>
        </div>


        <label
          v-else
          class="dps-upload-lbl"
          :class="{ disabled: photoStore.uploading }"
        >
          <i class="fa-solid fa-upload" style="margin-right:6px;font-size:11px" />
          {{ photoStore.uploading ? 'Uploading…' : 'Upload Photo' }}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            style="display:none"
            :disabled="photoStore.uploading"
            @change="handleUpload"
          />
        </label>


        <div v-if="photoStore.loading" class="dps-empty">Loading…</div>
        <div v-else-if="!photoStore.photos.length" class="dps-empty">
          <i class="fa-solid fa-images" style="font-size:18px;margin-bottom:4px;opacity:.4" /><br>No photos yet
        </div>
        <div v-else class="dps-grid">
          <div
            v-for="photo in photoStore.photos"
            :key="photo.id"
            class="dps-card"
          >
            <img :src="photo.url" :alt="photo.name" class="dps-thumb" @click="enlarged = { url: photo.url, name: photo.name }" />
            <div class="dps-card-overlay">
              <button class="ds-btn tiny" @click.stop="broadcast(photo)">
                <i class="fa-solid fa-tower-broadcast" style="margin-right:4px;font-size:10px" />Reveal
              </button>
              <button class="dps-del-btn" @click.stop="remove(photo)">
                <i class="fa-solid fa-trash" style="font-size:10px" />
              </button>
            </div>
            <div class="dps-card-label">{{ photo.name }}</div>
          </div>
        </div>
      </div>
    </template>


    <div
      class="ds-section-body"
      :style="isGM ? 'border-top:1px solid var(--rule);padding-top:8px' : ''"
    >
      <div style="font-family:var(--font-zine);font-size:9.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--ink-mute);margin-bottom:6px">
        Revealed
      </div>
      <div v-if="!photoStore.broadcastHistory.length" class="dps-empty" style="padding:8px 0">
        Nothing revealed yet
      </div>
      <div v-else class="dps-grid">
        <button
          v-for="photo in photoStore.broadcastHistory"
          :key="photo.id"
          class="dps-card dps-card-btn"
          @click="enlarged = { url: photo.photo_url, name: photo.photo_name }"
        >
          <img :src="photo.photo_url" :alt="photo.photo_name" class="dps-thumb" />
          <div class="dps-card-label">{{ photo.photo_name }}</div>
        </button>
      </div>
    </div>
  </div>


  <Teleport to="body">
    <div v-if="enlarged" class="fixed inset-0 z-[200] flex items-center justify-center" @click="enlarged = null">
      <div class="absolute inset-0 bg-black/80 backdrop-blur-sm" />
      <div class="relative mx-4 flex flex-col bg-stone-900 border border-stone-600 rounded-xl shadow-2xl overflow-hidden max-w-2xl w-full" @click.stop>
        <div class="flex items-center justify-between px-4 py-3 shrink-0 border-b border-stone-700">
          <span class="text-sm font-display text-parchment-200 tracking-wide truncate">{{ enlarged.name }}</span>
          <button
            class="ml-3 shrink-0 w-7 h-7 flex items-center justify-center text-stone-400 hover:text-stone-100 hover:bg-stone-700 rounded transition-colors"
            @click="enlarged = null"
          ><i class="fa-solid fa-xmark" /></button>
        </div>
        <img :src="enlarged.url" :alt="enlarged.name" class="block w-full object-contain max-h-[75vh]" />
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, nextTick } from 'vue'
import { usePhotoStore } from '@/stores/photoStore.js'
import { useSessionStore } from '@/stores/sessionStore.js'
import { useConfirmDialog } from '@/composables/useConfirmDialog.js'

const photoStore   = usePhotoStore()
const sessionStore = useSessionStore()
const { confirm: dlg } = useConfirmDialog()

const open        = ref(true)
const pendingFile = ref(null)
const pendingName = ref('')
const uploadError = ref('')
const enlarged    = ref(null)
const nameInputEl = ref(null)

function handleUpload(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  uploadError.value = ''
  pendingFile.value = file
  pendingName.value = file.name.replace(/\.[^.]+$/, '')
  nextTick(() => nameInputEl.value?.focus())
}

async function confirmUpload() {
  if (!pendingFile.value || photoStore.uploading) return
  uploadError.value = ''
  try {
    await photoStore.uploadPhoto(pendingFile.value, pendingName.value)
    pendingFile.value = null
    pendingName.value = ''
  } catch (e) {
    uploadError.value = e.message
  }
}

function cancelUpload() {
  pendingFile.value = null
  pendingName.value = ''
  uploadError.value = ''
}

function broadcast(photo) {
  dlg(
    `Reveal "${photo.name}" to all players?`,
    () => photoStore.broadcastPhoto(photo),
    {
      confirmLabel: 'Reveal',
      confirmIcon:  'fa-solid fa-tower-broadcast fa-xs',
      confirmClass: 'border-parchment-600 text-parchment-200 bg-parchment-800 hover:bg-parchment-700',
    },
  )
}

function remove(photo) {
  dlg(`Delete "${photo.name}"? This cannot be undone.`, () => photoStore.deletePhoto(photo))
}
</script>

<style scoped>
.dps-upload-lbl {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  padding: 6px 10px;
  margin-bottom: 8px;
  background: var(--paper-2);
  border: 1px solid var(--rule-strong);
  border-radius: 3px;
  font-family: var(--font-zine);
  font-size: 10px;
  letter-spacing: .08em;
  text-transform: uppercase;
  color: var(--ink-2);
  cursor: pointer;
  transition: background .15s, color .15s;
  box-sizing: border-box;
}
.dps-upload-lbl:hover {
  background: var(--rule);
  color: var(--ink);
}
.dps-upload-lbl.disabled {
  opacity: .5;
  pointer-events: none;
}

.dps-pending {
  background: var(--paper-2);
  border: 1px solid var(--rule-strong);
  border-radius: 3px;
  padding: 8px;
  margin-bottom: 8px;
}

.dps-pending-lbl {
  display: block;
  font-family: var(--font-zine);
  font-size: 9.5px;
  letter-spacing: .08em;
  text-transform: uppercase;
  color: var(--ink-mute);
  margin-bottom: 5px;
}

.dps-name-input {
  width: 100%;
  background: var(--paper);
  border: 1px solid var(--rule-strong);
  border-radius: 3px;
  padding: 5px 8px;
  font-family: var(--font-body);
  font-size: 12px;
  color: var(--ink);
  outline: none;
  box-sizing: border-box;
  transition: border-color .15s;
}
.dps-name-input:focus {
  border-color: var(--accent);
}
.dps-name-input::placeholder {
  color: var(--ink-mute);
}

.dps-error {
  font-family: var(--font-body);
  font-size: 11px;
  color: #c0392b;
  margin: 4px 0 0;
}

.dps-empty {
  font-family: var(--font-body);
  font-style: italic;
  font-size: 12px;
  color: var(--ink-mute);
  text-align: center;
  padding: 12px 0;
}

.dps-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 5px;
}

.dps-card {
  position: relative;
  overflow: hidden;
  border-radius: 3px;
  background: var(--paper-2);
  border: 1px solid var(--rule);
}

.dps-card-btn {
  display: block;
  text-align: left;
  padding: 0;
  cursor: pointer;
  transition: border-color .15s;
}
.dps-card-btn:hover {
  border-color: var(--rule-strong);
}

.dps-thumb {
  display: block;
  width: 100%;
  height: 72px;
  object-fit: cover;
  cursor: pointer;
  transition: opacity .15s;
}
.dps-card:hover .dps-thumb {
  opacity: .7;
}

.dps-card-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  background: rgba(0,0,0,.5);
  opacity: 0;
  transition: opacity .15s;
}
.dps-card:hover .dps-card-overlay {
  opacity: 1;
}

.dps-del-btn {
  width: 26px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(180,40,30,.85);
  border: none;
  border-radius: 3px;
  color: #fff;
  cursor: pointer;
  font-size: 11px;
  transition: background .15s;
}
.dps-del-btn:hover {
  background: rgba(200,50,40,1);
}

.dps-card-label {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: linear-gradient(to top, rgba(0,0,0,.72) 0%, transparent 100%);
  padding: 12px 5px 3px;
  font-family: var(--font-body);
  font-size: 10px;
  color: rgba(237,225,199,.9);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

</style>
