<template>
  <section class="oracle-panel ds-panel-section flex-grow">
    <header class="oracle-head ds-section-head">
      <i class="fa-solid fa-wand-sparkles" />
      <div>
        <h3>Oracle</h3>
        <span class="ds-meta">GM-less mode</span>
      </div>
    </header>

    <div ref="scrollRef" class="oracle-scroll ds-section-body">
      <section class="oracle-section">
        <div class="oracle-section-title">
          <span class="ds-field-label">Yes / No</span>
          <select v-model="odds" class="ds-input oracle-select" data-testid="oracle-odds">
            <option v-for="option in YES_NO_ODDS" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </select>
        </div>
        <input
          v-model="question"
          data-testid="oracle-question"
          type="text"
          class="ds-input"
          maxlength="500"
          placeholder="Ask a closed question..."
          @keydown.enter.prevent="rollYesNo"
        />
        <button
          type="button"
          class="ds-btn"
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
          <span class="ds-field-label">Event Prompt</span>
        </div>
        <button
          type="button"
          class="ds-btn"
          data-testid="oracle-roll-event"
          :disabled="oracleStore.rolling"
          @click="rollEventPrompt"
        >
          <i class="fa-solid fa-wand-sparkles" />
          <span>Generate Prompt</span>
        </button>
      </section>

      <section class="oracle-section">
        <div class="oracle-section-title">
          <span class="ds-field-label">Content Packs</span>
        </div>
        <div v-if="packsError" class="oracle-empty">{{ packsError }}</div>
        <div v-for="pack in packs" :key="pack.id" class="oracle-pack" data-testid="oracle-pack">
          <div class="oracle-pack-meta">
            <span class="oracle-pack-name">{{ pack.name }}</span>
            <span class="ds-meta">{{ pack.tables }} tables, {{ pack.rows }} rows</span>
          </div>
          <button
            type="button"
            class="ds-btn tiny"
            data-testid="oracle-pack-install"
            :disabled="installingPack === pack.id"
            @click="installPack(pack.id)"
          >
            <i class="fa-solid fa-download" />
            <span>{{ installingPack === pack.id ? 'Adding…' : 'Add to my tables' }}</span>
          </button>
        </div>
      </section>

      <section class="oracle-section">
        <div class="oracle-section-title">
          <span class="ds-field-label">Session Tables</span>
          <button type="button" class="hm-card-icon-btn" title="New table" data-testid="oracle-table-new" @click="createTable">
            <i class="fa-solid fa-plus" />
          </button>
        </div>

        <div v-if="!oracleStore.sessionTables.length" class="oracle-empty">
          No tables in this game yet. Create one, or add some from your library below.
        </div>

        <article
          v-for="table in oracleStore.sessionTables"
          :key="table.id"
          class="oracle-table"
          data-testid="oracle-table"
        >
          <div class="oracle-table-head">
            <button
              type="button"
              class="hm-card-icon-btn oracle-collapse"
              :title="isExpanded(table.id) ? 'Collapse' : 'Expand'"
              data-testid="oracle-collapse"
              @click="toggleExpanded(table.id)"
            >
              <i class="fa-solid" :class="isExpanded(table.id) ? 'fa-chevron-down' : 'fa-chevron-right'" />
            </button>
            <input
              v-if="isMine(table)"
              :value="table.name"
              class="ds-input oracle-table-name"
              data-testid="oracle-table-name"
              maxlength="120"
              @change="oracleStore.updateTable(table.id, { name: $event.target.value })"
            />
            <span v-else class="oracle-table-name oracle-table-name--shared" data-testid="oracle-table-name">{{ table.name }}</span>
            <div class="oracle-table-actions">
              <button type="button" class="hm-card-icon-btn" title="Roll table" data-testid="oracle-roll-table" @click="rollTable(table)">
                <i class="fa-solid fa-dice" />
              </button>
              <button v-if="isMine(table)" type="button" class="hm-card-icon-btn" title="Add row" data-testid="oracle-row-new" @click="addRow(table)">
                <i class="fa-solid fa-list-ul" />
              </button>
              <button
                type="button"
                class="hm-card-icon-btn"
                title="Remove from session (stays in its owner's library)"
                data-testid="oracle-detach"
                @click="oracleStore.detachTable(table.id)"
              >
                <i class="fa-solid fa-circle-minus" />
              </button>
            </div>
          </div>

          <template v-if="isExpanded(table.id) && isMine(table)">
            <textarea
              :value="table.description"
              class="ds-input oracle-table-description"
              maxlength="500"
              rows="2"
              placeholder="What this table answers"
              @change="oracleStore.updateTable(table.id, { description: $event.target.value })"
            />
            <input
              :value="table.tag ?? ''"
              class="ds-input oracle-table-tag"
              data-testid="oracle-table-tag"
              maxlength="60"
              placeholder="Tag (e.g. weather, hex.terrain, crawl.encounter)"
              title="Tags let the game roll this table automatically - see Table Tags below for what each one drives"
              @change="oracleStore.updateTable(table.id, { tag: $event.target.value })"
            />

            <div class="oracle-rows">
              <div
                v-for="row in oracleStore.rowsByTable[table.id] ?? []"
                :key="row.id"
                :data-row-id="row.id"
                class="oracle-row"
                data-testid="oracle-row"
              >
                <input
                  :value="row.weight"
                  class="ds-input oracle-row-weight"
                  type="number"
                  min="1"
                  title="Weight"
                  @change="oracleStore.updateRow(row.id, { weight: Number($event.target.value) || 1 })"
                />
                <input
                  :value="row.result"
                  class="ds-input"
                  maxlength="500"
                  data-testid="oracle-row-result"
                  title="Wrap dice in braces to roll them inline: {2d6} goblins"
                  @change="oracleStore.updateRow(row.id, { result: $event.target.value })"
                />
                <select
                  :value="row.subtable_id ?? ''"
                  class="ds-input"
                  data-testid="oracle-row-chain"
                  title="Roll through another table when this row comes up"
                  @change="oracleStore.updateRow(row.id, { subtable_id: $event.target.value || null })"
                >
                  <option value="">no chain</option>
                  <option
                    v-for="target in chainTargets(table.id)"
                    :key="target.id"
                    :value="target.id"
                  >
                    → {{ target.name }}
                  </option>
                </select>
                <button type="button" class="hm-card-icon-btn hm-card-icon-btn--danger" title="Delete row" @click="oracleStore.deleteRow(row.id)">
                  <i class="fa-solid fa-xmark" />
                </button>
              </div>
            </div>
          </template>

          <template v-else-if="isExpanded(table.id)">
            <p v-if="table.description" class="oracle-table-shared-desc">{{ table.description }}</p>
            <div class="oracle-rows">
              <div
                v-for="row in oracleStore.rowsByTable[table.id] ?? []"
                :key="row.id"
                class="oracle-row oracle-row--shared"
                data-testid="oracle-row"
              >
                <span class="oracle-row-weight-shared">{{ row.weight }}</span>
                <span class="oracle-row-result-shared">{{ row.result }}</span>
              </div>
            </div>
          </template>
        </article>
      </section>

      <section class="oracle-section">
        <div class="oracle-section-title">
          <span class="ds-field-label">My Tables</span>
          <span class="ds-meta">{{ oracleStore.libraryTables.length }}</span>
        </div>

        <div v-if="!oracleStore.libraryTables.length" class="oracle-empty">
          Tables you create or import live here and follow you between games.
        </div>

        <input
          v-if="oracleStore.libraryTables.length > 8"
          v-model="libraryFilter"
          type="text"
          class="ds-input"
          data-testid="oracle-library-filter"
          placeholder="Filter by name or tag..."
        />

        <div
          v-for="table in filteredLibrary"
          :key="table.id"
          class="oracle-library-row"
          data-testid="oracle-library-item"
        >
          <div class="oracle-library-meta">
            <span class="oracle-library-name">{{ table.name }}</span>
            <span class="ds-meta">
              {{ (oracleStore.rowsByTable[table.id] ?? []).length }} rows<template v-if="table.tag"> · {{ table.tag }}</template>
            </span>
          </div>
          <div class="oracle-table-actions">
            <button
              type="button"
              class="hm-card-icon-btn"
              :class="{ 'oracle-library-added': inSession(table.id) }"
              :title="inSession(table.id) ? 'Remove from this game' : 'Add to this game'"
              data-testid="oracle-library-toggle"
              @click="inSession(table.id) ? oracleStore.detachTable(table.id) : oracleStore.attachTable(table.id)"
            >
              <i class="fa-solid" :class="inSession(table.id) ? 'fa-check' : 'fa-plus'" />
            </button>
            <button
              type="button"
              class="hm-card-icon-btn hm-card-icon-btn--danger"
              title="Delete from library"
              data-testid="oracle-library-delete"
              @click="oracleStore.deleteTable(table.id)"
            >
              <i class="fa-solid fa-trash" />
            </button>
          </div>
        </div>
      </section>

      <section class="oracle-section">
        <div class="oracle-section-title">
          <span class="ds-field-label">Table Tags</span>
        </div>
        <details class="oracle-tags-help" data-testid="oracle-tags-help">
          <summary>how tags wire tables into the game</summary>
          <p>
            A tag marks a table for the game to roll on its own. When something
            needs a result, the game uses the most recently edited session
            table with the matching tag - so the table has to be added to this
            session, and editing a table makes it the active one for its tag.
          </p>
          <dl>
            <div>
              <dt>weather</dt>
              <dd>rolled when a travel day completes; the result lands on the calendar and in chat</dd>
            </div>
            <div>
              <dt>hex.terrain</dt>
              <dd>picks terrain for newly explored hexes. results must be terrain ids: plains, forest, mountain, water, desert, swamp, city, dungeon, snow, volcanic</dd>
            </div>
            <div>
              <dt>hex.poi <span class="oracle-tag-alt">/ hex.poi.forest</span></dt>
              <dd>points of interest on explored hexes. add a terrain suffix to specialize; the bare tag is the fallback</dd>
            </div>
            <div>
              <dt>hex.encounter <span class="oracle-tag-alt">/ hex.encounter.swamp</span></dt>
              <dd>encounters on explored hexes, same suffix rule</dd>
            </div>
            <div>
              <dt>crawl.encounter</dt>
              <dd>wandering encounter check during dungeon crawl rounds</dd>
            </div>
            <div>
              <dt>dungeon.stocking</dt>
              <dd>room contents when generating dungeon rooms</dd>
            </div>
          </dl>
          <p>
            Any other tag is just a label for your own organizing - nothing
            rolls it automatically. The starter pack ships tables for every
            tag above.
          </p>
        </details>
      </section>

      <section ref="historyRef" class="oracle-section oracle-history">
        <div class="oracle-section-title">
          <span class="ds-field-label">History</span>
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
            <span>
              {{ rollLabel(roll) }}
              <button
                type="button"
                class="hm-card-icon-btn oracle-pin"
                title="Pin to journal"
                data-testid="oracle-pin"
                @click="pinRoll(roll)"
              >
                <i class="fa-solid fa-thumbtack" />
              </button>
            </span>
          </div>
          <p v-if="roll.question" class="oracle-roll-question">{{ roll.question }}</p>
          <p class="oracle-roll-result">{{ resultText(roll) }}</p>
          <div v-if="roll.result?.chain" class="oracle-roll-chain" data-testid="oracle-roll-chain">
            <p v-for="step in roll.result.chain.slice(1)" :key="step.row_id" class="oracle-chain-step">
              <span class="oracle-chain-table">{{ step.table_name }}:</span> {{ step.result }}
            </p>
            <p v-if="roll.result.chain_truncated" class="oracle-chain-step oracle-chain-truncated">chain stopped (loop or too deep)</p>
          </div>
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
import { computed, nextTick, onMounted, ref } from 'vue'
import { YES_NO_ODDS, useOracleStore } from '@/stores/oracleStore.js'
import { useJournalStore } from '@/stores/journalStore.js'
import { useAuthStore } from '@/stores/authStore.js'

const oracleStore = useOracleStore()
const authStore = useAuthStore()

const question = ref('')
const odds = ref('even')
const promptKeys = ['action', 'theme', 'subject', 'location', 'complication']

// collapsed by default: libraries get big, and a wall of open row editors
// buries the ask/history sections the panel is really for
const EXPANDED_KEY = 'dm.oracleExpanded'
const expandedIds = ref(new Set(readExpanded()))

function readExpanded() {
  try {
    return JSON.parse(localStorage.getItem(EXPANDED_KEY)) ?? []
  } catch {
    return []
  }
}

function isExpanded(tableId) {
  return expandedIds.value.has(tableId)
}

function toggleExpanded(tableId) {
  const next = new Set(expandedIds.value)
  if (next.has(tableId)) next.delete(tableId)
  else next.add(tableId)
  expandedIds.value = next
  try {
    localStorage.setItem(EXPANDED_KEY, JSON.stringify([...next]))
  } catch { /* private mode etc, collapse state just won't stick */ }
}

function expand(tableId) {
  if (!isExpanded(tableId)) toggleExpanded(tableId)
}

function isMine(table) {
  return table.created_by === authStore.user?.id
}

function inSession(tableId) {
  return oracleStore.sessionTableIds.has(tableId)
}

const libraryFilter = ref('')
const filteredLibrary = computed(() => {
  const needle = libraryFilter.value.trim().toLowerCase()
  if (!needle) return oracleStore.libraryTables
  return oracleStore.libraryTables.filter(table =>
    table.name.toLowerCase().includes(needle) || (table.tag ?? '').includes(needle))
})

const packs = ref([])
const packsError = ref(null)
const installingPack = ref(null)

onMounted(async () => {
  // the store swallows api errors into oracleStore.error and returns null
  const loaded = await oracleStore.listPacks()
  if (loaded) packs.value = loaded
  else packsError.value = 'Could not load content packs.'
})

async function installPack(packId) {
  installingPack.value = packId
  packsError.value = null
  const result = await oracleStore.installPack(packId)
  if (!result) packsError.value = oracleStore.error ?? 'Pack install failed.'
  installingPack.value = null
}

const scrollRef = ref(null)
const historyRef = ref(null)

// the panel is short and history sits below the tables, so a roll that only
// appends down there reads as a dead button without this
async function revealHistory() {
  await nextTick()
  historyRef.value?.scrollIntoView?.({ block: 'start', behavior: 'smooth' })
}

async function rollYesNo() {
  const rolled = await oracleStore.rollYesNo({
    question: question.value.trim() || null,
    odds: odds.value,
  })
  if (rolled) revealHistory()
}

async function rollEventPrompt() {
  const rolled = await oracleStore.rollEventPrompt({ question: question.value.trim() || null })
  if (rolled) revealHistory()
}

async function rollTable(table) {
  const rolled = await oracleStore.rollTable(table.id, question.value.trim() || null)
  if (rolled) revealHistory()
}

async function createTable() {
  const table = await oracleStore.createTable({
    name: 'New Table',
    description: '',
    mode: 'weighted',
  })
  if (table) {
    expand(table.id)
    await oracleStore.createRow(table.id, {
      weight: 1,
      result: 'First result',
      notes: '',
      position: 0,
    })
  }
}

async function addRow(table) {
  expand(table.id)
  const count = oracleStore.rowsByTable[table.id]?.length ?? 0
  const row = await oracleStore.createRow(table.id, {
    weight: 1,
    result: 'New result',
    notes: '',
    position: count,
  })
  if (!row) return
  await nextTick()
  scrollRef.value?.querySelector(`[data-row-id="${row.id}"]`)?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' })
}

// chains stay inside one owner's library, matching the server rule
function chainTargets(tableId) {
  return oracleStore.libraryTables.filter(t => t.id !== tableId)
}

function pinRoll(roll) {
  const journal = useJournalStore()
  let text = resultText(roll)
  if (roll.kind === 'event_prompt') {
    text = promptKeys.map(key => `${labelize(key)}: ${roll.result?.[key]}`).join(', ')
  }
  journal.pin({
    source: 'oracle',
    label: rollLabel(roll),
    text,
    detail: roll.question ?? null,
  })
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
  height: 100%;
}

.oracle-head {
  flex-shrink: 0;
}

.oracle-head > div {
  flex: 1;
  min-width: 0;
}

.oracle-head h3 {
  margin-bottom: 2px;
}

.oracle-head .ds-meta {
  display: block;
}

.oracle-scroll {
  flex: 1;
}

.oracle-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.oracle-section-title,
.oracle-table-head,
.oracle-roll-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.oracle-section-title .ds-field-label {
  margin-bottom: 0;
}

.oracle-select {
  width: auto;
  min-width: 124px;
  flex: 0 0 auto;
}

.oracle-table {
  border: 1px solid var(--rule-strong);
  border-left: 3px solid var(--accent-2);
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  background: var(--paper);
}

.oracle-table-name {
  flex: 1;
  min-width: 0;
  padding: 3px 6px;
  font-size: 13px;
}

.oracle-table-tag {
  font-family: var(--font-mono);
  font-size: 11px;
}

.oracle-table-description {
  min-height: 48px;
}

.oracle-table-actions {
  display: flex;
  gap: 0.35rem;
}

.oracle-table-actions button,
.oracle-section-title button,
.oracle-collapse {
  width: 22px;
  height: 22px;
}

.oracle-collapse {
  flex: 0 0 auto;
  font-size: 10px;
}

.oracle-table-name--shared {
  flex: 1;
  min-width: 0;
  font-family: var(--font-display);
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.oracle-table-shared-desc {
  margin: 0;
  color: var(--ink-soft);
  font-size: 13px;
}

.oracle-row--shared {
  grid-template-columns: 32px minmax(0, 1fr);
  font-size: 13px;
}

.oracle-row-weight-shared {
  color: var(--ink-mute);
  font-family: var(--font-mono);
  text-align: center;
}

.oracle-row-result-shared {
  overflow-wrap: anywhere;
}

.oracle-library-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  border-bottom: 1px solid var(--rule);
  padding-bottom: 4px;
}

.oracle-library-meta {
  min-width: 0;
}

.oracle-library-name {
  display: block;
  font-family: var(--font-display);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.oracle-library-added {
  color: var(--accent-2);
}

.oracle-tags-help summary {
  cursor: pointer;
  font-family: var(--font-body);
  font-size: 13px;
  font-style: italic;
  color: var(--ink-soft);
}

.oracle-tags-help p {
  margin: 6px 0 0;
  font-size: 13px;
  line-height: 1.4;
  color: var(--ink-soft);
}

.oracle-tags-help dl {
  margin: 8px 0 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.oracle-tags-help dt {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--ink);
}

.oracle-tag-alt {
  color: var(--ink-mute);
}

.oracle-tags-help dd {
  margin: 0;
  font-size: 13px;
  line-height: 1.35;
  color: var(--ink-mute);
}

.oracle-rows {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.oracle-row {
  display: grid;
  grid-template-columns: 48px minmax(0, 1fr) minmax(0, 96px) 22px;
  align-items: center;
  gap: 4px;
}

.oracle-row .ds-input {
  padding: 3px 6px;
  font-size: 13px;
}

.oracle-row-weight {
  font-family: var(--font-mono);
  font-style: normal;
  text-align: center;
}

.oracle-roll {
  border: 1px solid var(--rule);
  border-left: 3px solid var(--accent-2);
  padding: 8px 10px;
  background: var(--paper);
}

.oracle-roll-meta {
  color: var(--ink-mute);
  font-family: var(--font-mono);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.oracle-roll-question,
.oracle-roll-result,
.oracle-roll-twist,
.oracle-roll-notes {
  margin: 4px 0 0;
  overflow-wrap: anywhere;
}

.oracle-pin {
  margin-left: 4px;
  font-size: 10px;
}

.oracle-roll-question {
  color: var(--ink-mute);
  font-style: italic;
}

.oracle-roll-result {
  color: var(--ink);
  font-family: var(--font-display);
  font-size: 15px;
}

.oracle-roll-twist {
  color: var(--accent-2);
}

.oracle-roll-notes {
  color: var(--ink-soft);
}

.oracle-roll-chain {
  margin-top: 2px;
}

.oracle-chain-step {
  margin: 2px 0 0;
  padding-left: 10px;
  overflow-wrap: anywhere;
}

.oracle-chain-table {
  color: var(--ink-mute);
}

.oracle-chain-truncated {
  color: var(--ink-mute);
  font-style: italic;
}

.oracle-pack {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.oracle-pack-meta {
  min-width: 0;
}

.oracle-pack-name {
  display: block;
  font-family: var(--font-display);
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
  color: var(--ink-mute);
  text-transform: capitalize;
}

.oracle-prompt dd {
  margin: 0;
  color: var(--ink);
}

.oracle-empty,
.oracle-error {
  color: var(--ink-mute);
  font-family: var(--font-body);
  font-size: 14px;
  font-style: italic;
  line-height: 1.4;
}

.oracle-error {
  padding: 0.5rem 0.75rem;
  border-top: 1px solid var(--rule);
  color: var(--accent);
}
</style>
