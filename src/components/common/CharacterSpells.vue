<template>
  <div v-if="spells.length" class="spell-list" :class="{ compact }" data-testid="character-spells">
    <article v-for="spell in spells" :key="spell.name.toLowerCase()" class="spell-card">
      <button class="spell-head" type="button" @click="toggle(spell.name)">
        <i class="fa-solid fa-wand-sparkles" />
        <span>{{ spell.name }}</span>
        <small v-if="spell.tier">Tier {{ spell.tier }}</small>
        <i class="fa-solid fa-chevron-down spell-chevron" :class="{ open: expanded.has(spell.name) }" />
      </button>
      <div v-if="expanded.has(spell.name)" class="spell-body">
        <template v-if="spell.hasDetails">
          <dl v-if="spell.fields.length" class="spell-facts">
            <div v-for="field in spell.fields" :key="field.label">
              <dt>{{ field.label }}</dt><dd>{{ format(field.value) }}</dd>
            </div>
          </dl>
          <p v-if="spell.description" class="spell-description">{{ spell.description }}</p>
          <dl v-if="spell.extraFields.length" class="spell-extra">
            <div v-for="field in spell.extraFields" :key="field.label">
              <dt>{{ field.label }}</dt><dd>{{ format(field.value) }}</dd>
            </div>
          </dl>
          <p v-if="!spell.fields.length && !spell.description && !spell.extraFields.length" class="spell-missing">No spell details recorded</p>
        </template>
        <p v-else class="spell-missing">{{ codexAvailable ? 'No matching spell in the Codex' : 'No spell details recorded' }}</p>
        <form v-if="editable && !spell.entry" class="spell-manual" @submit.prevent="saveManual(spell)">
          <label>Tier<input :value="draftValue(spell, 'tier')" @input="setDraft(spell, 'tier', $event.target.value)" /></label>
          <label>Class<input :value="draftValue(spell, 'class')" @input="setDraft(spell, 'class', $event.target.value)" /></label>
          <label>Duration<input :value="draftValue(spell, 'duration')" @input="setDraft(spell, 'duration', $event.target.value)" /></label>
          <label>Range<input :value="draftValue(spell, 'range')" @input="setDraft(spell, 'range', $event.target.value)" /></label>
          <label class="spell-manual-description">Description<textarea :value="draftValue(spell, 'description')" rows="3" @input="setDraft(spell, 'description', $event.target.value)" /></label>
          <button type="submit">Save details</button>
        </form>
        <button v-if="editable" type="button" class="spell-remove" @click="emit('remove', spell.name)">Remove spell</button>
      </div>
    </article>
  </div>
  <p v-else-if="showEmpty" class="spell-empty">No spells known</p>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useCompendiumStore } from '@/stores/compendiumStore.js'
import { useSessionStore } from '@/stores/sessionStore.js'
import { knownSpellNames, findManualSpellDetails, findSpellEntry, spellDescription, spellSummaryFields } from '@/lib/spells.js'

const props = defineProps({
  character: { type: Object, required: true },
  compact: { type: Boolean, default: false },
  showEmpty: { type: Boolean, default: false },
  editable: { type: Boolean, default: false },
})
const emit = defineEmits(['save-details', 'remove'])

const compendiumStore = useCompendiumStore()
const sessionStore = useSessionStore()
// the Codex only ships with solo/co-op play so far; GM-led sessions get a
// neutral message instead of a reference to a feature they don't have
const codexAvailable = computed(() => sessionStore.playMode === 'gm_less')
const expanded = ref(new Set())
const SUMMARY_KEYS = new Set(['tier', 'class', 'classes', 'duration', 'range'])
const DESCRIPTION_KEYS = new Set(['description', 'effect', 'text', 'details', 'body'])
const manualDrafts = ref({})

const spells = computed(() => knownSpellNames(props.character).map(name => {
  const entry = findSpellEntry(compendiumStore.spells, name)
  const manualDetails = findManualSpellDetails(props.character, name)
  const data = entry?.data ?? manualDetails ?? {}
  return {
    name: entry?.name ?? name,
    entry,
    data,
    hasDetails: Boolean(entry || manualDetails),
    tier: data.tier,
    fields: spellSummaryFields(data),
    description: spellDescription(data),
    extraFields: Object.entries(data)
      .filter(([key]) => !SUMMARY_KEYS.has(key.toLowerCase()) && !DESCRIPTION_KEYS.has(key.toLowerCase()))
      .map(([label, value]) => ({ label, value })),
  }
}))

function draftValue(spell, field) {
  return manualDrafts.value[spell.name]?.[field] ?? spell.data?.[field] ?? ''
}
function setDraft(spell, field, value) {
  manualDrafts.value = {
    ...manualDrafts.value,
    [spell.name]: { ...(manualDrafts.value[spell.name] ?? spell.data), [field]: value },
  }
}
function saveManual(spell) {
  const data = Object.fromEntries(Object.entries(manualDrafts.value[spell.name] ?? {})
    .map(([key, value]) => [key, typeof value === 'string' ? value.trim() : value])
    .filter(([, value]) => value !== ''))
  emit('save-details', { name: spell.name, data })
}

function format(value) { return typeof value === 'string' ? value : JSON.stringify(value) }
function toggle(name) {
  const next = new Set(expanded.value)
  if (next.has(name)) next.delete(name)
  else next.add(name)
  expanded.value = next
}
</script>

<style scoped>
.spell-list { display: flex; flex-direction: column; gap: 5px; margin-top: 6px; }
.spell-card { border: 1px solid var(--rule-strong); border-left: 3px solid #67508f; background: var(--paper-2); }
.spell-head { width: 100%; display: flex; align-items: center; gap: 7px; border: 0; background: transparent; color: var(--ink); padding: 7px 8px; text-align: left; }
.spell-head > i:first-child { color: #67508f; font-size: 11px; }.spell-head span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; font: 14px var(--font-display); }.spell-head small { color: var(--ink-mute); font: 10px var(--font-mono); text-transform: uppercase; }
.spell-chevron { color: var(--ink-mute); font-size: 9px; transition: transform .15s; }.spell-chevron.open { transform: rotate(180deg); }
.spell-body { border-top: 1px solid var(--rule); padding: 8px; }
.spell-facts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 5px 12px; margin: 0; }
.spell-facts div, .spell-extra div { min-width: 0; }.spell-facts dt, .spell-extra dt { color: var(--ink-mute); font: 9px var(--font-mono); letter-spacing: .08em; text-transform: uppercase; }.spell-facts dd, .spell-extra dd { margin: 1px 0 0; color: var(--ink); font: 12px var(--font-body); overflow-wrap: anywhere; }
.spell-description { margin: 8px 0 0; padding-top: 8px; border-top: 1px solid var(--rule); white-space: pre-line; font: 13px/1.4 var(--font-body); }
.spell-extra { display: flex; flex-direction: column; gap: 5px; margin: 8px 0 0; padding-top: 7px; border-top: 1px solid var(--rule); }
.spell-missing, .spell-empty { margin: 0; color: var(--ink-mute); font: italic 12px var(--font-body); }.spell-empty { margin-top: 6px; }
.spell-manual { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 7px; margin-top: 8px; }.spell-manual label { color: var(--ink-mute); font: 9px var(--font-mono); letter-spacing: .08em; text-transform: uppercase; }.spell-manual input, .spell-manual textarea { width: 100%; margin-top: 2px; border: 1px solid var(--rule-strong); background: var(--paper); color: var(--ink); padding: 5px 6px; font: 12px var(--font-body); text-transform: none; }.spell-manual-description { grid-column: 1 / -1; }.spell-manual textarea { resize: vertical; }.spell-manual button { justify-self: start; border: 1px solid #67508f; background: #67508f; color: white; padding: 5px 9px; font: 10px var(--font-mono); }
.spell-remove { margin-top: 8px; border: 1px solid var(--rule-strong); background: transparent; color: #8a1c1c; padding: 4px 8px; font: 10px var(--font-mono); }
.compact { margin: 0; padding: 0 8px 7px; }.compact .spell-head { padding: 5px 6px; }.compact .spell-head span { font-size: 12px; }.compact .spell-body { padding: 7px; }.compact .spell-description { font-size: 12px; }
</style>
