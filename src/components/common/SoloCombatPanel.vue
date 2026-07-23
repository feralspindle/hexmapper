<template>
  <section class="combat-panel" data-testid="solo-combat-panel">
    <header class="combat-status">
      <div>
        <span class="combat-kicker">Round {{ state.round }}</span>
        <strong>{{ activeEntry ? `${activeEntry.name}'s turn` : entries.length ? 'Ready to begin' : 'No initiative order' }}</strong>
      </div>
      <button class="ds-btn" :disabled="!entries.length" data-testid="combat-next-turn" @click="sessionStore.initiativeOp('advance')">
        <span>{{ activeEntry ? 'Next turn' : 'Start combat' }}</span>
        <i class="fa-solid fa-forward-step" />
      </button>
    </header>

    <div v-if="entries.length" class="combat-order" aria-label="Initiative order">
      <button
        v-for="entry in sortedEntries"
        :key="entry.id"
        class="combat-turn-chip"
        :class="{ active: entry.id === state.active_id, down: entry.death?.dead }"
        :title="`${entry.name}: initiative ${entry.initiative}`"
        @click="sessionStore.initiativeOp('set_active', { entry_id: entry.id })"
      >
        <span>{{ entry.initiative }}</span>{{ entry.name }}
      </button>
    </div>

    <div class="combat-toolbar">
      <button type="button" class="ds-btn tiny" @click="addParty"><i class="fa-solid fa-users" /> Party</button>
      <input v-model="monsterInput" class="ds-input" placeholder="3 goblins" @keydown.enter.prevent="addMonsters" />
      <button type="button" class="ds-btn tiny" @click="addMonsters"><i class="fa-solid fa-plus" /> Foes</button>
    </div>

    <div class="combat-roster">
      <section class="combat-side">
        <div class="combat-side-head"><span>Party</span><small>{{ party.length }}</small></div>
        <p v-if="!party.length" class="combat-empty">No characters in the party</p>
        <article v-for="character in party" :key="character.id" class="combat-card" :class="{ active: isActiveCharacter(character) }">
          <div class="combat-card-head">
            <div class="combat-name"><i class="fa-solid fa-user" /><strong>{{ character.data?.name || 'Adventurer' }}</strong><small>AC {{ character.data?.armorClass ?? '?' }}</small></div>
            <HpControl :current="character.data?.currentHp ?? character.data?.maxHitPoints ?? 0" :max="character.data?.maxHitPoints ?? 0" @adjust="characterStore.adjustHpForChar(character.id, $event)" @set="setCharacterHp(character, $event)" />
          </div>
          <div class="combat-actions">
            <template v-for="attack in attacksFor(character)" :key="attack.key">
              <button class="combat-attack" :disabled="attack.disabled" @click="rollAttack(character, attack)">
                <span>{{ attack.label }}</span><small>d20 {{ signed(attack.bonus) }}</small>
              </button>
              <button v-if="attack.damage" class="combat-damage" :disabled="attack.disabled" :title="`Roll ${attack.label} damage`" @click="rollDamage(character, attack)">{{ attack.damage }}</button>
            </template>
            <span v-if="!attacksFor(character).length" class="combat-empty inline">No attacks</span>
          </div>
          <CharacterSpells :character="character.data" compact />
          <div class="combat-conditions">
            <button v-for="condition in character.data?.conditions ?? []" :key="condition" class="condition-badge" :style="{ '--condition': conditionBadge(condition).color }" @click="removeCondition(character, condition)">
              <i :class="conditionBadge(condition).faClass" />{{ condition }}<i class="fa-solid fa-xmark" />
            </button>
            <select class="condition-add" aria-label="Add condition" @change="addCondition(character, $event)">
              <option value="">+ condition</option>
              <option v-for="condition in availableConditions(character)" :key="condition.name" :value="condition.name">{{ condition.name }}</option>
            </select>
          </div>
        </article>
      </section>

      <section class="combat-side">
        <div class="combat-side-head"><span>Foes</span><small>{{ foes.length }}</small></div>
        <p v-if="!foes.length" class="combat-empty">Add foes above or from the Codex to track them here</p>
        <article v-for="foe in foes" :key="foe.entry.id" class="combat-card foe" :class="{ active: foe.entry.id === state.active_id, down: foe.entry.hp === 0 }">
          <div class="combat-card-head">
            <div class="combat-name"><i class="fa-solid fa-skull" /><strong>{{ foe.entry.name }}</strong><small>AC {{ foe.block?.data?.ac ?? '?' }} · LV {{ foe.block?.data?.level ?? '?' }}</small></div>
            <HpControl :current="foe.entry.hp ?? null" :max="foe.entry.max_hp ?? null" @adjust="sessionStore.initiativeOp('adjust_hp', { entry_id: foe.entry.id, delta: $event })" @set="sessionStore.initiativeOp('set_hp', { entry_id: foe.entry.id, hp: $event })" />
            <button class="hm-card-icon-btn" title="Remove from combat" @click="sessionStore.initiativeOp('remove', { entry_id: foe.entry.id })"><i class="fa-solid fa-xmark" /></button>
          </div>
          <div class="foe-attack"><span>ATK</span>{{ foe.block?.data?.attacks || 'No attacks recorded' }}</div>
          <div v-if="foe.block?.data?.notes" class="foe-notes">{{ foe.block.data.notes }}</div>
          <div class="combat-conditions">
            <button v-for="condition in foeConditions(foe)" :key="condition" class="condition-badge" :style="{ '--condition': conditionBadge(condition).color }" @click="removeFoeCondition(foe, condition)">
              <i :class="conditionBadge(condition).faClass" />{{ condition }}<i class="fa-solid fa-xmark" />
            </button>
            <select class="condition-add" aria-label="Add condition" @change="addFoeCondition(foe, $event)">
              <option value="">+ condition</option>
              <option v-for="condition in remainingConditions(foeConditions(foe))" :key="condition.name" :value="condition.name">{{ condition.name }}</option>
            </select>
          </div>
        </article>
      </section>
    </div>
  </section>
</template>

<script setup>
import { computed, ref } from 'vue'
import HpControl from '@/components/common/SoloCombatHpControl.vue'
import CharacterSpells from '@/components/common/CharacterSpells.vue'
import { useCharacterStore, parseAttack, parseDamageDie, statMod } from '@/stores/characterStore.js'
import { useStatBlockStore } from '@/stores/statBlockStore.js'
import { useSessionStore } from '@/stores/sessionStore.js'
import { useDiceStore } from '@/stores/diceStore.js'
import { COMMON_CONDITIONS, conditionBadge } from '@/lib/conditions.js'

const characterStore = useCharacterStore()
const statBlockStore = useStatBlockStore()
const sessionStore = useSessionStore()
const diceStore = useDiceStore()
const monsterInput = ref('')

const state = computed(() => sessionStore.initiativeState ?? { entries: [], active_id: null, round: 1 })
const entries = computed(() => state.value.entries ?? [])
const sortedEntries = computed(() => [...entries.value].sort((a, b) => (b.initiative - a.initiative) || a.name.localeCompare(b.name)))
const activeEntry = computed(() => entries.value.find(entry => entry.id === state.value.active_id) ?? null)
const party = computed(() => characterStore.characters)
const foes = computed(() => sortedEntries.value.filter(entry => entry.kind === 'monster').map(entry => ({ entry, block: blockFor(entry) })))

function signed(value) { return value >= 0 ? `+${value}` : String(value) }
function normalizedName(value) { return String(value ?? '').trim().toLowerCase().replace(/\s+\d+$/, '') }
function isActiveCharacter(character) { return activeEntry.value?.character_id === character.id }
function blockFor(entry) {
  if (entry.stat_block_id) return statBlockStore.monsters.find(block => block.id === entry.stat_block_id) ?? null
  return statBlockStore.monsters.find(block => normalizedName(block.data?.name) === normalizedName(entry.name)) ?? null
}
function matchingBlock(name) {
  const wanted = normalizedName(name)
  return statBlockStore.monsters.find(block => {
    const blockName = normalizedName(block.data?.name)
    return blockName === wanted || `${blockName}s` === wanted
  }) ?? null
}

function attacksFor(character) {
  return (character.data?.attacks ?? []).map((source, index) => {
    const raw = typeof source === 'string' ? source : source.raw ?? ''
    const parsed = parseAttack(raw)
    const statKey = typeof source === 'object' ? source.statKey : null
    const bonus = statKey && character.data?.stats?.[statKey] != null ? statMod(character.data.stats[statKey]) : parsed.bonus
    return { ...parsed, key: source.id ?? `${index}-${raw}`, bonus, damage: typeof source === 'object' ? source.damageDie : null, disabled: typeof source === 'object' && source.disabled }
  })
}
function rollAttack(character, attack) { diceStore.rollDice({ d20: 1 }, attack.bonus, attack.label, character.id) }
function rollDamage(character, attack) {
  const die = parseDamageDie(attack.damage)
  if (die) diceStore.rollDice({ [`d${die.sides}`]: die.count }, die.modifier, `${attack.label} damage`, character.id)
}
function remainingConditions(active) {
  const taken = new Set(active)
  return COMMON_CONDITIONS.filter(condition => !taken.has(condition.name))
}
function availableConditions(character) {
  return remainingConditions(character.data?.conditions ?? [])
}
function addCondition(character, event) {
  const condition = event.target.value
  event.target.value = ''
  if (!condition) return
  characterStore.updateFieldForChar(character.id, 'conditions', [...(character.data?.conditions ?? []), condition])
}
function removeCondition(character, condition) {
  characterStore.updateFieldForChar(character.id, 'conditions', (character.data?.conditions ?? []).filter(value => value !== condition))
}
function setCharacterHp(character, value) {
  const max = character.data?.maxHitPoints ?? 0
  characterStore.updateFieldForChar(character.id, 'currentHp', Math.min(max, value))
}
function foeConditions(foe) { return foe.entry.conditions ?? [] }
function addFoeCondition(foe, event) {
  const condition = event.target.value
  event.target.value = ''
  if (!condition) return
  sessionStore.initiativeOp('set_conditions', { entry_id: foe.entry.id, conditions: [...foeConditions(foe), condition] })
}
function removeFoeCondition(foe, condition) {
  sessionStore.initiativeOp('set_conditions', { entry_id: foe.entry.id, conditions: foeConditions(foe).filter(value => value !== condition) })
}
async function addParty() {
  const present = new Set(entries.value.map(entry => entry.character_id).filter(Boolean))
  for (const character of party.value) {
    if (!present.has(character.id)) await sessionStore.initiativeOp('add', { kind: 'pc', name: character.data?.name ?? 'Adventurer', character_id: character.id, initiative: character.data?.initiative ?? null })
  }
}
async function addMonsters() {
  const raw = monsterInput.value.trim()
  if (!raw) return
  const counted = raw.match(/^(\d+)\s+(.+)$/)
  const name = counted ? counted[2] : raw
  const block = matchingBlock(name)
  const maxHp = block ? Number(block.data?.maxHp) || 0 : null
  await sessionStore.addFoesToInitiative({
    name: block?.data?.name || name,
    count: counted ? Number(counted[1]) : 1,
    statBlockId: block?.id ?? null,
    hp: maxHp,
    maxHp,
  })
  monsterInput.value = ''
}
</script>

<style scoped>
.combat-panel { height: 100%; min-height: 0; display: flex; flex-direction: column; background: var(--paper); }
.combat-status { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px; border-bottom: 1px solid var(--rule-strong); background: var(--paper-2); }
.combat-status > div { min-width: 0; display: flex; flex-direction: column; }
.combat-kicker, .combat-side-head, .foe-attack span { color: var(--ink-mute); font: 10px var(--font-mono); letter-spacing: .1em; text-transform: uppercase; }
.combat-status strong { font: 18px var(--font-display); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.combat-order { display: flex; gap: 4px; padding: 7px 10px; overflow-x: auto; border-bottom: 1px solid var(--rule); }
.combat-turn-chip { flex: 0 0 auto; border: 1px solid var(--rule-strong); background: var(--paper); color: var(--ink); padding: 3px 7px; font: 11px var(--font-body); }
.combat-turn-chip span { color: var(--ink-mute); font-family: var(--font-mono); margin-right: 5px; }
.combat-turn-chip.active { border-color: var(--accent); background: var(--accent); color: var(--paper); }
.combat-turn-chip.active span { color: inherit; }
.combat-turn-chip.down { opacity: .45; text-decoration: line-through; }
.combat-toolbar { display: flex; gap: 5px; padding: 8px 10px; border-bottom: 1px solid var(--rule); }
.combat-toolbar input { flex: 1; min-width: 80px; }
.combat-roster { flex: 1; min-height: 0; overflow: auto; padding: 10px; display: grid; grid-template-columns: repeat(2, minmax(210px, 1fr)); gap: 12px; align-items: start; }
.combat-side { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.combat-side-head { display: flex; justify-content: space-between; padding: 0 2px 3px; border-bottom: 1px solid var(--ink); color: var(--ink); }
.combat-side-head small { color: var(--ink-mute); }
.combat-card { border: 1px solid var(--rule-strong); border-left: 3px solid var(--accent-2); background: var(--paper-2); }
.combat-card.foe { border-left-color: #8a1c1c; }
.combat-card.foe.down { opacity: .55; }.combat-card.foe.down .combat-name strong { text-decoration: line-through; }
.combat-card.active { outline: 2px solid var(--accent); outline-offset: 1px; }
.combat-card-head { display: flex; align-items: center; gap: 8px; padding: 7px 8px; }
.combat-name { flex: 1; min-width: 0; display: grid; grid-template-columns: auto 1fr; align-items: center; gap: 0 6px; }
.combat-name > i { grid-row: span 2; color: var(--ink-mute); font-size: 11px; }
.combat-name strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font: 14px var(--font-display); }
.combat-name small { color: var(--ink-mute); font: 10px var(--font-mono); }
.combat-actions { display: flex; flex-wrap: wrap; gap: 4px; padding: 0 8px 7px; }
.combat-attack, .combat-damage { border: 1px solid var(--rule); background: var(--paper); color: var(--ink); padding: 4px 6px; font: 11px var(--font-body); }
.combat-attack { display: flex; gap: 7px; }.combat-attack small { color: var(--ink-mute); font-family: var(--font-mono); }.combat-damage { color: #8a1c1c; font-family: var(--font-mono); }
.combat-conditions { display: flex; align-items: center; flex-wrap: wrap; gap: 4px; padding: 6px 8px; border-top: 1px solid var(--rule); }
.condition-badge { border: 1px solid var(--condition); border-radius: 10px; background: color-mix(in srgb, var(--condition) 15%, var(--paper)); color: var(--ink); padding: 2px 6px; font: 10px var(--font-body); }.condition-badge i { margin-right: 4px; }.condition-badge i:last-child { margin: 0 0 0 5px; opacity: .55; }
.condition-add { max-width: 92px; border: 0; background: transparent; color: var(--ink-mute); font: 10px var(--font-body); }
.foe-attack, .foe-notes { padding: 0 8px 7px; font-size: 12px; line-height: 1.35; }.foe-attack span { margin-right: 6px; }.foe-notes { color: var(--ink-mute); white-space: pre-line; }
.combat-empty { margin: 5px 2px; color: var(--ink-mute); font-size: 11px; font-style: italic; }.combat-empty.inline { align-self: center; }
@media (max-width: 540px) { .combat-roster { grid-template-columns: 1fr; } }
</style>
