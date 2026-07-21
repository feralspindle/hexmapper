<template>
  <div class="journal">
    <div class="journal-head">
      <span class="ds-meta">{{ journalStore.entries.length }} entries</span>
      <button type="button" class="ds-btn tiny ghost" data-testid="journal-export" title="Download as markdown" @click="exportMd">
        <i class="fa-solid fa-file-arrow-down" />
        <span>Export</span>
      </button>
    </div>

    <div ref="scrollEl" class="journal-scroll">
      <div v-if="!journalStore.entries.length" class="journal-empty">
        The record of play writes itself here. Prose below, pins from the oracle and dice history.
      </div>

      <template v-for="(entry, i) in journalStore.entries" :key="entry.id">
        <div v-if="dayHeader(entry, i)" class="journal-day">{{ dayHeader(entry, i) }}</div>

        <div v-if="entry.kind === 'pin'" class="journal-pin" data-testid="journal-pin">
          <div class="journal-meta">
            <span class="journal-pin-label">
              <i :class="entry.pin?.source === 'dice' ? 'fa-solid fa-dice' : 'fa-solid fa-wand-sparkles'" />
              {{ entry.pin?.label ?? 'pinned' }}
            </span>
            <button v-if="canTouch(entry)" type="button" class="hm-card-icon-btn hm-card-icon-btn--danger" title="Remove pin" @click="journalStore.removeEntry(entry.id)">
              <i class="fa-solid fa-xmark" />
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
            <button v-if="canTouch(entry)" type="button" class="hm-card-icon-btn hm-card-icon-btn--danger" title="Delete entry" @click="journalStore.removeEntry(entry.id)">
              <i class="fa-solid fa-xmark" />
            </button>
          </div>
          <p class="journal-body">{{ entry.body }}</p>
        </div>
      </template>
    </div>

    <div class="journal-compose">
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
        <textarea
          v-model="draft"
          rows="2"
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

const props = defineProps({ sessionId: { type: String, required: true } })

const journalStore = useJournalStore()
const sessionStore = useSessionStore()
const authStore = useAuthStore()
const characterStore = useCharacterStore()

const draft = ref('')
const speakerId = ref('')
const scrollEl = ref(null)

const speaker = computed(() =>
  characterStore.characters.find(c => c.id === speakerId.value) ?? null)
const speakerName = computed(() => speaker.value?.data?.name || (speaker.value ? 'Unnamed' : null))

onMounted(() => journalStore.init(props.sessionId))

watch(() => journalStore.entries.length, async () => {
  await nextTick()
  if (scrollEl.value) scrollEl.value.scrollTop = scrollEl.value.scrollHeight
})

function canTouch(entry) {
  return entry.author_user_id === authStore.user?.id || sessionStore.isGM
}

function dayHeader(entry, index) {
  const date = entry.game_date
  if (!date?.year) return null
  const label = `day ${date.year}-${date.month}-${date.day}`
  const prev = journalStore.entries[index - 1]?.game_date
  const prevLabel = prev?.year ? `day ${prev.year}-${prev.month}-${prev.day}` : null
  return label === prevLabel ? null : label
}

async function submit() {
  const body = draft.value.trim()
  if (!body) return
  const saved = await journalStore.addProse(body, { characterId: speaker.value?.id ?? null })
  if (saved) draft.value = ''
}

function exportMd() {
  const md = journalStore.exportMarkdown(sessionStore.sessionName)
  const blob = new Blob([md], { type: 'text/markdown' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${(sessionStore.sessionName || 'campaign').toLowerCase().replace(/\s+/g, '-')}-journal.md`
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
}

.journal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 2px 8px;
}

.journal-scroll {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-right: 4px;
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
  border-bottom: 1px solid var(--rule);
  padding-bottom: 2px;
  margin-top: 6px;
}

.journal-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 11px;
  color: var(--ink-mute);
}

.journal-body {
  margin: 2px 0 0;
  font-family: var(--font-body);
  font-size: 14px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.journal-pin {
  border-left: 2px solid var(--accent-2, #c9a227);
  padding-left: 8px;
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
  display: flex;
  gap: 6px;
  align-items: flex-end;
  border-top: 1px solid var(--rule);
  padding-top: 8px;
  margin-top: 8px;
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

.journal-speaker-name {
  color: var(--accent-2, #c9a227);
  font-family: var(--font-display);
}

.journal-speaker-name i {
  margin-right: 4px;
}

.journal-input {
  resize: vertical;
  min-height: 40px;
}
</style>
