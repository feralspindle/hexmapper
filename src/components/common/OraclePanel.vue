<template>
  <section class="oracle-panel">
    <header class="oracle-head">
      <div>
        <h2>Oracle</h2>
        <p>{{ sessionStore.playMode === 'gm_less' ? 'GM-less mode' : 'Shared solo tools' }}</p>
      </div>
      <button
        type="button"
        class="oracle-mode"
        :class="{ active: sessionStore.playMode === 'gm_less' }"
        :disabled="!sessionStore.isGM"
        title="Only the campaign owner can change play mode"
        data-testid="oracle-mode-toggle"
        @click="togglePlayMode"
      >
        <i class="fa-solid fa-users" />
        <span>{{ sessionStore.playMode === 'gm_less' ? 'Co-op' : 'GM' }}</span>
      </button>
    </header>

    <div class="oracle-scroll">
      <section class="oracle-section">
        <div class="oracle-section-title">
          <h3>Yes / No</h3>
          <select v-model="odds" data-testid="oracle-odds">
            <option v-for="option in YES_NO_ODDS" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </select>
        </div>
        <input
          v-model="question"
          data-testid="oracle-question"
          type="text"
          maxlength="500"
          placeholder="Ask a closed question..."
          @keydown.enter.prevent="rollYesNo"
        />
        <button
          type="button"
          data-testid="oracle-roll-yes-no"
          :disabled="oracleStore.rolling"
          @click="rollYesNo"
        >
          <i class="fa-solid fa-dice-d20" />
          <span>Ask</span>
        </button>
      </section>

      <section class="oracle-section">
        <div class="oracle-section-title">
          <h3>Event Prompt</h3>
        </div>
        <button
          type="button"
          data-testid="oracle-roll-event"
          :disabled="oracleStore.rolling"
          @click="oracleStore.rollEventPrompt({ question: question.trim() || null })"
        >
          <i class="fa-solid fa-wand-sparkles" />
          <span>Generate Prompt</span>
        </button>
      </section>

      <section class="oracle-section">
        <div class="oracle-section-title">
          <h3>Random Tables</h3>
          <button type="button" data-testid="oracle-table-new" @click="createTable">
            <i class="fa-solid fa-plus" />
          </button>
        </div>

        <div v-if="!oracleStore.tables.length" class="oracle-empty">
          Add a table for encounters, clues, NPC reactions, treasure, or travel events.
        </div>

        <article
          v-for="table in oracleStore.tables"
          :key="table.id"
          class="oracle-table"
          data-testid="oracle-table"
        >
          <div class="oracle-table-head">
            <input
              :value="table.name"
              data-testid="oracle-table-name"
              maxlength="120"
              @change="oracleStore.updateTable(table.id, { name: $event.target.value })"
            />
            <div class="oracle-table-actions">
              <button type="button" title="Roll table" data-testid="oracle-roll-table" @click="oracleStore.rollTable(table.id, question.trim() || null)">
                <i class="fa-solid fa-dice" />
              </button>
              <button type="button" title="Add row" data-testid="oracle-row-new" @click="addRow(table)">
                <i class="fa-solid fa-list-ul" />
              </button>
              <button type="button" title="Delete table" @click="oracleStore.deleteTable(table.id)">
                <i class="fa-solid fa-trash" />
              </button>
            </div>
          </div>
          <textarea
            :value="table.description"
            maxlength="500"
            rows="2"
            placeholder="What this table answers"
            @change="oracleStore.updateTable(table.id, { description: $event.target.value })"
          />
          <input
            :value="table.tag ?? ''"
            class="oracle-table-tag"
            data-testid="oracle-table-tag"
            maxlength="60"
            placeholder="Tag (e.g. hex.terrain, hex.encounter.forest)"
            title="Tagged tables drive exploration-mode hex generation: hex.terrain, hex.poi, hex.encounter, or hex.poi.<terrain> / hex.encounter.<terrain>. hex.terrain results must be terrain ids (plains, forest, mountain, water, desert, swamp, city, dungeon, snow, volcanic)"
            @change="oracleStore.updateTable(table.id, { tag: $event.target.value })"
          />

          <div class="oracle-rows">
            <div
              v-for="row in oracleStore.rowsByTable[table.id] ?? []"
              :key="row.id"
              class="oracle-row"
              data-testid="oracle-row"
            >
              <input
                :value="row.weight"
                type="number"
                min="1"
                title="Weight"
                @change="oracleStore.updateRow(row.id, { weight: Number($event.target.value) || 1 })"
              />
              <input
                :value="row.result"
                maxlength="500"
                data-testid="oracle-row-result"
                @change="oracleStore.updateRow(row.id, { result: $event.target.value })"
              />
              <button type="button" title="Delete row" @click="oracleStore.deleteRow(row.id)">
                <i class="fa-solid fa-xmark" />
              </button>
            </div>
          </div>
        </article>
      </section>

      <section class="oracle-section oracle-history">
        <div class="oracle-section-title">
          <h3>History</h3>
        </div>

        <div v-if="!oracleStore.rolls.length" class="oracle-empty">
          Oracle answers and table rolls appear here for everyone.
        </div>

        <div
          v-for="roll in oracleStore.rolls"
          :key="roll.id"
          class="oracle-roll"
          data-testid="oracle-roll-history"
        >
          <div class="oracle-roll-meta">
            <span>{{ roll.display_name }}</span>
            <span>{{ rollLabel(roll) }}</span>
          </div>
          <p v-if="roll.question" class="oracle-roll-question">{{ roll.question }}</p>
          <p class="oracle-roll-result">{{ resultText(roll) }}</p>
          <p v-if="roll.result?.twist" class="oracle-roll-twist">{{ roll.result.twist }}</p>
          <dl v-if="roll.kind === 'event_prompt'" class="oracle-prompt">
            <div v-for="key in promptKeys" :key="key">
              <dt>{{ labelize(key) }}</dt>
              <dd>{{ roll.result?.[key] }}</dd>
            </div>
          </dl>
          <p v-if="roll.result?.notes" class="oracle-roll-notes">{{ roll.result.notes }}</p>
        </div>
      </section>
    </div>

    <p v-if="oracleStore.error" class="oracle-error">{{ oracleStore.error }}</p>
  </section>
</template>

<script setup>
import { ref } from 'vue'
import { YES_NO_ODDS, useOracleStore } from '@/stores/oracleStore.js'
import { useSessionStore } from '@/stores/sessionStore.js'

const oracleStore = useOracleStore()
const sessionStore = useSessionStore()

const question = ref('')
const odds = ref('even')
const promptKeys = ['action', 'theme', 'subject', 'location', 'complication']

function rollYesNo() {
  oracleStore.rollYesNo({
    question: question.value.trim() || null,
    odds: odds.value,
  })
}

async function createTable() {
  const table = await oracleStore.createTable({
    name: 'New Table',
    description: '',
    mode: 'weighted',
  })
  if (table) {
    await oracleStore.createRow(table.id, {
      weight: 1,
      result: 'First result',
      notes: '',
      position: 0,
    })
  }
}

function addRow(table) {
  const count = oracleStore.rowsByTable[table.id]?.length ?? 0
  oracleStore.createRow(table.id, {
    weight: 1,
    result: 'New result',
    notes: '',
    position: count,
  })
}

function togglePlayMode() {
  if (!sessionStore.isGM) return
  sessionStore.setPlayMode(sessionStore.playMode === 'gm_less' ? 'gm' : 'gm_less')
}

function rollLabel(roll) {
  if (roll.kind === 'yes_no') return 'Yes / No'
  if (roll.kind === 'event_prompt') return 'Prompt'
  return roll.table_name ?? 'Table'
}

function resultText(roll) {
  if (roll.kind === 'yes_no') {
    const rollValue = roll.result?.roll ? ` (${roll.result.roll})` : ''
    return `${roll.result?.label ?? 'Answer'}${rollValue}`
  }
  if (roll.kind === 'table') return roll.result?.result ?? 'No result'
  return ''
}

function labelize(key) {
  return key.replace(/_/g, ' ')
}
</script>

<style scoped>
.oracle-panel {
  display: flex;
  min-height: 0;
  height: 100%;
  flex-direction: column;
  color: oklch(0.92 0.018 82);
}

.oracle-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.75rem;
  border-bottom: 1px solid rgb(41 37 36);
  background: rgb(28 25 23);
}

.oracle-head h2,
.oracle-section-title h3 {
  margin: 0;
  font-family: var(--font-display, serif);
  color: rgb(231 222 194);
}

.oracle-head p {
  margin: 0.125rem 0 0;
  font-size: 0.75rem;
  color: rgb(120 113 108);
}

.oracle-mode,
.oracle-section button,
.oracle-table-actions button,
.oracle-row button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  min-height: 2rem;
  border: 1px solid rgb(68 64 60);
  border-radius: 0.375rem;
  background: rgb(41 37 36);
  color: rgb(214 211 209);
  font-size: 0.8rem;
  transition: border-color 120ms ease-out, background-color 120ms ease-out, color 120ms ease-out;
}

.oracle-mode {
  padding: 0 0.55rem;
}

.oracle-mode.active {
  border-color: rgb(217 180 111);
  color: rgb(250 240 205);
}

.oracle-mode:disabled {
  opacity: 0.65;
}

.oracle-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.oracle-section {
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
}

.oracle-section-title,
.oracle-table-head,
.oracle-roll-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.oracle-section-title select,
.oracle-section input,
.oracle-section textarea {
  width: 100%;
  min-width: 0;
  border: 1px solid rgb(87 83 78);
  border-radius: 0.375rem;
  background: rgb(41 37 36);
  color: rgb(245 245 244);
  font-size: 0.875rem;
}

.oracle-section-title select {
  width: auto;
  padding: 0.35rem 0.45rem;
}

.oracle-section input {
  padding: 0.45rem 0.55rem;
}

.oracle-section textarea {
  resize: vertical;
  padding: 0.45rem 0.55rem;
}

.oracle-section > button {
  padding: 0.45rem 0.65rem;
  background: rgb(216 180 111);
  border-color: rgb(216 180 111);
  color: rgb(28 25 23);
  font-family: var(--font-display, serif);
}

.oracle-table {
  border: 1px solid rgb(68 64 60);
  border-radius: 0.5rem;
  padding: 0.55rem;
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  background: rgb(28 25 23);
}

.oracle-table-head > input {
  font-family: var(--font-display, serif);
  color: rgb(231 222 194);
}

.oracle-table-tag {
  font-family: var(--font-mono, monospace);
  font-size: 0.75rem;
  color: rgb(196 167 107);
}

.oracle-table-actions {
  display: flex;
  gap: 0.35rem;
}

.oracle-table-actions button,
.oracle-row button,
.oracle-section-title button {
  width: 2rem;
  padding: 0;
}

.oracle-rows {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.oracle-row {
  display: grid;
  grid-template-columns: 3.25rem minmax(0, 1fr) 2rem;
  gap: 0.35rem;
}

.oracle-roll {
  border-top: 1px solid rgb(68 64 60);
  padding-top: 0.55rem;
}

.oracle-roll-meta {
  color: rgb(168 162 158);
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.oracle-roll-question,
.oracle-roll-result,
.oracle-roll-twist,
.oracle-roll-notes {
  margin: 0.25rem 0 0;
  overflow-wrap: anywhere;
}

.oracle-roll-question {
  color: rgb(168 162 158);
  font-style: italic;
}

.oracle-roll-result {
  color: rgb(245 245 244);
  font-family: var(--font-display, serif);
  font-size: 1.02rem;
}

.oracle-roll-twist {
  color: rgb(252 211 77);
}

.oracle-roll-notes {
  color: rgb(168 162 158);
}

.oracle-prompt {
  display: grid;
  grid-template-columns: 1fr;
  gap: 0.25rem;
  margin: 0.45rem 0 0;
}

.oracle-prompt div {
  display: grid;
  grid-template-columns: 6rem minmax(0, 1fr);
  gap: 0.5rem;
}

.oracle-prompt dt {
  color: rgb(120 113 108);
  text-transform: capitalize;
}

.oracle-prompt dd {
  margin: 0;
  color: rgb(245 245 244);
}

.oracle-empty,
.oracle-error {
  color: rgb(120 113 108);
  font-size: 0.875rem;
  line-height: 1.4;
}

.oracle-error {
  padding: 0.5rem 0.75rem;
  border-top: 1px solid rgb(68 64 60);
  color: rgb(248 113 113);
}
</style>
