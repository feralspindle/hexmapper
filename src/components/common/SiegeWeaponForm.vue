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
      <button class="ds-btn tiny" type="submit" data-testid="siege-form-save">{{ submitLabel }}</button>
      <button class="ds-btn tiny ghost" type="button" @click="$emit('cancel')">Cancel</button>
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
.sw-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px;
  border: 1px solid var(--rule);
  background: var(--surface-2, #ece0c4);
  margin-bottom: 8px;
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
  font-family: var(--font-zine, 'Special Elite', serif);
  font-size: 9px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--ink-mute, #8a7a68);
}
.sw-field--name {
  grid-column: 1 / -1;
}
.sw-field input,
.sw-field textarea {
  background: var(--paper-2, #e3d4b3);
  border: 1px solid var(--rule);
  border-radius: 2px;
  padding: 3px 6px;
  font-family: var(--font-body, serif);
  font-size: 12px;
  color: var(--ink, #1a1410);
  outline: none;
}
.sw-field input:focus,
.sw-field textarea:focus {
  border-color: var(--gold, #c8a827);
}
.sw-mono {
  font-family: var(--font-mono, 'JetBrains Mono', monospace);
}
.sw-check {
  display: flex;
  align-items: center;
  gap: 6px;
  font-family: var(--font-zine, 'Special Elite', serif);
  font-size: 9px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--ink-mute, #8a7a68);
}
.sw-ammo-input {
  width: 52px;
  background: var(--paper-2, #e3d4b3);
  border: 1px solid var(--rule);
  border-radius: 2px;
  padding: 2px 4px;
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  color: var(--ink, #1a1410);
}
.sw-crew-edit {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
}
.sw-crew-edit-label {
  font-family: var(--font-zine, 'Special Elite', serif);
  font-size: 9px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--ink-mute, #8a7a68);
  margin-right: 2px;
}
.sw-crew-opt {
  background: var(--paper-2, #e3d4b3);
  border: 1px solid var(--rule);
  border-radius: 3px;
  padding: 2px 7px;
  font-family: var(--font-body, serif);
  font-size: 11px;
  color: var(--ink-mute, #8a7a68);
  cursor: pointer;
}
.sw-crew-opt.picked {
  border-color: var(--gold, #c8a827);
  color: var(--ink, #1a1410);
  background: color-mix(in srgb, var(--gold, #c8a827) 18%, transparent);
}
.sw-form-actions {
  display: flex;
  gap: 6px;
}
</style>
