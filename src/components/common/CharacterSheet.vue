<template>
  <div class="flex flex-col h-full overflow-hidden text-stone-300">

    <template v-if="!characterStore.character">
      <div class="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center">
        <i class="fa-solid fa-scroll text-3xl text-stone-600" />
        <p class="text-sm text-stone-500">No character selected.</p>
        <p class="text-xs text-stone-600">Use the <i class="fa-solid fa-chevron-down" /> menu next to the Character button to import or select a character.</p>
      </div>
    </template>

    <template v-else>
      <div
        v-if="!canEdit"
        class="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-stone-800 border-b border-stone-700 text-xs text-stone-500"
      >
        <i class="fa-solid fa-eye" />
        Viewing — read only
      </div>

      <div class="shrink-0 px-3 pt-2 pb-1.5 border-b border-stone-700">
        <div class="font-display text-parchment-200 truncate leading-tight">{{ char.name }}</div>
        <div class="text-xs text-stone-500 truncate">
          {{ char.ancestry }} {{ char.class }} · Lvl {{ char.level }} · {{ char.title }}
        </div>
      </div>

      <div class="shrink-0 flex border-b border-stone-700 text-xs">
        <button
          v-for="t in subTabs"
          :key="t.id"
          class="flex-1 py-1.5 font-display uppercase tracking-wider transition-colors"
          :class="subTab === t.id
            ? 'text-parchment-200 border-b-2 border-parchment-400 -mb-px bg-stone-900'
            : 'text-stone-500 hover:text-stone-300 border-b-2 border-transparent -mb-px'"
          @click="subTab = t.id"
        >{{ t.label }}</button>
      </div>

      <div v-if="subTab === 'stats'" class="flex-1 overflow-y-auto p-3 flex flex-col gap-3">
        <div class="flex gap-2">
          <div class="flex-1 bg-stone-800 rounded p-2 flex flex-col items-center gap-1">
            <span class="text-xs text-stone-500 uppercase tracking-wider">HP</span>
            <div class="flex items-center gap-2">
              <button v-if="canEdit" class="w-6 h-6 rounded bg-stone-700 hover:bg-stone-600 text-sm flex items-center justify-center" @click="characterStore.adjustHp(-1)">−</button>
              <span class="text-xl font-bold text-parchment-200 w-10 text-center">{{ char.currentHp }}</span>
              <button v-if="canEdit" class="w-6 h-6 rounded bg-stone-700 hover:bg-stone-600 text-sm flex items-center justify-center" @click="characterStore.adjustHp(1)">+</button>
            </div>
            <span class="text-xs text-stone-600">/ {{ char.maxHitPoints }}</span>
          </div>
          <div class="flex-1 bg-stone-800 rounded p-2 flex flex-col items-center justify-center gap-1">
            <span class="text-xs text-stone-500 uppercase tracking-wider">AC</span>
            <span class="text-xl font-bold text-parchment-200">{{ char.armorClass }}</span>
          </div>
          <div class="flex-1 bg-stone-800 rounded p-2 flex flex-col items-center justify-center gap-1">
            <span class="text-xs text-stone-500 uppercase tracking-wider">XP</span>
            <span class="text-xl font-bold text-parchment-200">{{ char.XP ?? 0 }}</span>
          </div>
        </div>

        <div class="grid grid-cols-3 gap-2">
          <button
            v-for="stat in stats"
            :key="stat.key"
            class="bg-stone-800 hover:bg-stone-700 rounded p-2 flex flex-col items-center gap-0.5 transition-colors group disabled:cursor-default disabled:hover:bg-stone-800"
            :title="canEdit ? `Roll d20 + ${stat.label} modifier (${stat.mod >= 0 ? '+' : ''}${stat.mod})` : stat.key"
            :disabled="!canEdit"
            @click="rollStat(stat)"
          >
            <span class="text-xs text-stone-500 uppercase tracking-wider group-hover:text-stone-400">{{ stat.key }}</span>
            <span class="text-lg font-bold text-parchment-200">{{ stat.value }}</span>
            <span class="text-xs" :class="stat.mod >= 0 ? 'text-green-400' : 'text-red-400'">
              {{ stat.mod >= 0 ? '+' : '' }}{{ stat.mod }}
            </span>
          </button>
        </div>

        <div class="text-xs text-stone-500 space-y-0.5 bg-stone-800 rounded p-2">
          <div><span class="text-stone-600">Alignment:</span> {{ char.alignment }}</div>
          <div><span class="text-stone-600">Background:</span> {{ char.background }}</div>
          <div v-if="char.deity"><span class="text-stone-600">Deity:</span> {{ char.deity }}</div>
          <div><span class="text-stone-600">Languages:</span> {{ char.languages }}</div>
        </div>
      </div>
      <div v-else-if="subTab === 'combat'" class="flex-1 overflow-y-auto p-3 flex flex-col gap-3">
        <div>
          <div class="text-xs text-stone-500 uppercase tracking-wider mb-1.5">Attacks</div>
          <div class="flex flex-col gap-1.5">
            <div
              v-for="atk in parsedAttacks"
              :key="atk.idx"
              class="bg-stone-800 rounded overflow-hidden transition-opacity"
              :class="atk.disabled ? 'opacity-40' : ''"
            >
              <template v-if="editingAtkIdx !== atk.idx">
                <div class="flex items-stretch group">
                  <button
                    class="flex-1 text-left p-2 hover:bg-stone-700 transition-colors disabled:cursor-default disabled:hover:bg-transparent"
                    :disabled="atk.disabled || !canEdit"
                    @click="rollAttack(atk)"
                  >
                    <div class="text-xs font-bold truncate" :class="atk.disabled ? 'line-through text-stone-500' : 'text-parchment-200'">{{ atk.label }}</div>
                    <div class="text-xs text-stone-500 text-wrap">{{ atk.raw.split(':').slice(1).join(':').trim() }}</div>
                  </button>
                  <button
                    v-if="atk.damageDie && !atk.disabled && canEdit"
                    class="flex flex-col items-center justify-center px-2 shrink-0 border-l border-stone-700 hover:bg-stone-700 transition-colors gap-0.5"
                    :title="`Roll damage (${atk.damageDie})`"
                    @click="rollDamage(atk)"
                  >
                    <i class="fa-solid fa-dice text-red-400 text-xs" />
                    <span class="text-red-400 font-mono leading-none" style="font-size:9px">{{ atk.damageDie }}</span>
                  </button>
                  <div v-if="canEdit" class="flex flex-col justify-center gap-1 px-1.5 shrink-0 border-l border-stone-700 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      class="text-stone-500 hover:text-stone-300 transition-colors"
                      :title="atk.disabled ? 'Enable' : 'Disable'"
                      @click="characterStore.updateAttack(atk.idx, { disabled: !atk.disabled })"
                    ><i :class="atk.disabled ? 'fa-solid fa-eye fa-xs' : 'fa-solid fa-eye-slash fa-xs'" /></button>
                    <button class="text-stone-500 hover:text-stone-300 transition-colors" title="Edit" @click="startAtkEdit(atk)">
                      <i class="fa-solid fa-pencil fa-xs" />
                    </button>
                    <button class="text-stone-500 hover:text-red-400 transition-colors" title="Delete" @click="characterStore.deleteAttack(atk.idx)">
                      <i class="fa-solid fa-trash fa-xs" />
                    </button>
                  </div>
                </div>
              </template>
              <template v-else>
                <div class="p-2 space-y-1.5">
                  <input
                    v-model="editAtkDraft.raw"
                    class="w-full bg-stone-700 border border-stone-600 rounded px-2 py-1 text-stone-100 text-xs focus:outline-none focus:border-parchment-400"
                    placeholder="Name: +bonus to hit…"
                    @keyup.enter="saveAtkEdit(atk.idx)"
                    @keyup.escape="editingAtkIdx = null"
                  />
                  <input
                    v-model="editAtkDraft.damageDie"
                    class="w-full bg-stone-700 border border-stone-600 rounded px-2 py-1 text-stone-100 text-xs focus:outline-none focus:border-parchment-400"
                    placeholder="Damage die, e.g. 1d8+2 (optional)"
                    @keyup.enter="saveAtkEdit(atk.idx)"
                    @keyup.escape="editingAtkIdx = null"
                  />
                  <div class="flex gap-2 justify-end">
                    <button class="text-xs text-parchment-400 hover:text-parchment-200 transition-colors" @click="saveAtkEdit(atk.idx)">Save</button>
                    <button class="text-xs text-stone-500 hover:text-stone-300 transition-colors" @click="editingAtkIdx = null">Cancel</button>
                  </div>
                </div>
              </template>
            </div>
          </div>
        </div>

        <div v-if="char.bonuses?.length">
          <div class="text-xs text-stone-500 uppercase tracking-wider mb-1.5">Talents</div>
          <div class="flex flex-col gap-1">
            <div
              v-for="(b, i) in char.bonuses"
              :key="i"
              class="bg-stone-800 rounded p-2 text-xs"
            >
              <span class="text-parchment-300">{{ b.bonusName }}</span>
              <span class="text-stone-600 ml-1">· {{ b.sourceCategory }} ({{ b.sourceName }})</span>
            </div>
          </div>
        </div>

        <div v-if="char.spellsKnown && char.spellsKnown !== 'None'">
          <div class="text-xs text-stone-500 uppercase tracking-wider mb-1.5">Spells</div>
          <div class="bg-stone-800 rounded p-2 text-xs text-stone-300">{{ char.spellsKnown }}</div>
        </div>
      </div>

      <div v-else-if="subTab === 'gear'" class="flex-1 overflow-y-auto p-3 flex flex-col gap-3">
        <div>
          <div class="flex justify-between text-xs text-stone-500 mb-1">
            <span class="uppercase tracking-wider">Gear Slots</span>
            <span>{{ effectiveGearSlotsUsed }} / {{ char.gearSlotsTotal }}</span>
          </div>
          <div class="w-full bg-stone-700 rounded-full h-2 overflow-hidden">
            <div
              class="h-2 rounded-full transition-all"
              :class="slotRatio > 0.9 ? 'bg-red-500' : slotRatio > 0.7 ? 'bg-amber-500' : 'bg-green-600'"
              :style="{ width: `${Math.min(100, slotRatio * 100)}%` }"
            />
          </div>
          <button
            v-if="canEdit"
            class="mt-2 w-full py-1.5 text-xs rounded bg-stone-700 hover:bg-stone-600 text-stone-300 hover:text-stone-100 transition-colors"
            @click="showAddGear = !showAddGear"
          >+ Add Gear</button>
        </div>

        <div v-if="showAddGear && canEdit" class="bg-stone-800 rounded p-2 space-y-1.5">
          <input
            v-model="newGearDraft.name"
            class="w-full bg-stone-700 border border-stone-600 rounded px-2 py-1 text-stone-100 text-xs focus:outline-none focus:border-parchment-400"
            placeholder="Item name"
            @keyup.enter="submitAddGear"
          />
          <div class="flex gap-2">
            <label class="flex-1 flex flex-col gap-0.5">
              <span class="text-stone-500 text-xs">Slots</span>
              <input v-model.number="newGearDraft.slots" type="number" min="0" class="w-full bg-stone-700 border border-stone-600 rounded px-2 py-1 text-stone-100 text-xs focus:outline-none focus:border-parchment-400" />
            </label>
            <label class="flex-1 flex flex-col gap-0.5">
              <span class="text-stone-500 text-xs">Qty</span>
              <input v-model.number="newGearDraft.quantity" type="number" min="1" class="w-full bg-stone-700 border border-stone-600 rounded px-2 py-1 text-stone-100 text-xs focus:outline-none focus:border-parchment-400" />
            </label>
            <label class="flex-1 flex flex-col gap-0.5">
              <span class="text-stone-500 text-xs">Type</span>
              <select v-model="newGearDraft.type" class="w-full bg-stone-700 border border-stone-600 rounded px-2 py-1 text-stone-100 text-xs focus:outline-none focus:border-parchment-400">
                <option value="weapon">Weapon</option>
                <option value="armor">Armor</option>
                <option value="sundry">Sundry</option>
              </select>
            </label>
          </div>
          <label v-if="newGearDraft.type === 'weapon'" class="flex flex-col gap-0.5">
            <span class="text-stone-500 text-xs">Damage die</span>
            <input
              v-model="newGearDraft.damageDie"
              class="w-full bg-stone-700 border border-stone-600 rounded px-2 py-1 text-stone-100 text-xs focus:outline-none focus:border-parchment-400"
              placeholder="e.g. 1d8, 2d6+2 (optional)"
            />
          </label>
          <div class="flex gap-2 justify-end">
            <button class="text-xs text-parchment-400 hover:text-parchment-200 transition-colors" @click="submitAddGear">Add</button>
            <button class="text-xs text-stone-500 hover:text-stone-300 transition-colors" @click="showAddGear = false">Cancel</button>
          </div>
        </div>

        <div class="flex flex-col gap-1.5">
          <div
            v-for="item in sortedGear"
            :key="item.instanceId"
            class="bg-stone-800 rounded overflow-hidden transition-opacity"
            :class="item.disabled ? 'opacity-40' : ''"
          >
            <template v-if="editingGearId !== item.instanceId">
              <div class="flex items-start gap-2 p-2 group">
                <div class="flex-1 min-w-0">
                  <div class="text-xs text-parchment-200 truncate" :class="item.disabled ? 'line-through text-stone-500' : ''">{{ item.name }}</div>
                  <div class="text-xs text-stone-500">
                    {{ item.slots }} slot{{ item.slots !== 1 ? 's' : '' }}
                    <span v-if="item.quantity > 1"> · ×{{ item.quantity }}</span>
                  </div>
                </div>
                <span
                  class="shrink-0 text-xs px-1.5 py-0.5 rounded"
                  :class="{
                    'bg-red-900/50 text-red-300': item.type === 'weapon',
                    'bg-blue-900/50 text-blue-300': item.type === 'armor',
                    'bg-stone-700 text-stone-400': item.type === 'sundry',
                  }"
                >{{ item.type }}</span>
                <div v-if="canEdit" class="flex gap-1.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    class="text-stone-500 hover:text-stone-300 transition-colors"
                    :title="item.disabled ? 'Enable' : 'Disable'"
                    @click="characterStore.updateGearItem(item.instanceId, { disabled: !item.disabled })"
                  ><i :class="item.disabled ? 'fa-solid fa-eye fa-xs' : 'fa-solid fa-eye-slash fa-xs'" /></button>
                  <button class="text-stone-500 hover:text-stone-300 transition-colors" title="Edit" @click="startGearEdit(item)">
                    <i class="fa-solid fa-pencil fa-xs" />
                  </button>
                  <button class="text-stone-500 hover:text-red-400 transition-colors" title="Delete" @click="characterStore.deleteGearItem(item.instanceId)">
                    <i class="fa-solid fa-trash fa-xs" />
                  </button>
                </div>
              </div>
            </template>
            <template v-else>
              <div class="p-2 space-y-1.5">
                <input
                  v-model="editGearDraft.name"
                  class="w-full bg-stone-700 border border-stone-600 rounded px-2 py-1 text-stone-100 text-xs focus:outline-none focus:border-parchment-400"
                  placeholder="Item name"
                />
                <div class="flex gap-2">
                  <label class="flex-1 flex flex-col gap-0.5">
                    <span class="text-stone-500 text-xs">Slots</span>
                    <input v-model.number="editGearDraft.slots" type="number" min="0" class="w-full bg-stone-700 border border-stone-600 rounded px-2 py-1 text-stone-100 text-xs focus:outline-none focus:border-parchment-400" />
                  </label>
                  <label class="flex-1 flex flex-col gap-0.5">
                    <span class="text-stone-500 text-xs">Qty</span>
                    <input v-model.number="editGearDraft.quantity" type="number" min="1" class="w-full bg-stone-700 border border-stone-600 rounded px-2 py-1 text-stone-100 text-xs focus:outline-none focus:border-parchment-400" />
                  </label>
                  <label class="flex-1 flex flex-col gap-0.5">
                    <span class="text-stone-500 text-xs">Type</span>
                    <select v-model="editGearDraft.type" class="w-full bg-stone-700 border border-stone-600 rounded px-2 py-1 text-stone-100 text-xs focus:outline-none focus:border-parchment-400">
                      <option value="weapon">Weapon</option>
                      <option value="armor">Armor</option>
                      <option value="sundry">Sundry</option>
                    </select>
                  </label>
                </div>
                <div class="flex gap-2 justify-end">
                  <button class="text-xs text-parchment-400 hover:text-parchment-200 transition-colors" @click="saveGearEdit(item.instanceId)">Save</button>
                  <button class="text-xs text-stone-500 hover:text-stone-300 transition-colors" @click="editingGearId = null">Cancel</button>
                </div>
              </div>
            </template>
          </div>
          <div v-if="char.treasures?.length">
            <div class="text-xs text-stone-500 uppercase tracking-wider mt-1 mb-1">Treasures</div>
            <div
              v-for="(t, i) in char.treasures"
              :key="i"
              class="bg-stone-800 rounded p-2 text-xs text-parchment-200"
            >{{ t }}</div>
          </div>
          <div v-if="char.magicItems?.length">
            <div class="text-xs text-stone-500 uppercase tracking-wider mt-1 mb-1">Magic Items</div>
            <div
              v-for="(m, i) in char.magicItems"
              :key="i"
              class="bg-stone-800 rounded p-2 text-xs text-parchment-200"
            >{{ m }}</div>
          </div>
        </div>
      </div>

      <div v-else-if="subTab === 'money'" class="flex-1 overflow-y-auto p-3 flex flex-col gap-3">
        <div class="flex flex-col gap-2">
          <div
            v-for="coin in coins"
            :key="coin.key"
            class="bg-stone-800 rounded p-2 flex items-center gap-3"
          >
            <div class="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0" :class="coin.bg">
              {{ coin.symbol }}
            </div>
            <div class="flex-1">
              <div class="text-xs text-stone-500">{{ coin.label }}</div>
              <div class="text-lg font-bold text-parchment-200">{{ char[coin.key] ?? 0 }}</div>
            </div>
            <div v-if="canEdit" class="flex gap-1">
              <button class="w-7 h-7 rounded bg-stone-700 hover:bg-stone-600 text-sm flex items-center justify-center" @click="characterStore.adjustMoney(coin.key, -1)">−</button>
              <button class="w-7 h-7 rounded bg-stone-700 hover:bg-stone-600 text-sm flex items-center justify-center" @click="characterStore.adjustMoney(coin.key, 1)">+</button>
            </div>
          </div>
        </div>

        <div v-if="char.ledger?.length">
          <div class="text-xs text-stone-500 uppercase tracking-wider mb-1.5">Ledger</div>
          <div class="flex flex-col gap-1">
            <div
              v-for="(entry, i) in char.ledger"
              :key="i"
              class="bg-stone-800 rounded px-2 py-1.5 flex items-center gap-2 text-xs"
            >
              <span class="flex-1 text-stone-400 truncate">{{ entry.desc }}</span>
              <span
                v-if="entry.goldChange"
                :class="entry.goldChange > 0 ? 'text-amber-400' : 'text-red-400'"
              >
                {{ entry.goldChange > 0 ? '+' : '' }}{{ entry.goldChange }}gp
              </span>
              <span
                v-if="entry.silverChange"
                :class="entry.silverChange > 0 ? 'text-slate-300' : 'text-red-400'"
              >
                {{ entry.silverChange > 0 ? '+' : '' }}{{ entry.silverChange }}sp
              </span>
              <span
                v-if="entry.copperChange"
                :class="entry.copperChange > 0 ? 'text-orange-400' : 'text-red-400'"
              >
                {{ entry.copperChange > 0 ? '+' : '' }}{{ entry.copperChange }}cp
              </span>
            </div>
          </div>
        </div>
      </div>

    </template>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useCharacterStore, statMod, parseAttack, parseDamageDie } from '@/stores/characterStore.js'
import { useDiceStore } from '@/stores/diceStore.js'

const characterStore = useCharacterStore()
const diceStore = useDiceStore()

const canEdit = computed(() => characterStore.canEditActiveCharacter)

const subTab = ref('stats')

const subTabs = [
  { id: 'stats',  label: 'Stats'  },
  { id: 'combat', label: 'Combat' },
  { id: 'gear',   label: 'Gear'   },
  { id: 'money',  label: 'Money'  },
]

const coins = [
  { key: 'gold',   label: 'Gold Pieces',   symbol: 'GP', bg: 'bg-amber-700 text-amber-200'  },
  { key: 'silver', label: 'Silver Pieces', symbol: 'SP', bg: 'bg-slate-600 text-slate-200'  },
  { key: 'copper', label: 'Copper Pieces', symbol: 'CP', bg: 'bg-orange-800 text-orange-200' },
]

const char = computed(() => characterStore.character)

const stats = computed(() => {
  if (!char.value?.stats) return []
  return ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'].map(key => ({
    key,
    label: key,
    value: char.value.stats[key],
    mod: statMod(char.value.stats[key]),
  }))
})

const parsedAttacks = computed(() => {
  if (!char.value?.attacks) return []
  return char.value.attacks.map((a, idx) => {
    const raw      = typeof a === 'string' ? a : (a.raw ?? '')
    const disabled = typeof a === 'object' ? (a.disabled ?? false) : false
    const damageDie = typeof a === 'object' ? (a.damageDie ?? null) : null
    return { ...parseAttack(raw), idx, disabled, damageDie }
  })
})

const effectiveGearSlotsUsed = computed(() => {
  if (!char.value?.gear) return char.value?.gearSlotsUsed ?? 0
  return char.value.gear
    .filter(item => !item.disabled)
    .reduce((sum, item) => sum + (item.slots ?? 0) * (item.quantity ?? 1), 0)
})

const GEAR_TYPE_ORDER = { weapon: 0, armor: 1, sundry: 2 }

const sortedGear = computed(() => {
  if (!char.value?.gear) return []
  return [...char.value.gear].sort((a, b) =>
    (GEAR_TYPE_ORDER[a.type] ?? 2) - (GEAR_TYPE_ORDER[b.type] ?? 2)
  )
})

const slotRatio = computed(() => {
  if (!char.value) return 0
  return effectiveGearSlotsUsed.value / (char.value.gearSlotsTotal || 1)
})

const editingAtkIdx = ref(null)
const editAtkDraft  = ref({ raw: '', damageDie: '' })

function startAtkEdit(atk) {
  editingAtkIdx.value = atk.idx
  editAtkDraft.value  = { raw: atk.raw, damageDie: atk.damageDie ?? '' }
}

function saveAtkEdit(idx) {
  characterStore.updateAttack(idx, {
    raw:      editAtkDraft.value.raw.trim(),
    damageDie: editAtkDraft.value.damageDie.trim() || null,
  })
  editingAtkIdx.value = null
}

const showAddGear  = ref(false)
const newGearDraft = ref({ name: '', slots: 1, quantity: 1, type: 'sundry', damageDie: '' })

function submitAddGear() {
  if (!newGearDraft.value.name.trim()) return
  characterStore.addGearItem(newGearDraft.value)
  newGearDraft.value = { name: '', slots: 1, quantity: 1, type: 'sundry', damageDie: '' }
  showAddGear.value = false
}

const editingGearId = ref(null)
const editGearDraft = ref({})

function startGearEdit(item) {
  editingGearId.value = item.instanceId
  editGearDraft.value = { name: item.name, slots: item.slots, quantity: item.quantity, type: item.type }
}

function saveGearEdit(instanceId) {
  characterStore.updateGearItem(instanceId, {
    ...editGearDraft.value,
    slots: Number(editGearDraft.value.slots) || 0,
    quantity: Number(editGearDraft.value.quantity) || 1,
  })
  editingGearId.value = null
}

const STAT_NAMES = { STR: 'Strength', DEX: 'Dexterity', CON: 'Constitution', INT: 'Intelligence', WIS: 'Wisdom', CHA: 'Charisma' }

function rollStat(stat) {
  diceStore.rollDice({ d20: 1 }, stat.mod, `${STAT_NAMES[stat.key] ?? stat.key} check`, characterStore.activeId)
}

function rollAttack(atk) {
  diceStore.rollDice({ d20: 1 }, atk.bonus, atk.label, characterStore.activeId)
}

function rollDamage(atk) {
  const parsed = parseDamageDie(atk.damageDie)
  if (!parsed) return
  diceStore.rollDice(
    { [`d${parsed.sides}`]: parsed.count },
    parsed.modifier,
    `${atk.label} damage`,
    characterStore.activeId,
  )
}
</script>
