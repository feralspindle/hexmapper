<template>
  <section class="cx-panel ds-panel-section">
    <header class="cx-head ds-section-head">
      <i class="fa-solid fa-book" />
      <div>
        <h3>Compendium</h3>
        <span class="ds-meta">
          {{ store.entries.length ? `${store.gear.length} gear · ${store.spells.length} spells` : 'nothing imported yet' }}
        </span>
      </div>
    </header>

    <div class="cx-scroll ds-section-body">
      <input
        v-model="search"
        class="ds-input"
        placeholder="Search the compendium..."
        data-testid="compendium-search"
      />

      <section v-for="group in groups" :key="group.kind" class="cx-group">
        <span class="ds-field-label">{{ group.label }}</span>
        <div v-if="!group.entries.length" class="cx-empty">
          {{ search ? 'No matches' : group.empty }}
        </div>
        <article
          v-for="entry in group.entries"
          :key="entry.id"
          class="cx-entry"
          data-testid="compendium-entry"
        >
          <div class="cx-entry-head" @click="toggle(entry.id)">
            <span class="cx-entry-name">{{ entry.name }}</span>
            <svg class="ds-chevron" :class="{ 'cx-chevron-open': expandedId === entry.id }" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <path d="M6 9l6 6 6-6"/>
            </svg>
          </div>
          <div v-if="expandedId === entry.id" class="cx-entry-body">
            <div v-for="[field, value] in fields(entry)" :key="field" class="cx-field">
              <span class="cx-field-name">{{ field }}</span>
              <span class="cx-field-value">{{ value }}</span>
            </div>
            <div v-if="!fields(entry).length" class="cx-empty">No details</div>
            <button
              type="button"
              class="hm-card-icon-btn hm-card-icon-btn--danger cx-delete"
              title="Delete entry"
              data-testid="compendium-delete"
              @click="confirmDelete(entry)"
            >
              <i class="fa-solid fa-trash" />
            </button>
          </div>
        </article>
      </section>
    </div>
  </section>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useCompendiumStore } from '@/stores/compendiumStore.js'
import { useConfirmDialog } from '@/composables/useConfirmDialog.js'

const store = useCompendiumStore()
const { confirm } = useConfirmDialog()

const search = ref('')
const expandedId = ref(null)

function matches(entry) {
  const needle = search.value.trim().toLowerCase()
  if (!needle) return true
  return entry.name.toLowerCase().includes(needle)
}

const groups = computed(() => [
  { kind: 'gear', label: 'Gear', empty: 'No gear yet', entries: store.gear.filter(matches) },
  { kind: 'spell', label: 'Spells', empty: 'No spells yet', entries: store.spells.filter(matches) },
])

function toggle(id) {
  expandedId.value = expandedId.value === id ? null : id
}

function fields(entry) {
  return Object.entries(entry.data ?? {}).map(([field, value]) => [
    field,
    typeof value === 'string' ? value : JSON.stringify(value),
  ])
}

function confirmDelete(entry) {
  confirm(
    `Delete "${entry.name}" from the compendium?`,
    () => store.removeEntry(entry.id),
  )
}
</script>

<style scoped>
.cx-panel {
  flex-shrink: 0;
}

.cx-head {
  flex-shrink: 0;
}

.cx-head > div {
  flex: 1;
  min-width: 0;
}

.cx-head h3 {
  margin-bottom: 2px;
}

.cx-head .ds-meta {
  display: block;
}

.cx-scroll {
  flex: 1;
}

.cx-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 10px;
}

.cx-empty {
  font-style: italic;
  font-size: 12px;
  color: var(--ink-mute);
}

.cx-entry {
  border: 1px solid var(--rule);
  background: var(--paper);
}

.cx-entry-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 8px;
}

.cx-entry-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--font-body);
  font-size: 13px;
}

.cx-chevron-open {
  transform: rotate(180deg);
}

.cx-entry-body {
  border-top: 1px solid var(--rule);
  padding: 6px 30px 6px 8px;
  display: flex;
  flex-direction: column;
  gap: 3px;
  position: relative;
}

.cx-field {
  display: flex;
  gap: 8px;
  font-size: 12px;
}

.cx-field-name {
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--ink-mute);
  flex: 0 0 auto;
  padding-top: 1px;
  min-width: 56px;
}

.cx-field-value {
  font-family: var(--font-body);
  color: var(--ink);
  min-width: 0;
  overflow-wrap: anywhere;
}

.cx-delete {
  position: absolute;
  top: 4px;
  right: 4px;
}
</style>
