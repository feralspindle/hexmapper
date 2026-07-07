<template>
  <div class="ds-panel-section" :class="{ collapsed: !open }">
    <div class="ds-section-head" @click="open = !open">
      <i class="fa-solid fa-bolt" style="flex:0 0 auto" />
      <h3>Initiative</h3>
      <span class="ds-meta">
        {{ entries.length ? `round ${state.round} · ${entries.length} in order` : 'no combat' }}
      </span>
      <svg class="ds-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <path d="M6 9l6 6 6-6"/>
      </svg>
    </div>

    <div v-show="open" class="init-body">
      <div
        v-for="entry in sortedEntries"
        :key="entry.id"
        class="init-row"
        :class="{ 'init-row--active': entry.id === state.active_id }"
        data-testid="initiative-entry"
      >
        <span class="init-score" data-testid="initiative-score">{{ entry.initiative }}</span>
        <span class="init-name">
          <i :class="entry.kind === 'pc' ? 'fa-solid fa-user' : 'fa-solid fa-skull'" />
          {{ entry.name }}
        </span>
        <input
          :value="entry.initiative"
          type="number"
          class="ds-input init-edit"
          title="Set initiative"
          @change="sessionStore.initiativeOp('set', { entry_id: entry.id, initiative: Number($event.target.value) || 0 })"
        />
        <button
          type="button"
          class="hm-card-icon-btn hm-card-icon-btn--danger"
          title="Remove"
          data-testid="initiative-remove"
          @click="sessionStore.initiativeOp('remove', { entry_id: entry.id })"
        >
          <i class="fa-solid fa-xmark" />
        </button>
      </div>

      <div class="init-controls">
        <button
          type="button"
          class="ds-btn"
          data-testid="initiative-advance"
          :disabled="!entries.length"
          @click="sessionStore.initiativeOp('advance')"
        >
          <i class="fa-solid fa-forward-step" />
          <span>Next turn</span>
        </button>
        <button type="button" class="hm-card-icon-btn" title="Back to round 1" data-testid="initiative-reset" @click="sessionStore.initiativeOp('reset')">
          <i class="fa-solid fa-rotate-left" />
        </button>
        <button type="button" class="hm-card-icon-btn hm-card-icon-btn--danger" title="Clear the order" data-testid="initiative-clear" @click="sessionStore.initiativeOp('clear')">
          <i class="fa-solid fa-broom" />
        </button>
      </div>

      <div class="init-add">
        <button type="button" class="ds-btn tiny" data-testid="initiative-add-party" @click="addParty">
          <i class="fa-solid fa-users" />
          <span>Add party</span>
        </button>
        <input
          v-model="monsterInput"
          class="ds-input init-monster-input"
          placeholder="3 goblins"
          title="Count and name, e.g. 3 goblins - each rolls its own d20"
          data-testid="initiative-monster-input"
          @keydown.enter.prevent="addMonsters"
        />
        <button type="button" class="ds-btn tiny" data-testid="initiative-add-monsters" @click="addMonsters">
          <i class="fa-solid fa-skull" />
          <span>Add</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useSessionStore } from '@/stores/sessionStore.js'
import { useCharacterStore } from '@/stores/characterStore.js'

const sessionStore = useSessionStore()
const characterStore = useCharacterStore()

const open = ref(false)
const monsterInput = ref('')

const state = computed(() => sessionStore.initiativeState ?? { entries: [], active_id: null, round: 1 })
const entries = computed(() => state.value.entries ?? [])

const sortedEntries = computed(() =>
  [...entries.value].sort(
    (a, b) => (b.initiative - a.initiative) || String(a.name).localeCompare(String(b.name)),
  ),
)

// every party character joins the order; a sheet with initiative already
// rolled keeps it, anyone else gets a server d20. skips characters already in.
async function addParty() {
  const present = new Set(entries.value.map(e => e.character_id).filter(Boolean))
  for (const c of characterStore.characters) {
    if (present.has(c.id)) continue
    await sessionStore.initiativeOp('add', {
      kind: 'pc',
      name: c.data?.name ?? 'Adventurer',
      character_id: c.id,
      initiative: c.data?.initiative ?? null,
    })
  }
}

// "3 goblins" -> add_group of 3, "ogre" -> one entry
async function addMonsters() {
  const raw = monsterInput.value.trim()
  if (!raw) return
  const match = raw.match(/^(\d+)\s+(.+)$/)
  if (match) {
    await sessionStore.initiativeOp('add_group', { name: match[2], count: Number(match[1]) })
  } else {
    await sessionStore.initiativeOp('add', { kind: 'monster', name: raw })
  }
  monsterInput.value = ''
}
</script>

<style scoped>
.init-body {
  padding: 8px 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.init-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 2px 4px;
  border-left: 2px solid transparent;
}

.init-row--active {
  border-left-color: var(--accent);
  background: rgba(255, 255, 255, 0.04);
}

.init-score {
  font-family: var(--font-mono, monospace);
  font-size: 13px;
  width: 22px;
  text-align: right;
  flex: 0 0 auto;
}

.init-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--font-display);
  font-size: 14px;
}

.init-name i {
  margin-right: 4px;
  color: var(--ink-mute);
  font-size: 11px;
}

.init-edit {
  width: 48px;
  padding: 2px 4px;
  text-align: center;
  flex: 0 0 auto;
}

.init-controls {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 4px;
}

.init-controls .ds-btn {
  flex: 1;
}

.init-add {
  display: flex;
  align-items: center;
  gap: 4px;
  border-top: 1px solid var(--rule);
  padding-top: 8px;
  margin-top: 4px;
}

.init-monster-input {
  flex: 1;
  min-width: 0;
  padding: 4px 6px;
  font-size: 12px;
}
</style>
