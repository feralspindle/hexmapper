import { ref } from 'vue'

// shared add/edit state and handlers for a notesStore-backed note thread.
// markup stays per-surface (dungeon inspector vs hex inspector) — only the
// editing logic is common.
export function useNoteEditing(notesStore, { beforeSave } = {}) {
  const newNote = ref('')
  const savingNote = ref(false)
  const editingNoteId = ref(null)
  const editingNoteBody = ref('')

  async function saveNote() {
    if (!newNote.value.trim() || savingNote.value) return
    savingNote.value = true
    // e.g. the hex inspector lazily creates the cell row before the first note
    if (beforeSave) await beforeSave()
    const body = newNote.value
    newNote.value = ''
    await notesStore.addNote(body)
    savingNote.value = false
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

  return { newNote, savingNote, editingNoteId, editingNoteBody, saveNote, startEditNote, saveEditNote }
}
