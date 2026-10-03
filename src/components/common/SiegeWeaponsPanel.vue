<template>
  <div class="sw-root" data-testid="siege-panel">
    <div class="sw-bar">
      <span class="sw-count">{{ siegeStore.weapons.length }} siege weapon{{ siegeStore.weapons.length === 1 ? '' : 's' }}</span>
      <button
        class="ds-btn tiny ghost"
        data-testid="siege-new"
        @click="showNew = !showNew"
      >
        + New weapon
      </button>
    </div>

    <div v-if="siegeStore.lastError" class="sw-error" data-testid="siege-error">{{ siegeStore.lastError }}</div>

      <SiegeWeaponForm
        v-if="showNew"
        submit-label="Add"
        @save="create"
        @cancel="showNew = false"
      />

    <div v-if="!siegeStore.weapons.length" class="sw-empty">
      No siege weapons yet
    </div>

    <div
      v-for="w in siegeStore.weapons"
      :key="w.id"
      class="sw-card"
      :class="{ 'sw-card--destroyed': (w.hp ?? 0) <= 0 }"
      data-testid="siege-card"
    >
      <div class="sw-head">
        <div class="sw-title-row">
          <span class="sw-name" data-testid="siege-name">{{ w.name }}</span>
          <span class="sw-notation">{{ w.damage_notation }}</span>
          <span v-if="w.attack_bonus" class="sw-atk">{{ fmtBonus(w.attack_bonus) }} atk</span>
        </div>
        <div class="sw-status-row">
          <span class="sw-loaded" :class="{ 'is-loaded': w.is_loaded }">
            {{ (w.hp ?? 0) <= 0 ? 'wrecked' : w.is_loaded ? 'loaded' : 'unloaded' }}
          </span>
          <span class="sw-ammo">
            {{ w.ammo === null ? '∞ ammo' : `${w.ammo}/${w.max_ammo} ammo` }}
          </span>
        </div>
      </div>

      <div class="sw-hp-row">
        <div class="sw-hp-bar">
          <div class="sw-hp-fill" :class="{ low: hpPct(w) <= 25 }" :style="{ width: hpPct(w) + '%' }" />
        </div>
        <span class="sw-hp-label">{{ w.hp ?? 0 }}/{{ w.max_hp ?? 0 }} hp</span>
      </div>

      <div class="sw-crew-row">
        <span class="sw-crew-label" :class="{ 'is-short': crewCount(w) < (w.crew_required ?? 0) }">
          crew {{ crewCount(w) }}/{{ w.crew_required ?? 0 }}
        </span>
        <span v-for="cid in w.crewed_by ?? []" :key="cid" class="sw-crew-chip">{{ crewName(cid) }}</span>
        <button
          v-if="myCharacter && !isCrewed(w, myCharacter.id)"
          class="ds-btn tiny ghost sw-crew-btn"
          data-testid="siege-join"
          @click="siegeStore.joinCrew(w.id, myCharacter.id)"
        >
          Join
        </button>
        <button
          v-else-if="myCharacter && isCrewed(w, myCharacter.id)"
          class="ds-btn tiny ghost sw-crew-btn"
          data-testid="siege-leave"
          @click="siegeStore.leaveCrew(w.id, myCharacter.id)"
        >
          Leave
        </button>
      </div>

      <p v-if="w.notes" class="sw-notes">{{ w.notes }}</p>

      <div class="sw-actions">
        <button
          class="ds-btn tiny sw-fire"
          :disabled="!canFire(w) || siegeStore.firingId !== null"
          :title="fireTitle(w)"
          data-testid="siege-fire"
          @click="siegeStore.fire(w.id)"
        >
          <i class="fa-solid fa-explosion" /> FIRE
        </button>
        <button
          class="ds-btn tiny ghost"
          :disabled="!canReload(w)"
          :title="reloadTitle(w)"
          data-testid="siege-reload"
          @click="siegeStore.reload(w.id)"
        >
          Reload
        </button>
        <div class="sw-hp-controls">
          <button class="ds-btn tiny ghost" title="Deal 5 damage" @click="siegeStore.damage(w.id, 5)">−5</button>
          <button class="ds-btn tiny ghost" title="Deal 1 damage" @click="siegeStore.damage(w.id, 1)">−1</button>
          <button class="ds-btn tiny ghost" title="Repair 1" @click="siegeStore.damage(w.id, -1)">+1</button>
          <button class="ds-btn tiny ghost" title="Repair 5" @click="siegeStore.damage(w.id, -5)">+5</button>
        </div>
        <button class="ds-btn tiny ghost" data-testid="siege-edit" @click="startEdit(w)">Edit</button>
        <button class="ds-btn tiny danger" title="Remove weapon" data-testid="siege-delete" @click="siegeStore.deleteWeapon(w.id)">
          <i class="fa-solid fa-trash-can" />
        </button>
      </div>

      <SiegeWeaponForm
        v-if="editingId === w.id"
        :initial="w"
        :crew-options="crewOptions"
        submit-label="Save"
        @save="patch => saveEdit(w, patch)"
        @cancel="editingId = null"
      />
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import SiegeWeaponForm from '@/components/common/SiegeWeaponForm.vue'
import { useSiegeStore } from '@/stores/siegeStore.js'
import { useCharacterStore } from '@/stores/characterStore.js'
import { useSessionStore } from '@/stores/sessionStore.js'

const siegeStore = useSiegeStore()
const characterStore = useCharacterStore()
const sessionStore = useSessionStore()

const myCharacter = computed(() => characterStore.activeCharacter)
const crewOptions = computed(() =>
  characterStore.characters
    .filter(c => c.user_id !== sessionStore.sessionOwnerId)
    .map(c => ({ id: c.id, name: c.data?.name ?? 'Unknown' })),
)

const showNew = ref(false)
const editingId = ref(null)

function crewCount(w) {
  return (w.crewed_by ?? []).length
}
function isCrewed(w, characterId) {
  return (w.crewed_by ?? []).includes(characterId)
}
function crewName(characterId) {
  return characterStore.characters.find(c => c.id === characterId)?.data?.name ?? 'Someone'
}
function hpPct(w) {
  const max = w.max_hp ?? 1
  return Math.max(0, Math.min(100, ((w.hp ?? 0) / max) * 100))
}
function fmtBonus(bonus) {
  return bonus > 0 ? `+${bonus}` : String(bonus)
}

function canFire(w) {
  return w.is_loaded && (w.hp ?? 0) > 0 && (w.ammo === null || w.ammo > 0)
}
function canReload(w) {
  return !w.is_loaded && (w.hp ?? 0) > 0 && crewCount(w) >= (w.crew_required ?? 0)
}
function fireTitle(w) {
  if ((w.hp ?? 0) <= 0) return 'Wrecked — repair it first'
  if (!w.is_loaded) return 'Not loaded'
  if (w.ammo === 0) return 'Out of ammo'
  return `Attack 1d20${fmtBonus(w.attack_bonus ?? 0)} then ${w.damage_notation}`
}
function reloadTitle(w) {
  if (w.is_loaded) return 'Already loaded'
  if (crewCount(w) < (w.crew_required ?? 0)) return `Needs ${w.crew_required} crew`
  return 'Load the weapon'
}

async function create(patch) {
  const payload = {
    ...patch,
    hp: patch.max_hp,
    ...(patch.max_ammo !== null && patch.max_ammo !== undefined ? { ammo: patch.max_ammo } : {}),
  }
  const row = await siegeStore.createWeapon(payload)
  if (row) showNew.value = false
}

function startEdit(w) {
  editingId.value = editingId.value === w.id ? null : w.id
}

async function saveEdit(w, patch) {
  const row = await siegeStore.updateWeapon(w.id, patch)
  if (row) editingId.value = null
}
</script>

<style scoped>
.sw-root {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.sw-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.sw-count {
  font-family: var(--font-zine, 'Special Elite', serif);
  font-size: 9px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--ink-mute, #8a7a68);
}
.sw-error {
  font-family: var(--font-body, serif);
  font-size: 12px;
  color: var(--accent, #8a1c1c);
  border: 1px solid color-mix(in srgb, var(--accent, #8a1c1c) 35%, transparent);
  background: color-mix(in srgb, var(--accent, #8a1c1c) 8%, transparent);
  padding: 4px 8px;
}
.sw-empty {
  font-family: var(--font-body, serif);
  font-style: italic;
  font-size: 13px;
  color: var(--ink-mute, #8a7a68);
  text-align: center;
  padding: 12px 0;
}
.sw-card {
  border: 1px solid var(--rule);
  background: var(--paper-2, #e3d4b3);
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.sw-card--destroyed {
  opacity: 0.6;
  filter: grayscale(0.5);
}
.sw-title-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex-wrap: wrap;
}
.sw-name {
  font-family: var(--font-display, 'IM Fell English', serif);
  font-size: 15px;
  color: var(--ink, #1a1410);
}
.sw-notation {
  font-family: var(--font-mono, 'JetBrains Mono', monospace);
  font-size: 11px;
  color: #b8541c;
  font-weight: 600;
}
.sw-atk {
  font-family: var(--font-mono, 'JetBrains Mono', monospace);
  font-size: 10px;
  color: var(--ink-mute, #8a7a68);
}
.sw-status-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 2px;
}
.sw-loaded {
  font-family: var(--font-zine, 'Special Elite', serif);
  font-size: 9px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--ink-mute, #8a7a68);
  border: 1px solid var(--rule);
  padding: 1px 6px;
  border-radius: 3px;
}
.sw-loaded.is-loaded {
  color: #2c5e2e;
  border-color: color-mix(in srgb, #2c5e2e 45%, transparent);
}
.sw-card--destroyed .sw-loaded.is-loaded {
  color: var(--ink-mute, #8a7a68);
  border-color: var(--rule);
}
.sw-ammo {
  font-family: var(--font-mono, 'JetBrains Mono', monospace);
  font-size: 10px;
  color: var(--ink-mute, #8a7a68);
}
.sw-hp-row {
  display: flex;
  align-items: center;
  gap: 6px;
}
.sw-hp-bar {
  flex: 1;
  height: 6px;
  background: var(--surface-2, #ece0c4);
  border: 1px solid var(--rule);
  overflow: hidden;
}
.sw-hp-fill {
  height: 100%;
  background: #2c5e2e;
  transition: width 0.2s ease;
}
.sw-hp-fill.low {
  background: var(--accent, #8a1c1c);
}
.sw-hp-label {
  font-family: var(--font-mono, 'JetBrains Mono', monospace);
  font-size: 9px;
  color: var(--ink-mute, #8a7a68);
  flex-shrink: 0;
}
.sw-crew-row {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
}
.sw-crew-label {
  font-family: var(--font-zine, 'Special Elite', serif);
  font-size: 9px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--ink-mute, #8a7a68);
}
.sw-crew-label.is-short {
  color: #b8541c;
}
.sw-crew-chip {
  font-family: var(--font-body, serif);
  font-size: 11px;
  color: var(--ink, #1a1410);
  border: 1px solid var(--rule);
  border-radius: 3px;
  padding: 0 6px;
  background: var(--surface-2, #ece0c4);
}
.sw-crew-btn {
  margin-left: 2px;
}
.sw-notes {
  font-family: var(--font-body, serif);
  font-size: 12px;
  color: var(--ink-soft, #5a4a3a);
  margin: 0;
  font-style: italic;
}
.sw-actions {
  display: flex;
  align-items: center;
  gap: 5px;
  flex-wrap: wrap;
}
.sw-fire {
  font-family: var(--font-zine, 'Special Elite', serif);
  letter-spacing: 0.14em;
  color: var(--accent, #8a1c1c) !important;
  border-color: color-mix(in srgb, var(--accent, #8a1c1c) 55%, transparent) !important;
}
.sw-fire:not(:disabled):hover {
  background: color-mix(in srgb, var(--accent, #8a1c1c) 16%, transparent) !important;
}
.sw-hp-controls {
  display: flex;
  gap: 3px;
  padding: 0 4px;
  border-left: 1px solid var(--rule);
  border-right: 1px solid var(--rule);
}
</style>
