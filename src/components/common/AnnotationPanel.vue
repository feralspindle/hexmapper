<template>
  <div class="bg-stone-900 border-l border-stone-700 flex flex-col overflow-hidden">
    
    <div class="flex items-center justify-between px-4 py-3 border-b border-stone-700 shrink-0">
      <h3 class="font-display text-parchment-200 text-sm">
        {{ panelTitle }}
      </h3>
      <button class="text-stone-500 hover:text-stone-200 transition-colors" @click="emit('close')">
        <i class="fa-solid fa-xmark" />
      </button>
    </div>


    <template v-if="props.context === 'hex' && hexStore.selectedHex">
      <div class="flex-1 overflow-y-auto p-4 space-y-4">
  
        <div>
          <label class="block text-stone-300 text-sm mb-1 uppercase tracking-wider">Location Name</label>
          <input
            v-model="hexLabel"
            type="text"
            placeholder="e.g. Thornwood Village"
            class="w-full bg-stone-800 border border-stone-600 rounded px-3 py-2 text-stone-100 placeholder-stone-600 text-sm focus:outline-none focus:border-parchment-400"
            @input="debouncedSaveHex"
          />
        </div>


        <div>
          <label class="block text-stone-300 text-sm mb-2 uppercase tracking-wider">Terrain</label>

          <select
            v-if="isImageMap"
            :value="hexTerrain ?? ''"
            class="w-full bg-stone-800 border border-stone-600 rounded px-3 py-2 text-stone-100 text-sm focus:outline-none focus:border-parchment-400"
            @change="e => { hexTerrain = e.target.value || null; saveHex() }"
          >
            <option value="">— None —</option>
            <option v-for="terrain in TERRAIN_TYPES" :key="terrain.id" :value="terrain.id">
              {{ terrain.label }}
            </option>
          </select>
          <div v-else class="grid grid-cols-5 gap-2">
            <button
              v-for="terrain in TERRAIN_TYPES"
              :key="terrain.id"
              :title="terrain.label"
              :class="[
                'w-full aspect-square rounded border-2 transition-all',
                hexTerrain === terrain.id ? 'border-parchment-300 scale-110' : 'border-transparent hover:border-stone-500',
              ]"
              :style="{ backgroundColor: terrain.color }"
              @click="setTerrain(terrain.id)"
            />
          </div>
        </div>

        <div>
          <label class="block text-stone-300 text-sm mb-2 uppercase tracking-wider">Marker</label>
          <div class="flex flex-wrap items-center gap-2">
            <button
              v-for="m in MARKER_COLORS"
              :key="m.id"
              :title="m.label"
              :class="[
                'w-6 h-6 rounded-full border-2 transition-all hover:scale-110',
                hexMarkerColor === m.id ? 'border-parchment-300 scale-110' : 'border-transparent hover:border-stone-500',
              ]"
              :style="{ backgroundColor: m.color }"
              @click="setMarkerColor(m.id)"
            />
            <button
              v-if="hexMarkerColor"
              title="Clear marker"
              class="w-6 h-6 rounded-full border-2 border-stone-500 bg-stone-800 text-stone-400 flex items-center justify-center text-sm hover:border-stone-300 hover:text-stone-200 transition-all"
              @click="setMarkerColor(null)"
            >✕</button>
          </div>
          <input
            v-if="hexMarkerColor"
            v-model="hexMarkerLabel"
            type="text"
            placeholder="Marker label (optional)"
            maxlength="14"
            class="mt-2 w-full bg-stone-800 border border-stone-600 rounded px-3 py-2 text-stone-100 placeholder-stone-600 text-sm focus:outline-none focus:border-parchment-400"
            @input="debouncedSaveMarker"
          />
        </div>

        <div>
          <label class="block text-stone-300 text-sm mb-1 uppercase tracking-wider">Notes</label>

          <div
            ref="hexNotesEl"
            class="bg-stone-800 border border-stone-600 rounded max-h-44 overflow-y-auto mb-2"
          >
            <div v-if="notesStore.loading" class="px-3 py-3 text-stone-400 text-sm text-center">Loading…</div>
            <div v-else-if="!notesStore.notes.length" class="px-3 py-4 text-stone-400 text-sm italic text-center">No notes yet</div>
            <div
              v-for="note in notesStore.notes"
              :key="note.id"
              class="px-3 py-2 border-b border-stone-700 last:border-b-0 group"
            >
              <div class="flex items-center justify-between mb-0.5">
                <span
                  class="text-xs font-display truncate max-w-24"
                  :class="note.user_id === authStore.user?.id ? 'text-parchment-400' : 'text-stone-400'"
                >{{ note.display_name }}</span>
                <div class="flex items-center gap-1.5 shrink-0 ml-2">
                  <template v-if="note.user_id === authStore.user?.id && editingNoteId !== note.id">
                    <button
                      class="opacity-0 group-hover:opacity-100 text-stone-600 hover:text-stone-300 transition-all"
                      title="Edit note"
                      @click="startEditNote(note)"
                    ><i class="fa-solid fa-pencil fa-xs" /></button>
                    <button
                      class="opacity-0 group-hover:opacity-100 text-stone-600 hover:text-red-400 transition-all"
                      title="Delete note"
                      @click="confirm('Delete this note?', () => notesStore.deleteNote(note.id))"
                    ><i class="fa-solid fa-trash fa-xs" /></button>
                  </template>
                  <span class="text-sm text-stone-500">{{ timeAgo(note.created_at) }}</span>
                  <span v-if="note.updated_at && note.updated_at !== note.created_at" class="text-sm text-stone-600 italic">(edited)</span>
                </div>
              </div>

              <template v-if="editingNoteId === note.id">
                <textarea
                  v-model="editingNoteBody"
                  rows="3"
                  class="w-full bg-stone-700 border border-parchment-400/40 rounded px-2 py-1.5 text-stone-100 text-sm resize-none font-body focus:outline-none focus:border-parchment-400 mt-0.5"
                  @keydown.ctrl.enter.prevent="saveEditNote"
                  @keydown.escape="editingNoteId = null"
                />
                <div class="flex gap-3 mt-1">
                  <button class="text-sm text-parchment-400 hover:text-parchment-200 transition-colors" @click="saveEditNote">Save</button>
                  <button class="text-sm text-stone-500 hover:text-stone-300 transition-colors" @click="editingNoteId = null">Cancel</button>
                </div>
              </template>
              <p v-else class="text-stone-200 text-sm font-body leading-relaxed whitespace-pre-wrap">{{ note.body }}</p>
            </div>
          </div>

          <div class="flex gap-2 items-end">
            <textarea
              v-model="newHexNote"
              rows="2"
              placeholder="Add a note… (Ctrl+Enter to save)"
              class="flex-1 bg-stone-800 border border-stone-600 rounded px-3 py-2 text-stone-100 placeholder-stone-600 text-sm focus:outline-none focus:border-parchment-400 resize-none font-body"
              @keydown.ctrl.enter.prevent="saveHexNote"
            />
            <button
              :disabled="!newHexNote.trim() || savingNote"
              class="bg-parchment-500 hover:bg-parchment-400 disabled:opacity-40 text-stone-900 font-display rounded px-3 py-2 text-xs transition-colors shrink-0 self-end"
              @click="saveHexNote"
            >Save</button>
          </div>
        </div>


        <div class="border-t border-stone-700 pt-4 space-y-2">
          <label class="block text-stone-400 text-sm uppercase tracking-wider">Dungeons</label>

          <div v-if="hexStore.dungeonsLoading" class="text-stone-500 text-sm">Loading...</div>
          <div v-else class="space-y-1.5">
            <div
              v-for="dungeon in hexStore.hexDungeons"
              :key="dungeon.id"
              class="flex items-center gap-2 bg-stone-800 rounded px-3 py-2"
            >
              <span class="text-purple-400 text-sm shrink-0">D</span>
              <span class="text-stone-200 text-sm flex-1 truncate font-body">{{ dungeon.name }}</span>
              <button
                class="text-sm text-parchment-400 hover:text-parchment-200 shrink-0 transition-colors"
                @click="hexStore.navigateToDungeon(dungeon.id)"
              >
                Enter <i class="fa-solid fa-arrow-right fa-xs" />
              </button>
            </div>
          </div>


          <div v-if="addingDungeon" class="flex gap-2">
            <input
              v-model="newDungeonName"
              ref="dungeonNameInput"
              type="text"
              placeholder="Dungeon name..."
              class="flex-1 bg-stone-800 border border-stone-600 rounded px-2 py-1.5 text-stone-100 placeholder-stone-600 text-sm focus:outline-none focus:border-parchment-400"
              @keyup.enter="confirmNewDungeon"
              @keyup.escape="addingDungeon = false"
            />
            <button
              class="bg-parchment-500 hover:bg-parchment-400 text-stone-900 rounded px-2 py-1.5 text-sm font-display transition-colors"
              @click="confirmNewDungeon"
            >
              Add
            </button>
          </div>
          <button
            v-else
            class="w-full border border-dashed border-stone-600 hover:border-stone-400 text-stone-400 hover:text-stone-200 rounded px-3 py-2 text-sm transition-colors"
            @click="startAddingDungeon"
          >
            + Add Dungeon
          </button>
        </div>


        <div class="border-t border-stone-700 pt-3">
          <button
            class="w-full text-red-500 hover:text-red-400 text-sm transition-colors"
            @click="clearHex"
          >
            Clear Hex
          </button>
        </div>
      </div>
    </template>


    <template v-else-if="props.context === 'dungeon' && dungeonStore.selectedElement">
      <div class="flex-1 overflow-y-auto p-4 space-y-4">
        <div>
          <label class="block text-stone-300 text-sm mb-1 uppercase tracking-wider">Label</label>
          <input
            v-model="dungeonLabel"
            type="text"
            placeholder="e.g. Throne Room"
            class="w-full bg-stone-800 border border-stone-600 rounded px-3 py-2 text-stone-100 placeholder-stone-600 text-sm focus:outline-none focus:border-parchment-400"
            @input="debouncedSaveDungeon"
          />
        </div>

        <div>
          <label class="block text-stone-300 text-sm mb-1 uppercase tracking-wider">Notes</label>

          <div
            ref="dungeonNotesEl"
            class="bg-stone-800 border border-stone-600 rounded max-h-44 overflow-y-auto mb-2"
          >
            <div v-if="notesStore.loading" class="px-3 py-3 text-stone-400 text-sm text-center">Loading...</div>
            <div v-else-if="!notesStore.notes.length" class="px-3 py-4 text-stone-400 text-sm italic text-center">No notes yet!</div>
            <div
              v-for="note in notesStore.notes"
              :key="note.id"
              class="px-3 py-2 border-b border-stone-700 last:border-b-0 group"
            >
              <div class="flex items-center justify-between mb-0.5">
                <span
                  class="text-xs font-display truncate max-w-24"
                  :class="note.user_id === authStore.user?.id ? 'text-parchment-400' : 'text-stone-400'"
                >{{ note.display_name }}</span>
                <div class="flex items-center gap-1.5 shrink-0 ml-2">
                  <template v-if="note.user_id === authStore.user?.id && editingNoteId !== note.id">
                    <button
                      class="opacity-0 group-hover:opacity-100 text-stone-600 hover:text-stone-300 transition-all"
                      title="Edit note"
                      @click="startEditNote(note)"
                    ><i class="fa-solid fa-pencil fa-xs" /></button>
                    <button
                      class="opacity-0 group-hover:opacity-100 text-stone-600 hover:text-red-400 transition-all"
                      title="Delete note"
                      @click="confirm('Delete this note?', () => notesStore.deleteNote(note.id))"
                    ><i class="fa-solid fa-trash fa-xs" /></button>
                  </template>
                  <span class="text-sm text-stone-500">{{ timeAgo(note.created_at) }}</span>
                  <span v-if="note.updated_at && note.updated_at !== note.created_at" class="text-sm text-stone-600 italic">(edited)</span>
                </div>
              </div>

              <template v-if="editingNoteId === note.id">
                <textarea
                  v-model="editingNoteBody"
                  rows="3"
                  class="w-full bg-stone-700 border border-parchment-400/40 rounded px-2 py-1.5 text-stone-100 text-sm resize-none font-body focus:outline-none focus:border-parchment-400 mt-0.5"
                  @keydown.ctrl.enter.prevent="saveEditNote"
                  @keydown.escape="editingNoteId = null"
                />
                <div class="flex gap-3 mt-1">
                  <button class="text-sm text-parchment-400 hover:text-parchment-200 transition-colors" @click="saveEditNote">Save</button>
                  <button class="text-sm text-stone-500 hover:text-stone-300 transition-colors" @click="editingNoteId = null">Cancel</button>
                </div>
              </template>
              <p v-else class="text-stone-200 text-sm font-body leading-relaxed whitespace-pre-wrap">{{ note.body }}</p>
            </div>
          </div>

          <div class="flex gap-2 items-end">
            <textarea
              v-model="newDungeonNote"
              rows="2"
              placeholder="Add a note… (Ctrl+Enter to save)"
              class="flex-1 bg-stone-800 border border-stone-600 rounded px-3 py-2 text-stone-100 placeholder-stone-600 text-sm focus:outline-none focus:border-parchment-400 resize-none font-body"
              @keydown.ctrl.enter.prevent="saveDungeonNote"
            />
            <button
              :disabled="!newDungeonNote.trim() || savingNote"
              class="bg-parchment-500 hover:bg-parchment-400 disabled:opacity-40 text-stone-900 font-display rounded px-3 py-2 text-xs transition-colors shrink-0 self-end"
              @click="saveDungeonNote"
            >Save</button>
          </div>
        </div>

        <div v-if="dungeonStore.selectedElement.type === 'room'">
          <label class="block text-stone-300 text-sm mb-2 uppercase tracking-wider">Contents</label>
          <div v-if="selectedRoomItems.length" class="space-y-2">
            <div
              v-for="item in selectedRoomItems"
              :key="item.id"
              class="bg-stone-800 rounded overflow-hidden"
            >
              <div class="flex items-center gap-2 px-2 py-1.5">
                <i :class="[faClassForType(item.type), 'text-parchment-400 w-4 text-center']" />
                <template v-if="editingLabelId === item.id">
                  <input
                    :ref="el => { if (el) el.focus() }"
                    :value="item.label ?? item.type"
                    class="flex-1 bg-stone-700 rounded px-1.5 py-0.5 text-stone-100 text-sm focus:outline-none focus:ring-1 focus:ring-parchment-400"
                    @blur="saveItemLabel(item.id, item.type, $event.target.value)"
                    @keyup.enter="saveItemLabel(item.id, item.type, $event.target.value)"
                    @keyup.escape="editingLabelId = null"
                  />
                </template>
                <template v-else>
                  <button
                    class="flex-1 text-left text-stone-300 text-sm capitalize hover:text-parchment-200 transition-colors truncate"
                    :title="item.label ? `Rename (currently: ${item.label})` : 'Click to rename'"
                    @click="editingLabelId = item.id"
                  >{{ item.label ?? item.type }}</button>
                  <button
                    v-if="item.label"
                    class="text-stone-600 hover:text-stone-400 text-sm transition-colors shrink-0"
                    title="Reset to default name"
                    @click="resetItemLabel(item.id)"
                  ><i class="fa-solid fa-rotate-left fa-xs" /></button>
                </template>
                <button
                  class="w-5 h-5 rounded bg-stone-700 hover:bg-red-900/60 text-stone-400 hover:text-red-400 text-sm flex items-center justify-center transition-colors shrink-0"
                  title="Remove"
                  @click="removeItem(item.id)"
                ><i class="fa-solid fa-xmark fa-xs" /></button>
              </div>
              <textarea
                :value="item.notes"
                rows="2"
                placeholder="Notes about this item..."
                class="w-full bg-stone-900/60 border-t border-stone-700 px-2 py-1.5 text-stone-300 placeholder-stone-600 text-sm focus:outline-none resize-none font-body"
                @input="saveItemNotes(item.id, $event.target.value)"
              />
            </div>
          </div>
          <p v-else class="text-stone-400 text-sm italic">No contents yet. Drag items from the palette below.</p>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, watch, computed, nextTick, onUnmounted } from 'vue'
import { useConfirmDialog } from '@/composables/useConfirmDialog.js'
import { useHexStore, TERRAIN_TYPES, MARKER_COLORS } from '@/stores/hexStore.js'
import { useD } from '@/stores/dungeonStore.js'
import { useNotesStore } from '@/stores/notesStore.js'
import { useAuthStore } from '@/stores/authStore.js'
import { useSessionStore } from '@/stores/sessionStore.js'
import { useMapStore } from '@/stores/mapStore.js'
import { iconForType, faClassForType } from '@/lib/roomItems.js'

const props = defineProps({
  context: { type: String, required: true },
})
const emit = defineEmits(['close'])

const hexStore = useHexStore()
const dungeonStore = useD()
const notesStore = useNotesStore()
const authStore = useAuthStore()
const { confirm } = useConfirmDialog()
const sessionStore = useSessionStore()
const mapStore = useMapStore()


const isImageMap = computed(() =>
  sessionStore.isGM
    ? mapStore.gmMapType === 'image'
    : mapStore.mapType === 'image'
)

const hexLabel = ref('')
const hexTerrain = ref(null)
const hexMarkerColor = ref(null)
const hexMarkerLabel = ref('')
const addingDungeon = ref(false)
const newDungeonName = ref('')
const dungeonNameInput = ref(null)
const hexNotesEl = ref(null)
const newHexNote = ref('')
const savingNote = ref(false)
const editingNoteId = ref(null)
const editingNoteBody = ref('')

watch(
  () => hexStore.selectedCell,
  (cell) => {
    hexLabel.value = cell?.label ?? ''
    hexTerrain.value = cell?.terrain_type ?? null
    hexMarkerColor.value = cell?.marker_color ?? null
    hexMarkerLabel.value = cell?.marker_label ?? ''
    addingDungeon.value = false
    editingNoteId.value = null
    hexStore.fetchDungeonsForHex(cell?.id ?? null)
    notesStore.initForHex(cell?.id ?? null, sessionStore.sessionId)
  },
  { immediate: true },
)


watch(() => notesStore.notes.length, () => {
  if (props.context !== 'hex') return
  nextTick(() => {
    if (hexNotesEl.value) hexNotesEl.value.scrollTop = hexNotesEl.value.scrollHeight
  })
})

let hexSaveTimer = null
function debouncedSaveHex() {
  clearTimeout(hexSaveTimer)
  hexSaveTimer = setTimeout(saveHex, 500)
}

function saveHex() {
  if (!hexStore.selectedHex) return
  const { q, r } = hexStore.selectedHex
  hexStore.upsertHex(q, r, {
    label: hexLabel.value,
    terrain_type: hexTerrain.value,
  })
}

function startEditNote(note) {
  editingNoteId.value = note.id
  editingNoteBody.value = note.body
}

async function saveEditNote() {
  if (!editingNoteBody.value.trim()) return
  const id = editingNoteId.value
  editingNoteId.value = null
  await notesStore.updateNote(id, editingNoteBody.value)
}

async function saveHexNote() {
  if (!newHexNote.value.trim() || savingNote.value) return
  savingNote.value = true


  if (!hexStore.selectedCell?.id && hexStore.selectedHex) {
    const { q, r } = hexStore.selectedHex
    const cellId = await hexStore.ensureCellExists(q, r)
    if (cellId) await notesStore.initForHex(cellId, sessionStore.sessionId)
  }

  const body = newHexNote.value
  newHexNote.value = ''
  await notesStore.addNote(body)
  savingNote.value = false
}

function setTerrain(id) {
  hexTerrain.value = id
  saveHex()
}

function setMarkerColor(id) {
  hexMarkerColor.value = id
  if (!id) hexMarkerLabel.value = ''
  saveMarker()
}

let markerSaveTimer = null
function debouncedSaveMarker() {
  clearTimeout(markerSaveTimer)
  markerSaveTimer = setTimeout(saveMarker, 500)
}

function saveMarker() {
  if (!hexStore.selectedHex) return
  const { q, r } = hexStore.selectedHex
  hexStore.upsertHex(q, r, {
    marker_color: hexMarkerColor.value,
    marker_label: hexMarkerColor.value ? hexMarkerLabel.value : null,
  })
}

function clearHex() {
  if (!hexStore.selectedHex) return
  confirm('Clear all data on this hex? This cannot be undone.', () => {
    hexStore.deleteHex(hexStore.selectedHex.q, hexStore.selectedHex.r)
    emit('close')
  })
}

async function startAddingDungeon() {
  addingDungeon.value = true
  newDungeonName.value = ''
  await nextTick()
  dungeonNameInput.value?.focus()
}

function confirmNewDungeon() {
  if (!hexStore.selectedHex) return
  const { q, r } = hexStore.selectedHex
  const name = newDungeonName.value.trim() || 'Unnamed Dungeon'
  addingDungeon.value = false
  hexStore.createDungeon(q, r, name)
}


const dungeonLabel = ref('')
const dungeonNotesEl = ref(null)
const newDungeonNote = ref('')

watch(
  () => dungeonStore.selectedElement,
  (el) => {
    if (!el) return
    const item = el.type === 'room'
      ? dungeonStore.rooms.get(el.id)
      : dungeonStore.corridors.get(el.id)
    dungeonLabel.value = item?.label ?? ''
    editingNoteId.value = null
    notesStore.initForDungeonElement(el.id, el.type, sessionStore.sessionId)
  },
  { immediate: true },
)


watch(() => notesStore.notes.length, () => {
  if (props.context !== 'dungeon') return
  nextTick(() => {
    if (dungeonNotesEl.value) dungeonNotesEl.value.scrollTop = dungeonNotesEl.value.scrollHeight
  })
})

let dungeonSaveTimer = null
function debouncedSaveDungeon() {
  clearTimeout(dungeonSaveTimer)
  dungeonSaveTimer = setTimeout(saveDungeon, 500)
}

function saveDungeon() {
  const el = dungeonStore.selectedElement
  if (!el) return
  if (el.type === 'room') dungeonStore.updateRoom(el.id, { label: dungeonLabel.value })
  else dungeonStore.updateCorridor(el.id, { label: dungeonLabel.value })
}

async function saveDungeonNote() {
  if (!newDungeonNote.value.trim() || savingNote.value) return
  savingNote.value = true
  const body = newDungeonNote.value
  newDungeonNote.value = ''
  await notesStore.addNote(body)
  savingNote.value = false
}

onUnmounted(() => notesStore.cleanup())


const selectedRoomItems = computed(() => {
  const el = dungeonStore.selectedElement
  if (el?.type !== 'room') return []
  return dungeonStore.rooms.get(el.id)?.items ?? []
})

function removeItem(itemId) {
  const el = dungeonStore.selectedElement
  if (el?.type !== 'room') return
  confirm('Remove this item?', () => dungeonStore.removeRoomItem(el.id, itemId))
}

const editingLabelId = ref(null)

function saveItemLabel(itemId, type, value) {
  editingLabelId.value = null
  const el = dungeonStore.selectedElement
  if (el?.type !== 'room') return
  const trimmed = value.trim()
  dungeonStore.updateRoomItem(el.id, itemId, { label: trimmed && trimmed !== type ? trimmed : null })
}

function resetItemLabel(itemId) {
  const el = dungeonStore.selectedElement
  if (el?.type !== 'room') return
  dungeonStore.updateRoomItem(el.id, itemId, { label: null })
}

const itemNoteTimers = {}
function saveItemNotes(itemId, notes) {
  const el = dungeonStore.selectedElement
  if (el?.type !== 'room') return
  clearTimeout(itemNoteTimers[itemId])
  itemNoteTimers[itemId] = setTimeout(() => {
    dungeonStore.updateRoomItem(el.id, itemId, { notes })
  }, 500)
}



function timeAgo(ts) {
  const diff = Date.now() - new Date(ts).getTime()
  if (diff < 5000)    return 'just now'
  if (diff < 60000)   return `${Math.floor(diff / 1000)}s ago`
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  return `${Math.floor(diff / 3600000)}h ago`
}



const panelTitle = computed(() => {
  if (props.context === 'hex') {
    const { q, r } = hexStore.selectedHex ?? {}
    return hexLabel.value || `Hex (${q}, ${r})`
  }
  const el = dungeonStore.selectedElement
  if (!el) return ''
  return dungeonLabel.value || (el.type === 'room' ? 'Room' : 'Corridor')
})
</script>
