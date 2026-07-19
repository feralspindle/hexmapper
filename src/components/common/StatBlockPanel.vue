<template>
  <section class="sb-panel ds-panel-section flex-grow">
    <header class="sb-head ds-section-head">
      <i class="fa-solid fa-masks-theater" />
      <div>
        <h3>NPCs &amp; Monsters</h3>
        <span class="ds-meta">
          {{ store.blocks.length ? `${store.npcs.length} npcs · ${store.monsters.length} monsters` : 'no cast yet' }}
        </span>
      </div>
    </header>

    <div class="sb-scroll ds-section-body">
      <div class="sb-add">
        <select v-model="newKind" class="ds-input sb-add-kind" data-testid="statblock-add-kind">
          <option value="monster">Monster</option>
          <option value="npc">NPC</option>
        </select>
        <input
          v-model="newName"
          class="ds-input sb-add-name"
          maxlength="80"
          placeholder="Name..."
          data-testid="statblock-add-name"
          @keydown.enter.prevent="addBlock"
        />
        <button type="button" class="ds-btn tiny" data-testid="statblock-add" @click="addBlock">
          <i class="fa-solid fa-plus" />
          <span>Add</span>
        </button>
      </div>

      <section v-for="group in groups" :key="group.kind" class="sb-group">
        <span class="ds-field-label">{{ group.label }}</span>
        <div v-if="!group.blocks.length" class="sb-empty">{{ group.empty }}</div>

        <article
          v-for="block in group.blocks"
          :key="block.id"
          class="sb-block"
          data-testid="statblock-row"
        >
          <div class="sb-block-head" @click="toggle(block.id)">
            <i :class="block.kind === 'npc' ? 'fa-solid fa-user' : 'fa-solid fa-skull'" />
            <span class="sb-block-name">{{ block.data?.name || 'Unnamed' }}</span>
            <span class="sb-block-tag">AC {{ block.data?.ac ?? '?' }} · LV {{ block.data?.level ?? '?' }}</span>
            <span class="sb-hp" :class="{ 'sb-hp--down': !currentHp(block) }">
              <button type="button" class="hm-card-icon-btn" title="Damage" data-testid="statblock-hp-minus" @click.stop="store.adjustHp(block.id, -1)">
                <i class="fa-solid fa-minus" />
              </button>
              <span class="sb-hp-count" data-testid="statblock-hp">{{ currentHp(block) }}/{{ block.data?.maxHp ?? 0 }}</span>
              <button type="button" class="hm-card-icon-btn" title="Heal" data-testid="statblock-hp-plus" @click.stop="store.adjustHp(block.id, 1)">
                <i class="fa-solid fa-plus" />
              </button>
            </span>
            <svg class="ds-chevron" :class="{ 'sb-chevron-open': expandedId === block.id }" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <path d="M6 9l6 6 6-6"/>
            </svg>
          </div>

          <div v-if="expandedId === block.id" class="sb-editor">
            <div class="sb-grid">
              <label class="sb-field sb-field--wide">
                <span>Name</span>
                <input :value="block.data?.name" class="ds-input" maxlength="80" data-testid="statblock-name" @change="store.updateData(block.id, { name: $event.target.value })" />
              </label>
              <label class="sb-field">
                <span>LV</span>
                <input :value="block.data?.level" type="number" class="ds-input" @change="store.updateData(block.id, { level: Number($event.target.value) || 0 })" />
              </label>
              <label class="sb-field">
                <span>AL</span>
                <input :value="block.data?.alignment" class="ds-input" maxlength="2" @change="store.updateData(block.id, { alignment: $event.target.value })" />
              </label>
              <label class="sb-field">
                <span>AC</span>
                <input :value="block.data?.ac" type="number" class="ds-input" @change="store.updateData(block.id, { ac: Number($event.target.value) || 0 })" />
              </label>
              <label class="sb-field">
                <span>HP</span>
                <input :value="block.data?.maxHp" type="number" class="ds-input" data-testid="statblock-maxhp" @change="setMaxHp(block, $event.target.value)" />
              </label>
              <label class="sb-field">
                <span>MV</span>
                <input :value="block.data?.move" class="ds-input" maxlength="40" @change="store.updateData(block.id, { move: $event.target.value })" />
              </label>
              <label class="sb-field sb-field--wide">
                <span>ATK</span>
                <input :value="block.data?.attacks" class="ds-input" maxlength="200" placeholder="1 bite +4 (1d8)" @change="store.updateData(block.id, { attacks: $event.target.value })" />
              </label>
            </div>
            <div class="sb-stats">
              <label v-for="key in STAT_KEYS" :key="key" class="sb-stat">
                <span>{{ key }}</span>
                <input
                  :value="block.data?.stats?.[key] ?? 0"
                  type="number"
                  class="ds-input"
                  @change="setStat(block, key, $event.target.value)"
                />
              </label>
            </div>
            <textarea
              :value="block.data?.notes"
              class="ds-input sb-notes"
              rows="3"
              maxlength="2000"
              placeholder="Special abilities, tactics, roleplay notes..."
              @change="store.updateData(block.id, { notes: $event.target.value })"
            />
            <div class="sb-actions">
              <button type="button" class="ds-btn tiny" data-testid="statblock-to-initiative" @click="toInitiative(block)">
                <i class="fa-solid fa-bolt" />
                <span>Initiative</span>
              </button>
              <button type="button" class="hm-card-icon-btn" title="Duplicate" data-testid="statblock-duplicate" @click="store.duplicateBlock(block.id)">
                <i class="fa-solid fa-copy" />
              </button>
              <button type="button" class="hm-card-icon-btn hm-card-icon-btn--danger" title="Delete" data-testid="statblock-delete" @click="confirmDelete(block)">
                <i class="fa-solid fa-trash" />
              </button>
            </div>
          </div>
        </article>
      </section>
    </div>
  </section>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useStatBlockStore, STAT_KEYS, blankStatBlock } from '@/stores/statBlockStore.js'
import { useSessionStore } from '@/stores/sessionStore.js'
import { useConfirmDialog } from '@/composables/useConfirmDialog.js'

const store = useStatBlockStore()
const sessionStore = useSessionStore()
const { confirm } = useConfirmDialog()

const newKind = ref('monster')
const newName = ref('')
const expandedId = ref(null)

const groups = computed(() => [
  { kind: 'monster', label: 'Monsters', empty: 'No monsters yet', blocks: store.monsters },
  { kind: 'npc', label: 'NPCs', empty: 'No npcs yet', blocks: store.npcs },
])

function currentHp(block) {
  return Number(block.data?.currentHp) || 0
}

function toggle(id) {
  expandedId.value = expandedId.value === id ? null : id
}

async function addBlock() {
  const name = newName.value.trim()
  if (!name) return
  const row = await store.createBlock(newKind.value, blankStatBlock(name))
  if (row) {
    newName.value = ''
    expandedId.value = row.id
  }
}

function setMaxHp(block, raw) {
  const maxHp = Math.max(0, Number(raw) || 0)
  store.updateData(block.id, {
    maxHp,
    currentHp: Math.min(maxHp, currentHp(block) || maxHp),
  })
}

function setStat(block, key, raw) {
  store.updateData(block.id, {
    stats: { ...block.data?.stats, [key]: Number(raw) || 0 },
  })
}

function toInitiative(block) {
  sessionStore.initiativeOp('add', {
    kind: 'monster',
    name: block.data?.name || 'Unnamed',
  })
}

function confirmDelete(block) {
  confirm(
    `Delete "${block.data?.name || 'this stat block'}"? This cannot be undone.`,
    () => store.removeBlock(block.id),
  )
}
</script>

<style scoped>
.sb-panel {
  height: 100%;
}

.sb-head {
  flex-shrink: 0;
}

.sb-head > div {
  flex: 1;
  min-width: 0;
}

.sb-head h3 {
  margin-bottom: 2px;
}

.sb-head .ds-meta {
  display: block;
}

.sb-scroll {
  flex: 1;
}

.sb-add {
  display: flex;
  align-items: center;
  gap: 6px;
}

.sb-add-kind {
  width: auto;
  flex: 0 0 auto;
}

.sb-add-name {
  flex: 1;
  min-width: 0;
}

.sb-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 10px;
}

.sb-empty {
  font-style: italic;
  font-size: 12px;
  color: var(--ink-mute);
}

.sb-block {
  border: 1px solid var(--rule-strong);
  border-left: 3px solid var(--accent-2);
  background: var(--paper);
}

.sb-block-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
}

.sb-block-head > i {
  color: var(--ink-mute);
  font-size: 11px;
  flex: 0 0 auto;
}

.sb-block-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--font-display);
  font-size: 14px;
}

.sb-block-tag {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--ink-mute);
  flex: 0 0 auto;
}

.sb-hp {
  display: flex;
  align-items: center;
  gap: 2px;
  flex: 0 0 auto;
}

.sb-hp-count {
  font-family: var(--font-mono);
  font-size: 12px;
  min-width: 34px;
  text-align: center;
}

.sb-hp--down .sb-hp-count {
  color: var(--accent);
}

.sb-chevron-open {
  transform: rotate(180deg);
}

.sb-editor {
  border-top: 1px solid var(--rule);
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.sb-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
}

.sb-field {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.sb-field > span {
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--ink-mute);
}

.sb-field .ds-input {
  padding: 3px 6px;
  font-size: 12px;
}

.sb-field--wide {
  grid-column: span 4;
}

.sb-stats {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 4px;
}

.sb-stat {
  display: flex;
  flex-direction: column;
  gap: 2px;
  text-align: center;
}

.sb-stat > span {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--ink-mute);
}

.sb-stat .ds-input {
  padding: 3px 2px;
  font-size: 12px;
  text-align: center;
}

.sb-notes {
  resize: vertical;
  min-height: 48px;
}

.sb-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.sb-actions .ds-btn {
  flex: 1;
}
</style>
