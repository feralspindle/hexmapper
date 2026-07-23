<template>
  <div v-if="talents.length" class="talent-list" :class="{ compact }" data-testid="character-talents">
    <article v-for="talent in talents" :key="talent.name.toLowerCase()" class="talent-card">
      <button class="talent-head" type="button" @click="toggle(talent.name)">
        <i class="fa-solid fa-medal" />
        <span>{{ talent.name }}</span>
        <small v-if="talent.category">{{ talent.category }}</small>
        <i class="fa-solid fa-chevron-down talent-chevron" :class="{ open: expanded.has(talent.name) }" />
      </button>
      <div v-if="expanded.has(talent.name)" class="talent-body">
        <dl v-if="fields(talent).length" class="talent-facts">
          <div v-for="field in fields(talent)" :key="field.label">
            <dt>{{ field.label }}</dt><dd>{{ field.value }}</dd>
          </div>
        </dl>
        <p v-if="talent.description" class="talent-description">{{ talent.description }}</p>
        <p v-if="!fields(talent).length && !talent.description" class="talent-missing">No talent details recorded</p>
        <button v-if="editable && talent.bonusIndex != null" type="button" class="talent-remove" @click="emit('remove', talent.bonusIndex)">Remove talent</button>
      </div>
    </article>
  </div>
  <p v-else-if="showEmpty" class="talent-empty">No talents recorded</p>
</template>

<script setup>
import { computed, ref } from 'vue'
import { characterTalents, talentSummaryFields } from '@/lib/talents.js'

const props = defineProps({
  character: { type: Object, required: true },
  compact: { type: Boolean, default: false },
  showEmpty: { type: Boolean, default: false },
  editable: { type: Boolean, default: false },
})
const emit = defineEmits(['remove'])

const expanded = ref(new Set())
const talents = computed(() => characterTalents(props.character))

function fields(talent) { return talentSummaryFields(talent) }
function toggle(name) {
  const next = new Set(expanded.value)
  if (next.has(name)) next.delete(name)
  else next.add(name)
  expanded.value = next
}
</script>

<style scoped>
.talent-list { display: flex; flex-direction: column; gap: 5px; margin-top: 6px; }
.talent-card { border: 1px solid var(--rule-strong); border-left: 3px solid #8a6d2a; background: var(--paper-2); }
.talent-head { width: 100%; display: flex; align-items: center; gap: 7px; border: 0; background: transparent; color: var(--ink); padding: 7px 8px; text-align: left; }
.talent-head > i:first-child { color: #8a6d2a; font-size: 11px; }.talent-head span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; font: 14px var(--font-display); }.talent-head small { color: var(--ink-mute); font: 10px var(--font-mono); text-transform: uppercase; }
.talent-chevron { color: var(--ink-mute); font-size: 9px; transition: transform .15s; }.talent-chevron.open { transform: rotate(180deg); }
.talent-body { border-top: 1px solid var(--rule); padding: 8px; }
.talent-facts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 5px 12px; margin: 0; }
.talent-facts div { min-width: 0; }.talent-facts dt { color: var(--ink-mute); font: 9px var(--font-mono); letter-spacing: .08em; text-transform: uppercase; }.talent-facts dd { margin: 1px 0 0; color: var(--ink); font: 12px var(--font-body); overflow-wrap: anywhere; }
.talent-description { margin: 8px 0 0; padding-top: 8px; border-top: 1px solid var(--rule); white-space: pre-line; font: 13px/1.4 var(--font-body); }
.talent-missing, .talent-empty { margin: 0; color: var(--ink-mute); font: italic 12px var(--font-body); }.talent-empty { margin-top: 6px; }
.talent-remove { margin-top: 8px; border: 1px solid var(--rule-strong); background: transparent; color: #8a1c1c; padding: 4px 8px; font: 10px var(--font-mono); }
.compact { margin: 0; padding: 0 8px 7px; }.compact .talent-head { padding: 5px 6px; }.compact .talent-head span { font-size: 12px; }.compact .talent-body { padding: 7px; }.compact .talent-description { font-size: 12px; }
</style>
