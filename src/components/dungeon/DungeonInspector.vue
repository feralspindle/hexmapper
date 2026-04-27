<template>
  <div class="ds-panel-section" :class="{ collapsed: !open }">
    <div class="ds-section-head" @click="open = !open">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" style="flex:0 0 auto">
        <circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v5h1"/>
      </svg>
      <h3>Inspector</h3>
      <span v-if="selectedRoom" class="ds-meta">{{ selectedRoom.label || 'Room' }}</span>
      <svg class="ds-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <path d="M6 9l6 6 6-6"/>
      </svg>
    </div>

    <div class="ds-section-body" style="min-height:120px;max-height:420px">

      <div v-if="!dungeonStore.selectedElement" class="ds-inspector-empty">
        <span class="ds-glyph">✦</span>
        Select a room to inspect
      </div>

      <template v-else-if="selectedRoom">

        <div>
          <label class="ds-field-label">Room Name</label>
          <input
            v-model="roomLabel"
            class="ds-input"
            placeholder="e.g. Throne Room"
            @input="debouncedSave"
          />
        </div>


        <div class="ds-dims-readout">
          <span style="font-family:var(--font-zine);font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:var(--ink-mute)">Size</span>
          <span style="background:var(--paper);border:1px solid var(--rule-strong);padding:3px 8px;letter-spacing:.04em">
            {{ selectedRoom.width * 5 }} × {{ selectedRoom.height * 5 }} ft
          </span>
        </div>

        <div>
          <label class="ds-field-label">Notes</label>
          <div style="display:flex;flex-direction:column;gap:4px;margin-bottom:6px">
            <div
              v-if="!notesStore.notes.length && !notesStore.loading"
              style="font-family:var(--font-body);font-style:italic;font-size:13px;color:var(--ink-mute);padding:8px 0"
            >No notes yet.</div>
            <div
              v-for="note in notesStore.notes"
              :key="note.id"
              class="ds-note"
              :style="{ '--note-color': noteColor(note.user_id) }"
            >
              <div class="ds-note-meta">
                <span class="ds-note-author">{{ note.display_name }}</span>
                <div style="display:flex;align-items:center;gap:6px">
                  <span class="ds-note-time">{{ timeAgo(note.created_at) }}</span>
                  <button
                    v-if="note.user_id === authStore.user?.id"
                    class="ds-x-btn"
                    style="width:16px;height:16px;font-size:11px"
                    @click="confirm('Delete this note?', () => notesStore.deleteNote(note.id))"
                  >×</button>
                </div>
              </div>
              <p style="margin:0;white-space:pre-wrap;word-break:break-word;font-size:13px">{{ note.body }}</p>
            </div>
          </div>

          <div style="display:flex;flex-direction:column;gap:6px">
            <textarea
              v-model="newNote"
              class="ds-input"
              placeholder="Add a note… (Ctrl+Enter)"
              rows="2"
              @keydown.ctrl.enter.prevent="saveNote"
            />
            <div style="display:flex;justify-content:flex-end">
              <button class="ds-btn tiny" :disabled="!newNote.trim() || savingNote" @click="saveNote">Save</button>
            </div>
          </div>
        </div>

      
        <div v-if="selectedRoom.items?.length">
          <label class="ds-field-label">Contents</label>
          <div style="display:flex;flex-direction:column;gap:4px">
            <div
              v-for="item in selectedRoom.items"
              :key="item.id"
              class="ds-content-card"
              :class="`kind-${item.type}`"
            >
              <div class="ds-content-stamp">
                <i :class="faClassForType(item.type)" style="font-size:12px" />
              </div>
              <span class="ds-content-name">{{ item.label ?? item.type }}</span>
              <button
                class="ds-x-btn"
                @click="confirm('Remove this item?', () => dungeonStore.removeRoomItem(selectedRoom.id, item.id))"
              >×</button>
            </div>
          </div>
        </div>
      </template>


      <template v-else-if="selectedCorridor">
        <div>
          <label class="ds-field-label">Corridor Label</label>
          <input v-model="roomLabel" class="ds-input" placeholder="e.g. Main passage" @input="debouncedSave" />
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { useD } from '@/stores/dungeonStore.js'
import { useNotesStore } from '@/stores/notesStore.js'
import { useAuthStore } from '@/stores/authStore.js'
import { useSessionStore } from '@/stores/sessionStore.js'
import { useConfirmDialog } from '@/composables/useConfirmDialog.js'
import { faClassForType } from '@/lib/roomItems.js'
import { playerColorFor } from '@/composables/usePlayerColor.js'

const dungeonStore  = useD()
const notesStore    = useNotesStore()
const authStore     = useAuthStore()
const sessionStore  = useSessionStore()
const { confirm }   = useConfirmDialog()

const open = ref(true)

const selectedRoom     = computed(() => dungeonStore.selectedElement?.type === 'room' ? dungeonStore.rooms.get(dungeonStore.selectedElement.id) ?? null : null)
const selectedCorridor = computed(() => dungeonStore.selectedElement?.type === 'corridor' ? dungeonStore.corridors.get(dungeonStore.selectedElement.id) ?? null : null)

const roomLabel   = ref('')
const newNote     = ref('')
const savingNote  = ref(false)

watch(() => dungeonStore.selectedElement, (el) => {
  if (!el) { roomLabel.value = ''; return }
  const item = el.type === 'room' ? dungeonStore.rooms.get(el.id) : dungeonStore.corridors.get(el.id)
  roomLabel.value = item?.label ?? ''
  notesStore.initForDungeonElement(el.id, el.type, sessionStore.sessionId)
}, { immediate: true })

let saveTimer = null
function debouncedSave() {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    const el = dungeonStore.selectedElement
    if (!el) return
    if (el.type === 'room') dungeonStore.updateRoom(el.id, { label: roomLabel.value })
    else dungeonStore.updateCorridor(el.id, { label: roomLabel.value })
  }, 500)
}

async function saveNote() {
  if (!newNote.value.trim() || savingNote.value) return
  savingNote.value = true
  const body = newNote.value
  newNote.value = ''
  await notesStore.addNote(body)
  savingNote.value = false
}

function noteColor(userId) {
  return playerColorFor(userId)
}

function timeAgo(ts) {
  const diff = Date.now() - new Date(ts).getTime()
  if (diff < 60000)   return `${Math.floor(diff / 1000)}s ago`
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  return `${Math.floor(diff / 3600000)}h ago`
}
</script>
