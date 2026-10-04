<template>
  <div class="sw-root" data-testid="siege-panel">
    <div class="sw-bar">
      <span class="sw-title">{{ siegeStore.weapons.length }} siege weapon{{ siegeStore.weapons.length === 1 ? '' : 's' }}</span>
      <button
        class="sw-add-btn"
        data-testid="siege-new"
        @click="showNew = !showNew"
      >
        + New weapon
      </button>
    </div>

    <div v-if="siegeStore.lastError" class="sw-error" data-testid="siege-error">{{ siegeStore.lastError }}</div>

      <SiegeWeaponForm
        v-if="showNew"
        class="sw-form--top"
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
          class="sw-crew-btn"
          data-testid="siege-leave"
          @click="siegeStore.leaveCrew(w.id, myCharacter.id)"
        >
          Leave
        </button>
      </div>

      <p v-if="w.notes" class="sw-notes">{{ w.notes }}</p>

      <div class="sw-actions">
        <button
          class="sw-fire"
          :disabled="!canFire(w) || siegeStore.firingId !== null"
          :title="fireTitle(w)"
          data-testid="siege-fire"
          @click="siegeStore.fire(w.id)"
        >
          <i class="fa-solid fa-explosion" /> FIRE
        </button>
        <button
          class="sw-action"
          :disabled="!canReload(w)"
          :title="reloadTitle(w)"
          data-testid="siege-reload"
          @click="siegeStore.reload(w.id)"
        >
          Reload
        </button>
        <div class="sw-hp-controls">
          <button class="sw-action sw-action--hp" title="Deal 5 damage" @click="siegeStore.damage(w.id, 5)">−5</button>
          <button class="sw-action sw-action--hp" title="Deal 1 damage" @click="siegeStore.damage(w.id, 1)">−1</button>
          <button class="sw-action sw-action--hp" title="Repair 1" @click="siegeStore.damage(w.id, -1)">+1</button>
          <button class="sw-action sw-action--hp" title="Repair 5" @click="siegeStore.damage(w.id, -5)">+5</button>
        </div>
        <button class="sw-action" data-testid="siege-edit" @click="startEdit(w)">Edit</button>
        <button class="sw-action sw-action--danger" title="Remove weapon" data-testid="siege-delete" @click="siegeStore.deleteWeapon(w.id)">
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
  if ((w.hp ?? 0) <= 0) return 'Wrecked: repair it first'
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
/* mirrors the vault tab's pv-* conventions in PartyNotebook.vue so the siege
   tab reads as part of the same notebook */
.sw-root {
  display: flex;
  flex-direction: column;
}
.sw-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 7px 12px 6px;
  border-bottom: 1px solid var(--rule-strong);
  background: var(--paper-2);
}
.sw-title {
  font-family: var(--font-zine);
  font-size: 14px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--ink-soft);
}
.sw-add-btn {
  font-family: var(--font-zine);
  font-size: 14px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--accent-2);
  background: none;
  border: none;
  cursor: default;
  padding: 2px 0;
}
.sw-add-btn:hover { color: var(--accent); }
.sw-error {
  font-family: var(--font-body);
  font-size: 15px;
  color: var(--accent);
  padding: 6px 12px;
  border-bottom: 1px solid var(--rule);
}
.sw-empty {
  font-family: var(--font-body);
  font-style: italic;
  font-size: 18px;
  color: var(--ink-soft);
  text-align: center;
  padding: 12px 12px;
}
.sw-card {
  margin: 8px 10px 0;
  border: 1px solid var(--rule-strong);
  background: var(--paper);
  padding: 10px 10px 8px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.07);
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.sw-card--destroyed {
  opacity: 0.55;
}
.sw-title-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex-wrap: wrap;
}
.sw-name {
  font-family: var(--font-display);
  font-style: italic;
  font-size: 19px;
  color: var(--ink);
}
.sw-notation {
  font-family: var(--font-mono);
  font-size: 15px;
  color: var(--accent-2);
  flex: 0 0 auto;
}
.sw-atk {
  font-family: var(--font-mono);
  font-size: 15px;
  color: var(--ink-soft);
  flex: 0 0 auto;
}
.sw-status-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.sw-loaded {
  font-family: var(--font-zine);
  font-size: 13px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ink-mute);
  border: 1px solid var(--ink-mute);
  border-radius: 2px;
  padding: 1px 4px;
}
.sw-loaded.is-loaded {
  color: var(--accent-3);
  border-color: var(--accent-3);
}
.sw-card--destroyed .sw-loaded.is-loaded {
  color: var(--ink-mute);
  border-color: var(--ink-mute);
}
.sw-ammo {
  font-family: var(--font-mono);
  font-size: 15px;
  color: var(--ink-soft);
}
.sw-hp-row {
  display: flex;
  align-items: center;
  gap: 6px;
}
.sw-hp-bar {
  flex: 1;
  height: 6px;
  background: var(--paper-2);
  border: 1px solid var(--rule-strong);
  overflow: hidden;
}
.sw-hp-fill {
  height: 100%;
  background: var(--accent-3);
  transition: width 0.2s ease-out;
}
.sw-hp-fill.low {
  background: var(--accent);
}
.sw-hp-label {
  font-family: var(--font-mono);
  font-size: 14px;
  color: var(--ink-soft);
  flex-shrink: 0;
}
.sw-crew-row {
  display: flex;
  align-items: center;
  gap: 5px;
  flex-wrap: wrap;
}
.sw-crew-label {
  font-family: var(--font-zine);
  font-size: 13px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ink-soft);
}
.sw-crew-label.is-short {
  color: var(--accent-2);
}
.sw-crew-chip {
  background: var(--paper-2);
  border: 1px solid var(--rule-strong);
  color: var(--ink);
  font-family: var(--font-body);
  font-size: 13px;
  padding: 2px 7px;
  border-radius: 2px;
  white-space: nowrap;
  max-width: 110px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.sw-crew-btn {
  background: none;
  border: none;
  color: var(--ink-mute);
  font-family: var(--font-zine);
  font-size: 13px;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  cursor: default;
  padding: 2px 4px;
  flex: 0 0 auto;
}
.sw-crew-btn:hover { color: var(--accent); }
.sw-notes {
  font-family: var(--font-body);
  font-size: 15px;
  color: var(--ink-soft);
  margin: 0;
}
.sw-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
  padding-top: 3px;
}
.sw-fire {
  background: var(--accent, #a0392a);
  color: white;
  border: none;
  font-family: var(--font-zine);
  font-size: 13px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  padding: 5px 12px;
  border-radius: 2px;
  cursor: default;
  transition: opacity 0.12s;
  white-space: nowrap;
  display: inline-flex;
  align-items: center;
  gap: 5px;
}
.sw-fire:disabled { opacity: 0.4; cursor: not-allowed; }
.sw-fire:not(:disabled):hover { opacity: 0.8; }
.sw-action {
  background: var(--paper-2);
  border: 1px solid var(--rule-strong);
  color: var(--ink);
  font-family: var(--font-zine);
  font-size: 13px;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  padding: 4px 8px;
  border-radius: 2px;
  cursor: default;
  transition: background 0.1s, color 0.1s, border-color 0.1s;
  white-space: nowrap;
}
.sw-action:not(:disabled):hover {
  background: var(--ink);
  color: var(--paper);
  border-color: var(--ink);
}
.sw-action:disabled { opacity: 0.35; cursor: not-allowed; }
.sw-action--danger:not(:disabled):hover {
  background: var(--accent);
  color: white;
  border-color: var(--accent);
}
.sw-action--hp {
  padding: 4px 6px;
}
.sw-hp-controls {
  display: flex;
  gap: 3px;
  padding: 0 4px;
  border-left: 1px solid var(--rule);
  border-right: 1px solid var(--rule);
}
/* the create form sits directly under the section bar like pv-add-form; the
   edit form lives inside a card and gets the dashed divider instead */
.sw-form--top {
  margin: 0;
  padding: 8px 12px 6px;
  border-top: none;
  border-bottom: 1px solid var(--rule);
}
</style>
