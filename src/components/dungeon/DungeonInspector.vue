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

    <div class="ds-section-body" style="min-height:120px;flex:1 1 auto">

      <div v-if="!dungeonStore.selectedElement" class="ds-inspector-empty">
        <span class="ds-glyph">✦</span>
        {{ dungeonStore.fogMode ? 'Select a room or cell to inspect' : 'Select a room to inspect' }}
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
          <span style="font-family:var(--font-zine);font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--ink-mute)">Size</span>
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
                    v-if="note.user_id === authStore.user?.id && editingNoteId !== note.id"
                    class="ds-x-btn"
                    style="font-size:11px"
                    title="Edit note"
                    @click="startEditNote(note)"
                  >✎</button>
                  <button
                    v-if="note.user_id === authStore.user?.id"
                    class="ds-x-btn"
                    style="font-size:11px"
                    @click="confirm('Delete this note?', () => notesStore.deleteNote(note.id))"
                  >×</button>
                </div>
              </div>
              <template v-if="editingNoteId === note.id">
                <textarea
                  v-model="editingNoteBody"
                  class="ds-input"
                  rows="2"
                  @keydown.ctrl.enter.prevent="saveEditNote"
                  @keydown.escape="editingNoteId = null"
                />
                <div style="display:flex;justify-content:flex-end;gap:6px;margin-top:4px">
                  <button class="ds-btn tiny" :disabled="!editingNoteBody.trim()" @click="saveEditNote">Save</button>
                  <button class="ds-btn tiny" @click="editingNoteId = null">Cancel</button>
                </div>
              </template>
              <p v-else style="margin:0;white-space:pre-wrap;word-break:break-word;font-size:13px">{{ note.body }}</p>
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
          <div style="display:flex;flex-direction:column;gap:6px">
            <div
              v-for="item in selectedRoom.items"
              :key="item.id"
              class="ds-content-card"
              :class="`kind-${item.type}`"
            >
              <div class="ds-content-head">
                <div class="ds-content-stamp">
                  <i :class="faClassForType(item.type)" style="font-size:12px" />
                </div>
                <span class="ds-content-kind">{{ item.type }}</span>
                <input
                  class="ds-input ds-content-name-input"
                  :value="fieldValue('item', item.id, 'label', item.label)"
                  placeholder="Name…"
                  @input="editItemField(item.id, 'label', $event.target.value)"
                  @blur="endItemField(item.id, 'label')"
                />
                <button
                  class="ds-x-btn"
                  @click="confirm('Remove this item?', () => dungeonStore.removeRoomItem(selectedRoom.id, item.id))"
                >×</button>
              </div>
              <textarea
                class="ds-input"
                :value="fieldValue('item', item.id, 'notes', item.notes)"
                placeholder="Notes about this…"
                rows="2"
                style="resize:vertical;min-height:36px"
                @input="editItemField(item.id, 'notes', $event.target.value)"
                @blur="endItemField(item.id, 'notes')"
              />
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

      <template v-else-if="selectedToken">
        <TokenInspectorSection :token="selectedToken" />
      </template>

      <template v-else-if="selectedCell">
        <div class="ds-dims-readout">
          <span style="font-family:var(--font-zine);font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--ink-mute)">Cell</span>
          <span style="background:var(--paper);border:1px solid var(--rule-strong);padding:3px 8px;letter-spacing:.04em">
            {{ selectedCell.x }}, {{ selectedCell.y }}
          </span>
        </div>

        <div v-if="cellIcons.length">
          <label class="ds-field-label">Icons</label>
          <div style="display:flex;flex-direction:column;gap:6px">
            <div
              v-for="icon in cellIcons"
              :key="icon.id"
              class="ds-content-card"
              :class="`kind-${icon.type}`"
            >
              <div class="ds-content-head">
                <div class="ds-content-stamp">
                  <i :class="faClassForType(icon.type)" style="font-size:12px" />
                </div>
                <span class="ds-content-kind">{{ icon.type }}</span>
                <input
                  class="ds-input ds-content-name-input"
                  :value="fieldValue('icon', icon.id, 'label', icon.label)"
                  placeholder="Name…"
                  @input="editIconField(icon.id, 'label', $event.target.value)"
                  @blur="endIconField(icon.id, 'label')"
                />
                <button
                  class="ds-x-btn"
                  @click="confirm('Remove this icon?', () => dungeonStore.removeIcon(icon.id))"
                >×</button>
              </div>
              <textarea
                class="ds-input"
                :value="fieldValue('icon', icon.id, 'notes', icon.notes)"
                placeholder="Notes about this…"
                rows="2"
                style="resize:vertical;min-height:36px"
                @input="editIconField(icon.id, 'notes', $event.target.value)"
                @blur="endIconField(icon.id, 'notes')"
              />
            </div>
          </div>
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
                    v-if="note.user_id === authStore.user?.id && editingNoteId !== note.id"
                    class="ds-x-btn"
                    style="font-size:11px"
                    title="Edit note"
                    @click="startEditNote(note)"
                  >✎</button>
                  <button
                    v-if="note.user_id === authStore.user?.id"
                    class="ds-x-btn"
                    style="font-size:11px"
                    @click="confirm('Delete this note?', () => notesStore.deleteNote(note.id))"
                  >×</button>
                </div>
              </div>
              <template v-if="editingNoteId === note.id">
                <textarea
                  v-model="editingNoteBody"
                  class="ds-input"
                  rows="2"
                  @keydown.ctrl.enter.prevent="saveEditNote"
                  @keydown.escape="editingNoteId = null"
                />
                <div style="display:flex;justify-content:flex-end;gap:6px;margin-top:4px">
                  <button class="ds-btn tiny" :disabled="!editingNoteBody.trim()" @click="saveEditNote">Save</button>
                  <button class="ds-btn tiny" @click="editingNoteId = null">Cancel</button>
                </div>
              </template>
              <p v-else style="margin:0;white-space:pre-wrap;word-break:break-word;font-size:13px">{{ note.body }}</p>
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
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, onUnmounted } from 'vue'
import { useD } from '@/stores/dungeonStore.js'
import { useNotesStore } from '@/stores/notesStore.js'
import { useAuthStore } from '@/stores/authStore.js'
import { useSessionStore } from '@/stores/sessionStore.js'
import { useActivityStore } from '@/stores/activityStore.js'
import { useConfirmDialog } from '@/composables/useConfirmDialog.js'
import { faClassForType } from '@/lib/roomItems.js'
import { playerTextColorFor } from '@/composables/usePlayerColor.js'
import { useTimeAgo } from '@/composables/useTimeAgo.js'
import { useNoteEditing } from '@/composables/useNoteEditing.js'
import TokenInspectorSection from '@/components/dungeon/TokenInspectorSection.vue'

const dungeonStore   = useD()
const notesStore     = useNotesStore()
const authStore      = useAuthStore()
const sessionStore   = useSessionStore()
const activityStore  = useActivityStore()
const { confirm }    = useConfirmDialog()
const { timeAgo }   = useTimeAgo()

const open = ref(true)

defineExpose({ openSection: () => { open.value = true } })

const selectedRoom     = computed(() => dungeonStore.selectedElement?.type === 'room' ? dungeonStore.rooms.get(dungeonStore.selectedElement.id) ?? null : null)
const selectedCorridor = computed(() => dungeonStore.selectedElement?.type === 'corridor' ? dungeonStore.corridors.get(dungeonStore.selectedElement.id) ?? null : null)
const selectedToken    = computed(() => dungeonStore.selectedElement?.type === 'token' ? dungeonStore.tokens.get(dungeonStore.selectedElement.id) ?? null : null)

// fog-mode selection: a bare grid cell, or an icon (which stands on one - the
// inspector shows its cell so the notes thread and neighbours come along)
const selectedCell = computed(() => {
  const el = dungeonStore.selectedElement
  if (el?.type === 'cell') return { x: el.x, y: el.y }
  if (el?.type === 'icon') {
    const icon = dungeonStore.icons.get(el.id)
    return icon ? { x: icon.x, y: icon.y } : null
  }
  return null
})
const cellIcons = computed(() =>
  selectedCell.value ? dungeonStore.iconsAtCell(selectedCell.value.x, selectedCell.value.y) : []
)

const roomLabel   = ref('')
const { newNote, savingNote, editingNoteId, editingNoteBody, saveNote, startEditNote, saveEditNote } = useNoteEditing(notesStore)

watch(() => dungeonStore.selectedElement, (el) => {
  if (!el) { roomLabel.value = ''; return }
  if (el.type === 'token') { roomLabel.value = ''; return }
  if (el.type === 'cell' || el.type === 'icon') {
    roomLabel.value = ''
    const cell = el.type === 'cell' ? el : dungeonStore.icons.get(el.id)
    if (cell && dungeonStore.dungeon?.id)
      notesStore.initForDungeonCell(dungeonStore.dungeon.id, cell.x, cell.y, sessionStore.sessionId)
    return
  }
  const item = el.type === 'room' ? dungeonStore.rooms.get(el.id) : dungeonStore.corridors.get(el.id)
  roomLabel.value = item?.label ?? ''
  notesStore.initForDungeonElement(el.id, el.type, sessionStore.sessionId)
}, { immediate: true })

// capture the target and value at schedule time - resolving the selection
// when the timer fires wrote the label into whatever got selected next
let saveTimer = null
function debouncedSave() {
  clearTimeout(saveTimer)
  const el = dungeonStore.selectedElement
  if (!el) return
  const target = { id: el.id, type: el.type }
  const newLabel = roomLabel.value
  saveTimer = setTimeout(() => {
    if (target.type === 'room') {
      const oldLabel = dungeonStore.rooms.get(target.id)?.label ?? ''
      dungeonStore.updateRoom(target.id, { label: newLabel })
      if (newLabel.trim() && newLabel !== oldLabel) {
        activityStore.record('renamed', `${oldLabel || 'Unnamed Room'} → ${newLabel}`)
      }
    } else {
      dungeonStore.updateCorridor(target.id, { label: newLabel })
    }
  }, 500)
}

function noteColor(userId) {
  return playerTextColorFor(userId)
}

// the realtime echo of our own save lands after the http patch resolves and
// resets :value-bound inputs to the snapshot it carried, eating whatever was
// typed since. while a field is being edited its draft pins the rendered
// value; blur flushes the pending patch and hands display back to the store
const _fieldDrafts = reactive({})
const _fieldKey = (kind, id, field) => `${kind}:${id}:${field}`

function fieldValue(kind, id, field, storeValue) {
  return _fieldDrafts[_fieldKey(kind, id, field)] ?? storeValue ?? ''
}

const _itemTimers = new Map()
const _pendingItemPatches = new Map()

function editItemField(itemId, field, value) {
  const roomId = selectedRoom.value?.id
  if (!roomId) return
  _fieldDrafts[_fieldKey('item', itemId, field)] = value
  const pending = _pendingItemPatches.get(itemId)
  _pendingItemPatches.set(itemId, { roomId, patch: { ...pending?.patch, [field]: value } })
  clearTimeout(_itemTimers.get(itemId))
  _itemTimers.set(itemId, setTimeout(() => _flushItemPatch(itemId), 400))
}

function _flushItemPatch(itemId) {
  clearTimeout(_itemTimers.get(itemId))
  _itemTimers.delete(itemId)
  const pending = _pendingItemPatches.get(itemId)
  _pendingItemPatches.delete(itemId)
  if (pending) dungeonStore.updateRoomItem(pending.roomId, itemId, pending.patch)
}

function endItemField(itemId, field) {
  _flushItemPatch(itemId)
  delete _fieldDrafts[_fieldKey('item', itemId, field)]
}

const _iconTimers = new Map()
const _pendingIconPatches = new Map()

function editIconField(iconId, field, value) {
  _fieldDrafts[_fieldKey('icon', iconId, field)] = value
  const pending = _pendingIconPatches.get(iconId)
  _pendingIconPatches.set(iconId, { ...pending, [field]: value })
  clearTimeout(_iconTimers.get(iconId))
  _iconTimers.set(iconId, setTimeout(() => _flushIconPatch(iconId), 400))
}

function _flushIconPatch(iconId) {
  clearTimeout(_iconTimers.get(iconId))
  _iconTimers.delete(iconId)
  const patch = _pendingIconPatches.get(iconId)
  _pendingIconPatches.delete(iconId)
  if (patch) dungeonStore.updateIcon(iconId, patch)
}

function endIconField(iconId, field) {
  _flushIconPatch(iconId)
  delete _fieldDrafts[_fieldKey('icon', iconId, field)]
}

// switching selection can tear inputs out of the dom without a blur event -
// flush what's pending and drop the drafts so a re-shown field doesn't stay
// pinned to stale text
function _flushAllFieldEdits() {
  for (const id of [..._pendingItemPatches.keys()]) _flushItemPatch(id)
  for (const id of [..._pendingIconPatches.keys()]) _flushIconPatch(id)
  for (const k of Object.keys(_fieldDrafts)) delete _fieldDrafts[k]
}

watch(() => dungeonStore.selectedElement, _flushAllFieldEdits)

onUnmounted(_flushAllFieldEdits)

</script>
