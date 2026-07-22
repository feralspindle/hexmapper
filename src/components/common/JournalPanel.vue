<template>
  <div class="journal">
    <div class="journal-head">
      <div class="journal-summary">
        <strong>{{ recordCount }}</strong>
        <span>{{ recordCount === 1 ? 'entry' : 'entries' }}</span>
        <span class="journal-summary-rule" />
        <span>{{ proseCount }} written</span>
        <span>{{ pinCount }} pinned</span>
      </div>
      <div class="journal-head-actions">
        <button type="button" class="ds-btn tiny ghost" data-testid="journal-new-page" title="Turn to a fresh page" @click="newPage">
          <i class="fa-solid fa-file-circle-plus" />
          <span>New page</span>
        </button>
        <div class="journal-export">
          <button type="button" class="ds-btn tiny ghost" data-testid="journal-export" title="Download as markdown" @click="pages.length > 1 ? (exportMenuOpen = !exportMenuOpen) : exportMd()">
            <i class="fa-solid fa-file-arrow-down" />
            <span>Export</span>
          </button>
          <div v-if="exportMenuOpen" class="journal-export-options">
            <button type="button" data-testid="journal-export-all" @click="exportMd()">whole journal</button>
            <button type="button" data-testid="journal-export-page" @click="exportMd(activePageIndex)">page {{ activePageIndex + 1 }}</button>
          </div>
        </div>
      </div>
    </div>

    <label class="journal-search">
      <i class="fa-solid fa-magnifying-glass" />
      <input v-model="query" type="search" placeholder="Search the journal" data-testid="journal-search" />
      <button v-if="query" type="button" title="Clear search" @click="query = ''">
        <i class="fa-solid fa-xmark" />
      </button>
    </label>

    <div v-if="!searching && pages.length > 1" class="journal-pager">
      <button type="button" class="hm-card-icon-btn" :disabled="activePageIndex === 0" title="Previous page" data-testid="journal-page-prev" @click="goToPage(activePageIndex - 1)">
        <i class="fa-solid fa-chevron-left" />
      </button>
      <span class="journal-pager-label" data-testid="journal-page-label">page {{ activePageIndex + 1 }} of {{ pages.length }}</span>
      <button type="button" class="hm-card-icon-btn" :disabled="activePageIndex === pages.length - 1" title="Next page" data-testid="journal-page-next" @click="goToPage(activePageIndex + 1)">
        <i class="fa-solid fa-chevron-right" />
      </button>
    </div>

    <div ref="scrollEl" class="journal-scroll">
      <div v-if="!searching && currentPage.pageBreak" class="journal-page-break" data-testid="journal-page-break">
        <form v-if="renamingBreak" class="journal-page-rename" @submit.prevent="saveTitle">
          <input
            ref="titleInputEl"
            v-model="titleDraft"
            class="ds-input"
            maxlength="200"
            placeholder="Name this page (optional)"
            data-testid="journal-page-title-input"
            @keydown.esc="renamingBreak = false"
          />
          <button type="submit" class="hm-card-icon-btn" title="Save title" data-testid="journal-page-title-save" :disabled="titleSaving">
            <i class="fa-solid fa-check" />
          </button>
          <button type="button" class="hm-card-icon-btn" title="Cancel" @click="renamingBreak = false">
            <i class="fa-solid fa-xmark" />
          </button>
        </form>
        <template v-else>
          <span data-testid="journal-page-title">{{ pageTitle || `page ${activePageIndex + 1} begins` }}</span>
          <button
            v-if="canTouch(currentPage.pageBreak)"
            type="button"
            class="hm-card-icon-btn"
            title="Name this page"
            data-testid="journal-page-title-edit"
            @click="startRename"
          >
            <i class="fa-solid fa-pen" />
          </button>
          <button
            v-if="canTouch(currentPage.pageBreak)"
            type="button"
            class="hm-card-icon-btn hm-card-icon-btn--danger"
            title="Remove this page break, its entries join the previous page"
            data-testid="journal-page-break-delete"
            @click="confirmRemoveBreak"
          >
            <i class="fa-solid fa-trash" />
          </button>
        </template>
      </div>

      <div v-if="!visibleEntries.length" class="journal-empty">{{ emptyMessage }}</div>

      <template v-for="(entry, i) in visibleEntries" :key="entry.id">
        <div v-if="dayHeader(entry, i)" class="journal-day">{{ dayHeader(entry, i) }}</div>

        <div v-if="entry.kind === 'pin'" class="journal-pin" data-testid="journal-pin">
          <div class="journal-meta">
            <span class="journal-pin-label">
              <i :class="entry.pin?.source === 'dice' ? 'fa-solid fa-dice' : 'fa-solid fa-wand-sparkles'" />
              {{ entry.pin?.label ?? 'pinned' }}
            </span>
            <time :datetime="entry.created_at">{{ entryTime(entry) }}</time>
            <button v-if="canTouch(entry)" type="button" class="hm-card-icon-btn hm-card-icon-btn--danger" title="Delete pin" data-testid="journal-delete" @click="confirmDelete(entry)">
              <i class="fa-solid fa-trash" />
            </button>
          </div>
          <p class="journal-pin-text">{{ entry.pin?.text }}</p>
          <p v-if="entry.pin?.detail" class="journal-pin-detail">{{ entry.pin.detail }}</p>
        </div>

        <div v-else class="journal-prose" data-testid="journal-prose">
          <div class="journal-meta">
            <span v-if="entry.character_name" class="journal-speaker-name" data-testid="journal-speaker-name">
              <i class="fa-solid fa-masks-theater" />
              {{ entry.character_name }}
            </span>
            <span v-else>{{ entry.author_name }}</span>
            <time :datetime="entry.created_at">{{ entryTime(entry) }}</time>
            <div v-if="canTouch(entry)" class="journal-entry-actions">
              <button type="button" class="hm-card-icon-btn" title="Edit entry" data-testid="journal-edit" @click="startEdit(entry)">
                <i class="fa-solid fa-pen" />
              </button>
              <button type="button" class="hm-card-icon-btn hm-card-icon-btn--danger" title="Delete entry" data-testid="journal-delete" @click="confirmDelete(entry)">
                <i class="fa-solid fa-trash" />
              </button>
            </div>
          </div>
          <div v-if="editingId === entry.id" class="journal-edit-form">
            <textarea v-model="editDraft" rows="3" class="ds-input" maxlength="8000" data-testid="journal-edit-input" @keydown.esc="cancelEdit" @keydown.enter.exact.prevent="saveEdit(entry.id)" />
            <div class="journal-edit-actions">
              <button type="button" class="ds-btn tiny ghost" @click="cancelEdit">Cancel</button>
              <button type="button" class="ds-btn tiny" data-testid="journal-edit-save" :disabled="!editDraft.trim() || editSaving" @click="saveEdit(entry.id)">Save</button>
            </div>
          </div>
          <p v-else class="journal-body">{{ entry.body }}</p>
        </div>
      </template>
    </div>

    <div class="journal-compose" :class="{ 'journal-compose--speaking': speakerName }">
      <div class="journal-compose-label">
        <span>{{ speakerName ? `${speakerName} writes` : 'Add to the record' }}</span>
        <span class="journal-compose-hint">Enter to write · Shift+Enter for a new line</span>
      </div>
      <div class="journal-compose-fields">
        <select
          v-if="characterStore.characters.length"
          v-model="speakerId"
          class="ds-input journal-speaker"
          data-testid="journal-speaker"
          title="Attach this entry to a character"
        >
          <option value="">narration</option>
          <option v-for="c in characterStore.characters" :key="c.id" :value="c.id">
            {{ c.data?.name || 'Unnamed' }}
          </option>
        </select>
        <div class="journal-format-bar" role="toolbar" aria-label="Markdown formatting">
          <button
            v-for="tool in markdownTools"
            :key="tool.label"
            type="button"
            :title="tool.title"
            :aria-label="tool.title"
            @mousedown.prevent="applyMarkdown(tool)"
          >
            <i :class="tool.icon" />
            <span v-if="tool.text">{{ tool.text }}</span>
          </button>
        </div>
        <textarea
          ref="textareaEl"
          v-model="draft"
          rows="3"
          class="ds-input journal-input"
          :placeholder="speakerName ? `What does ${speakerName} say or do…` : 'What happened…'"
          maxlength="8000"
          data-testid="journal-input"
          @keydown.enter.exact.prevent="submit"
        />
      </div>
      <button type="button" class="ds-btn" data-testid="journal-submit" :disabled="!draft.trim()" @click="submit">
        <i class="fa-solid fa-feather" />
        <span>Write</span>
      </button>
    </div>
    <p v-if="journalStore.error" class="journal-empty">{{ journalStore.error }}</p>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useJournalStore } from '@/stores/journalStore.js'
import { useSessionStore } from '@/stores/sessionStore.js'
import { useAuthStore } from '@/stores/authStore.js'
import { useCharacterStore } from '@/stores/characterStore.js'
import { applyMarkdownEdit } from '@/lib/journalMarkdown.js'
import { useConfirmDialog } from '@/composables/useConfirmDialog.js'

const props = defineProps({ sessionId: { type: String, required: true } })

const journalStore = useJournalStore()
const sessionStore = useSessionStore()
const authStore = useAuthStore()
const characterStore = useCharacterStore()
const { confirm } = useConfirmDialog()

const draft = ref('')
const speakerId = ref('')
const scrollEl = ref(null)
const textareaEl = ref(null)
const query = ref('')
const pageIndex = ref(null)
const exportMenuOpen = ref(false)
const renamingBreak = ref(false)
const titleDraft = ref('')
const titleSaving = ref(false)
const titleInputEl = ref(null)
const editingId = ref(null)
const editDraft = ref('')
const editSaving = ref(false)

const markdownTools = [
  { label: 'bold', title: 'Bold', icon: 'fa-solid fa-bold', before: '**', after: '**', placeholder: 'bold text' },
  { label: 'italic', title: 'Italic', icon: 'fa-solid fa-italic', before: '_', after: '_', placeholder: 'italic text' },
  { label: 'heading', title: 'Heading', icon: 'fa-solid fa-heading', linePrefix: '## ', placeholder: 'Heading' },
  { label: 'bulleted-list', title: 'Bulleted list', icon: 'fa-solid fa-list-ul', linePrefix: '- ', placeholder: 'list item' },
  { label: 'quote', title: 'Quote', icon: 'fa-solid fa-quote-left', linePrefix: '> ', placeholder: 'quote' },
  { label: 'link', title: 'Link', icon: 'fa-solid fa-link', before: '[', after: '](url)', placeholder: 'link text' },
]

const speaker = computed(() =>
  characterStore.characters.find(c => c.id === speakerId.value) ?? null)
const speakerName = computed(() => speaker.value?.data?.name || (speaker.value ? 'Unnamed' : null))
const proseCount = computed(() => journalStore.entries.filter(entry => entry.kind === 'prose').length)
const pinCount = computed(() => journalStore.entries.filter(entry => entry.kind === 'pin').length)
const recordCount = computed(() => proseCount.value + pinCount.value)
const searching = computed(() => Boolean(query.value.trim()))
const pages = computed(() => journalStore.pages)
const activePageIndex = computed(() =>
  pageIndex.value === null ? pages.value.length - 1 : Math.min(pageIndex.value, pages.value.length - 1))
const currentPage = computed(() => pages.value[activePageIndex.value])
const pageTitle = computed(() => currentPage.value.pageBreak?.body?.trim() || '')
const visibleEntries = computed(() => {
  if (!searching.value) return currentPage.value.entries
  const needle = query.value.trim().toLocaleLowerCase()
  return journalStore.entries.filter(entry => entry.kind !== 'page_break' && [
    entry.body,
    entry.author_name,
    entry.character_name,
    entry.pin?.label,
    entry.pin?.text,
    entry.pin?.detail,
  ].some(value => value?.toLocaleLowerCase().includes(needle)))
})
const emptyMessage = computed(() => {
  if (searching.value) return `Nothing here matches “${query.value}”`
  if (!recordCount.value) return 'The record of play writes itself here. Prose below, pins from the oracle and dice history.'
  return 'A fresh page, nothing on it yet.'
})

onMounted(() => journalStore.init(props.sessionId))

watch(() => journalStore.entries.length, async () => {
  if (pageIndex.value !== null) return
  await nextTick()
  if (scrollEl.value) scrollEl.value.scrollTop = scrollEl.value.scrollHeight
})

watch(activePageIndex, async (index) => {
  renamingBreak.value = false
  exportMenuOpen.value = false
  await nextTick()
  if (!scrollEl.value) return
  scrollEl.value.scrollTop = index === pages.value.length - 1 ? scrollEl.value.scrollHeight : 0
})

function canTouch(entry) {
  return entry.author_user_id === authStore.user?.id || sessionStore.isGM
}

function startEdit(entry) {
  editingId.value = entry.id
  editDraft.value = entry.body
}

function cancelEdit() {
  editingId.value = null
  editDraft.value = ''
}

async function saveEdit(id) {
  const body = editDraft.value.trim()
  if (!body || editSaving.value) return
  editSaving.value = true
  const saved = await journalStore.updateEntry(id, body)
  editSaving.value = false
  if (saved) cancelEdit()
}

function confirmDelete(entry) {
  confirm(
    entry.kind === 'pin' ? 'Delete this pinned result?' : 'Delete this journal entry?',
    () => {
      if (editingId.value === entry.id) cancelEdit()
      journalStore.removeEntry(entry.id)
    },
  )
}

function dayHeader(entry, index) {
  const date = entry.game_date
  if (!date?.year) return null
  const label = `day ${date.year}-${date.month}-${date.day}`
  const prev = visibleEntries.value[index - 1]?.game_date
  const prevLabel = prev?.year ? `day ${prev.year}-${prev.month}-${prev.day}` : null
  return label === prevLabel ? null : label
}

function goToPage(index) {
  pageIndex.value = index >= pages.value.length - 1 ? null : Math.max(0, index)
}

async function newPage() {
  if (!currentPage.value.entries.length && activePageIndex.value === pages.value.length - 1) return
  if (!pages.value[pages.value.length - 1].entries.length) {
    pageIndex.value = null
    return
  }
  const saved = await journalStore.addPageBreak()
  if (saved) {
    pageIndex.value = null
    startRename()
  }
}

async function startRename() {
  titleDraft.value = pageTitle.value
  renamingBreak.value = true
  await nextTick()
  titleInputEl.value?.focus()
}

async function saveTitle() {
  const pageBreak = currentPage.value.pageBreak
  if (!pageBreak || titleSaving.value) return
  const title = titleDraft.value.trim()
  if (title === pageTitle.value) {
    renamingBreak.value = false
    return
  }
  titleSaving.value = true
  const saved = await journalStore.updateEntry(pageBreak.id, title)
  titleSaving.value = false
  if (saved) renamingBreak.value = false
}

function confirmRemoveBreak() {
  const pageBreak = currentPage.value.pageBreak
  if (!pageBreak) return
  confirm('Remove this page break? Its entries join the previous page.', () => {
    const target = activePageIndex.value - 1
    journalStore.removeEntry(pageBreak.id)
    goToPage(target)
  })
}

function entryTime(entry) {
  if (!entry.created_at) return ''
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(entry.created_at))
}

async function applyMarkdown(tool) {
  const textarea = textareaEl.value
  if (!textarea) return
  const start = textarea.selectionStart
  const end = textarea.selectionEnd
  const edit = applyMarkdownEdit(draft.value, start, end, tool)
  draft.value = edit.text
  await nextTick()
  textarea.focus()
  textarea.setSelectionRange(edit.selectionStart, edit.selectionEnd)
}

async function submit() {
  const body = draft.value.trim()
  if (!body) return
  const saved = await journalStore.addProse(body, { characterId: speaker.value?.id ?? null })
  if (saved) {
    draft.value = ''
    pageIndex.value = null
  }
}

function exportMd(exportPageIndex = null) {
  exportMenuOpen.value = false
  const md = journalStore.exportMarkdown(sessionStore.sessionName, { pageIndex: exportPageIndex })
  const blob = new Blob([md], { type: 'text/markdown' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  const base = `${(sessionStore.sessionName || 'campaign').toLowerCase().replace(/\s+/g, '-')}-journal`
  a.download = exportPageIndex === null ? `${base}.md` : `${base}-page-${exportPageIndex + 1}.md`
  a.click()
  URL.revokeObjectURL(url)
}
</script>

<style scoped>
.journal {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  padding: 14px 16px 16px;
  background:
    linear-gradient(rgba(120, 80, 40, 0.025) 1px, transparent 1px) 0 41px / 100% 26px,
    var(--paper);
}

.journal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--rule);
}

.journal-summary {
  display: flex;
  align-items: baseline;
  gap: 7px;
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--ink-mute);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.journal-summary strong {
  font-family: var(--font-display);
  font-size: 22px;
  line-height: 1;
  color: var(--ink);
}

.journal-summary-rule {
  width: 1px;
  height: 13px;
  background: var(--rule-strong);
}

.journal-head-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.journal-export {
  position: relative;
}

.journal-export-options {
  position: absolute;
  right: 0;
  top: calc(100% + 4px);
  z-index: 5;
  display: flex;
  flex-direction: column;
  min-width: 130px;
  border: 1px solid var(--rule-strong);
  background: var(--paper-2);
  box-shadow: 0 6px 18px rgba(40, 25, 10, 0.12);
}

.journal-export-options button {
  padding: 7px 10px;
  border: 0;
  background: transparent;
  color: var(--ink);
  font: 12px var(--font-body);
  text-align: left;
  cursor: pointer;
}

.journal-export-options button:hover,
.journal-export-options button:focus-visible {
  background: var(--paper);
}

.journal-pager {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  margin-bottom: 8px;
  padding: 4px 0;
  border-bottom: 1px solid var(--rule);
}

.journal-pager-label {
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--ink-mute);
}

.journal-page-break {
  font-family: var(--font-display);
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ink-mute);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.journal-page-break::before,
.journal-page-break::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--rule-strong);
}

.journal-page-break span {
  color: var(--ink);
}

.journal-page-rename {
  display: flex;
  align-items: center;
  gap: 4px;
}

.journal-page-rename input {
  width: 190px;
  padding: 3px 7px;
  font-size: 12px;
  text-transform: none;
  letter-spacing: normal;
}

.journal-search {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 10px 0 12px;
  padding: 7px 9px;
  border: 1px solid var(--rule);
  background: color-mix(in srgb, var(--paper-2) 72%, transparent);
  color: var(--ink-mute);
}

.journal-search input {
  min-width: 0;
  flex: 1;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--ink);
  font: 13px var(--font-body);
}

.journal-search button {
  width: 24px;
  height: 24px;
  border: 0;
  background: transparent;
  color: var(--ink-mute);
  cursor: pointer;
}

.journal-scroll {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 2px 8px 12px 2px;
}

.journal-empty {
  font-family: var(--font-body);
  font-style: italic;
  font-size: 13px;
  color: var(--ink-mute);
  text-align: center;
  padding: 16px 0;
}

.journal-day {
  font-family: var(--font-display);
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ink-mute);
  display: flex;
  align-items: center;
  gap: 9px;
  margin-top: 10px;
}

.journal-day::before,
.journal-day::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--rule);
}

.journal-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 11px;
  color: var(--ink-mute);
}

.journal-meta time {
  margin-left: auto;
  margin-right: 7px;
  font-family: var(--font-mono);
  font-size: 9px;
}

.journal-entry-actions {
  display: flex;
  align-items: center;
  gap: 2px;
}

.journal-edit-form {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 6px;
}

.journal-edit-form textarea {
  resize: vertical;
  line-height: 1.45;
}

.journal-edit-actions {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
}

.journal-body {
  margin: 6px 0 0;
  font-family: var(--font-body);
  font-size: 15px;
  line-height: 1.55;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.journal-pin {
  border: 1px solid var(--rule);
  border-left: 3px solid var(--accent-2, #c9a227);
  padding: 10px 12px;
  background: color-mix(in srgb, var(--paper-2) 68%, transparent);
}

.journal-pin-label {
  font-family: var(--font-display);
  font-size: 12px;
}

.journal-pin-label i {
  margin-right: 4px;
}

.journal-pin-text {
  margin: 2px 0 0;
  font-size: 13px;
  overflow-wrap: anywhere;
}

.journal-pin-detail {
  margin: 2px 0 0;
  font-size: 12px;
  color: var(--ink-mute);
  font-style: italic;
}

.journal-compose {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 6px;
  align-items: flex-end;
  border: 1px solid var(--rule-strong);
  border-top: 3px solid var(--ink);
  padding: 10px;
  margin-top: 4px;
  background: var(--paper-2);
  box-shadow: 0 -6px 18px rgba(40, 25, 10, 0.08);
}

.journal-compose--speaking {
  border-top-color: var(--accent-2);
}

.journal-compose-label {
  grid-column: 1 / -1;
  display: flex;
  justify-content: space-between;
  gap: 12px;
  font: 12px var(--font-display);
  color: var(--ink-soft);
}

.journal-compose-hint {
  font: 9px var(--font-mono);
  color: var(--ink-mute);
}

.journal-compose-fields {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.journal-speaker {
  align-self: flex-start;
  width: auto;
  max-width: 100%;
  font-size: 12px;
  padding: 2px 6px;
}

.journal-format-bar {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 3px;
  border: 1px solid var(--rule);
  border-bottom: 0;
  background: var(--paper-3);
}

.journal-format-bar button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 28px;
  height: 26px;
  padding: 0 7px;
  border: 0;
  border-right: 1px solid var(--rule);
  background: transparent;
  color: var(--ink-soft);
  font-size: 11px;
  cursor: pointer;
}

.journal-format-bar button:last-child {
  border-right: 0;
}

.journal-format-bar button:hover,
.journal-format-bar button:focus-visible {
  background: var(--paper);
  color: var(--ink);
  outline: 1px solid var(--rule-strong);
}

.journal-speaker-name {
  color: var(--accent-2, #c9a227);
  font-family: var(--font-display);
}

.journal-speaker-name i {
  margin-right: 4px;
}

.journal-input {
  resize: vertical;
  min-height: 66px;
  line-height: 1.45;
  border-top-left-radius: 0;
  border-top-right-radius: 0;
}

@media (max-width: 560px) {
  .journal {
    padding: 10px;
  }

  .journal-summary span:nth-last-child(-n + 2),
  .journal-summary-rule,
  .journal-compose-hint {
    display: none;
  }
}
</style>
