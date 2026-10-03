<template>
  <form class="sw-form" data-testid="siege-weapon-form" @submit.prevent="submit">
    <div class="sw-form-grid">
      <label class="sw-field sw-field--name">
        <span>name</span>
        <input v-model="form.name" type="text" placeholder="Ballista" maxlength="80" data-testid="siege-field-name" />
      </label>
      <label class="sw-field sw-field--notation">
        <span>damage</span>
        <input
          v-model="form.damage_notation"
          type="text"
          placeholder="3d6!"
          maxlength="60"
          class="sw-mono"
          data-testid="siege-field-notation"
        />
      </label>
      <label class="sw-field">
        <span>atk bonus</span>
        <input v-model.number="form.attack_bonus" type="number" min="-20" max="20" />
      </label>
      <label class="sw-field">
        <span>hp</span>
        <input v-model.number="form.max_hp" type="number" min="1" max="999" data-testid="siege-field-hp" />
      </label>
      <label class="sw-field">
        <span>crew req</span>
        <input v-model.number="form.crew_required" type="number" min="0" max="8" />
      </label>
    </div>

    <label class="sw-check">
      <input v-model="ammoTracked" type="checkbox" data-testid="siege-field-ammo-tracked" />
      <span>tracks ammo</span>
      <template v-if="ammoTracked">
        <input v-model.number="form.max_ammo" type="number" min="1" max="999" class="sw-ammo-input" data-testid="siege-field-max-ammo" />
        <span>shots</span>
      </template>
    </label>

    <div v-if="crewOptions?.length" class="sw-crew-edit">
      <span class="sw-crew-edit-label">crew</span>
      <button
        v-for="c in crewOptions"
        :key="c.id"
        type="button"
        class="sw-crew-opt"
        :class="{ picked: isPicked(c.id) }"
        :data-crew="c.id"
        @click="toggleCrew(c.id)"
      >
        {{ c.name }}
      </button>
    </div>

    <label class="sw-field">
      <span>notes</span>
      <textarea v-model="form.notes" rows="2" maxlength="500" placeholder="Emplacement on the north wall…" />
    </label>

    <div class="sw-form-actions">
      <button class="sw-submit-btn" type="submit" data-testid="siege-form-save">{{ submitLabel }}</button>
      <button class="sw-cancel-btn" type="button" title="Cancel" @click="$emit('cancel')">&times;</button>
    </div>
  </form>
</template>

<script setup>
import { reactive, ref } from 'vue'

const props = defineProps({
  initial: { type: Object, default: null },
  submitLabel: { type: String, default: 'Save' },
  crewOptions: { type: Array, default: null },
})

const emit = defineEmits(['save', 'cancel'])

const form = reactive({
  name: props.initial?.name ?? '',
  damage_notation: props.initial?.damage_notation ?? '3d6!',
  attack_bonus: props.initial?.attack_bonus ?? 0,
  max_hp: props.initial?.max_hp ?? 10,
  crew_required: props.initial?.crew_required ?? 1,
  notes: props.initial?.notes ?? '',
  max_ammo: props.initial?.max_ammo ?? 10,
})

const ammoTracked = ref(props.initial ? props.initial.max_ammo !== null : false)

// toggling crew works on a local copy emitted with the save payload
const crewSelection = ref([...(props.initial?.crewed_by ?? [])])

function isPicked(id) {
  return crewSelection.value.includes(id)
}

function toggleCrew(id) {
  const idx = crewSelection.value.indexOf(id)
  if (idx === -1) crewSelection.value.push(id)
  else crewSelection.value.splice(idx, 1)
}

function submit() {
  emit('save', {
    name: form.name.trim(),
    damage_notation: form.damage_notation.trim(),
    attack_bonus: form.attack_bonus || 0,
    max_hp: form.max_hp || 1,
    crew_required: form.crew_required || 0,
    notes: form.notes.trim(),
    ...(ammoTracked.value
      ? { max_ammo: form.max_ammo || 1 }
      : { max_ammo: null, ammo: null }),
    crewed_by: [...crewSelection.value],
  })
}
</script>

<style scoped>
/* mirrors the vault tab's pv-add-form / pv-input conventions */
.sw-form {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 2px 2px;
  margin-top: 4px;
  border-top: 1px dashed var(--rule);
}
.sw-form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}
.sw-field {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.sw-field--name {
  grid-column: 1 / -1;
}
.sw-field > span {
  font-family: var(--font-zine);
  font-size: 14px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ink-soft);
}
.sw-field input,
.sw-field textarea {
  width: 100%;
  box-sizing: border-box;
  background: var(--paper-2);
  border: 1px solid var(--rule-strong);
  border-radius: 2px;
  padding: 5px 8px;
  font-family: var(--font-body);
  font-size: 16px;
  color: var(--ink);
  outline: none;
}
.sw-field input:focus,
.sw-field textarea:focus {
  border-color: var(--ink-soft);
}
.sw-field textarea {
  resize: vertical;
  min-height: 38px;
}
.sw-mono {
  font-family: var(--font-mono);
}
.sw-check {
  display: flex;
  align-items: center;
  gap: 6px;
  font-family: var(--font-zine);
  font-size: 13px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ink-soft);
  cursor: default;
}
.sw-check input[type='checkbox'] {
  accent-color: var(--accent-2);
}
.sw-ammo-input {
  width: 60px;
  flex: 0 0 60px;
  text-align: center;
  background: var(--paper-2);
  border: 1px solid var(--rule-strong);
  border-radius: 2px;
  padding: 4px 8px;
  font-family: var(--font-mono);
  font-size: 15px;
  color: var(--ink);
  outline: none;
}
.sw-ammo-input:focus {
  border-color: var(--ink-soft);
}
.sw-crew-edit {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
}
.sw-crew-edit-label {
  font-family: var(--font-zine);
  font-size: 13px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ink-soft);
  margin-right: 2px;
}
.sw-crew-opt {
  background: var(--paper-2);
  border: 1px solid var(--rule-strong);
  color: var(--ink);
  font-family: var(--font-body);
  font-size: 13px;
  padding: 2px 7px;
  border-radius: 2px;
  cursor: default;
  transition: background 0.1s, color 0.1s, border-color 0.1s;
  white-space: nowrap;
  max-width: 110px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.sw-crew-opt.picked {
  background: var(--ink);
  color: var(--paper);
  border-color: var(--ink);
}
.sw-form-actions {
  display: flex;
  gap: 6px;
}
.sw-submit-btn {
  flex: 1;
  background: var(--ink);
  color: var(--paper);
  border: none;
  font-family: var(--font-zine);
  font-size: 14px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  padding: 5px 8px;
  cursor: default;
  border-radius: 2px;
  transition: opacity 0.12s;
}
.sw-submit-btn:hover { opacity: 0.8; }
.sw-cancel-btn {
  background: none;
  border: 1px solid var(--rule-strong);
  color: var(--ink-mute);
  width: 26px;
  height: 26px;
  display: grid;
  place-items: center;
  cursor: default;
  border-radius: 2px;
  font-size: 14px;
  flex: 0 0 auto;
}
.sw-cancel-btn:hover { color: var(--accent); border-color: var(--accent); }
</style>
