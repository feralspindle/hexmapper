<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-[100] flex items-center justify-center">
      <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" @click="emit('close')" />

      <div class="relative w-full max-w-lg mx-4 bg-stone-900 border border-stone-600 rounded-xl shadow-2xl flex flex-col max-h-[90vh]">

        <div class="flex items-center justify-between px-6 pt-5 pb-3 shrink-0">
          <div class="text-sm font-display text-parchment-200 uppercase tracking-wider">New Character</div>
          <button class="text-stone-500 hover:text-stone-200 transition-colors" @click="emit('close')">
            <i class="fa-solid fa-xmark" />
          </button>
        </div>

        <div class="flex-1 overflow-y-auto px-6 pb-4 flex flex-col gap-5">

          <div class="flex flex-col gap-3">
            <div class="text-xs text-stone-500 uppercase tracking-wider">Identity</div>

            <div class="flex gap-3">
              <label class="flex-[2] flex flex-col gap-1">
                <span class="text-xs text-stone-400">Name <span class="text-red-500">*</span></span>
                <input
                  ref="nameInputEl"
                  v-model="form.name"
                  type="text"
                  placeholder="Aldric Thornwood"
                  class="bg-stone-800 border border-stone-600 rounded px-2 py-1.5 text-xs text-stone-100 focus:outline-none focus:border-parchment-400 placeholder-stone-600"
                  data-testid="new-char-name"
                />
              </label>
              <label class="flex-1 flex flex-col gap-1">
                <span class="text-xs text-stone-400">Level</span>
                <input
                  v-model.number="form.level"
                  type="number" min="1" max="20"
                  class="bg-stone-800 border border-stone-600 rounded px-2 py-1.5 text-xs text-stone-100 focus:outline-none focus:border-parchment-400"
                />
              </label>
            </div>

            <div class="flex gap-3">
              <label class="flex-1 flex flex-col gap-1">
                <span class="text-xs text-stone-400">Ancestry</span>
                <input v-model="form.ancestry" type="text" placeholder="Human" class="bg-stone-800 border border-stone-600 rounded px-2 py-1.5 text-xs text-stone-100 focus:outline-none focus:border-parchment-400 placeholder-stone-600" />
              </label>
              <label class="flex-1 flex flex-col gap-1">
                <span class="text-xs text-stone-400">Class</span>
                <input v-model="form.class" type="text" placeholder="Fighter" class="bg-stone-800 border border-stone-600 rounded px-2 py-1.5 text-xs text-stone-100 focus:outline-none focus:border-parchment-400 placeholder-stone-600" />
              </label>
            </div>

            <label class="flex flex-col gap-1">
              <span class="text-xs text-stone-400">Title</span>
              <input v-model="form.title" type="text" placeholder="The Brave" class="bg-stone-800 border border-stone-600 rounded px-2 py-1.5 text-xs text-stone-100 focus:outline-none focus:border-parchment-400 placeholder-stone-600" />
            </label>

            <div class="flex gap-3">
              <label class="flex-1 flex flex-col gap-1">
                <span class="text-xs text-stone-400">Alignment</span>
                <input v-model="form.alignment" type="text" placeholder="Neutral" class="bg-stone-800 border border-stone-600 rounded px-2 py-1.5 text-xs text-stone-100 focus:outline-none focus:border-parchment-400 placeholder-stone-600" />
              </label>
              <label class="flex-1 flex flex-col gap-1">
                <span class="text-xs text-stone-400">Background</span>
                <input v-model="form.background" type="text" placeholder="Soldier" class="bg-stone-800 border border-stone-600 rounded px-2 py-1.5 text-xs text-stone-100 focus:outline-none focus:border-parchment-400 placeholder-stone-600" />
              </label>
            </div>

            <div class="flex gap-3">
              <label class="flex-1 flex flex-col gap-1">
                <span class="text-xs text-stone-400">Deity</span>
                <input v-model="form.deity" type="text" placeholder="—" class="bg-stone-800 border border-stone-600 rounded px-2 py-1.5 text-xs text-stone-100 focus:outline-none focus:border-parchment-400 placeholder-stone-600" />
              </label>
              <label class="flex-1 flex flex-col gap-1">
                <span class="text-xs text-stone-400">Languages</span>
                <input v-model="form.languages" type="text" placeholder="Common" class="bg-stone-800 border border-stone-600 rounded px-2 py-1.5 text-xs text-stone-100 focus:outline-none focus:border-parchment-400 placeholder-stone-600" />
              </label>
            </div>
          </div>

          <div class="flex flex-col gap-3">
            <div class="text-xs text-stone-500 uppercase tracking-wider">Combat Stats</div>
            <div class="grid grid-cols-4 gap-3">
              <label class="flex flex-col gap-1">
                <span class="text-xs text-stone-400">Max HP</span>
                <input v-model.number="form.maxHitPoints" type="number" min="1" class="bg-stone-800 border border-stone-600 rounded px-2 py-1.5 text-xs text-stone-100 focus:outline-none focus:border-parchment-400 text-center" />
              </label>
              <label class="flex flex-col gap-1">
                <span class="text-xs text-stone-400">AC</span>
                <input v-model.number="form.armorClass" type="number" min="0" class="bg-stone-800 border border-stone-600 rounded px-2 py-1.5 text-xs text-stone-100 focus:outline-none focus:border-parchment-400 text-center" />
              </label>
              <label class="flex flex-col gap-1">
                <span class="text-xs text-stone-400">XP</span>
                <input v-model.number="form.XP" type="number" min="0" class="bg-stone-800 border border-stone-600 rounded px-2 py-1.5 text-xs text-stone-100 focus:outline-none focus:border-parchment-400 text-center" />
              </label>
              <label class="flex flex-col gap-1">
                <span class="text-xs text-stone-400">Gear Slots</span>
                <input v-model.number="form.gearSlotsTotal" type="number" min="0" class="bg-stone-800 border border-stone-600 rounded px-2 py-1.5 text-xs text-stone-100 focus:outline-none focus:border-parchment-400 text-center" />
              </label>
            </div>
          </div>

          <div class="flex flex-col gap-3">
            <div class="text-xs text-stone-500 uppercase tracking-wider">Ability Scores</div>
            <div class="grid grid-cols-6 gap-2">
              <label v-for="stat in STATS" :key="stat" class="flex flex-col items-center gap-1">
                <span class="text-xs text-stone-400">{{ stat }}</span>
                <input
                  v-model.number="form.stats[stat]"
                  type="number" min="1" max="20"
                  class="w-full bg-stone-800 border border-stone-600 rounded px-1 py-1.5 text-xs text-stone-100 focus:outline-none focus:border-parchment-400 text-center"
                />
                <span class="text-xs font-mono" :class="statMod(form.stats[stat]) >= 0 ? 'text-green-400' : 'text-red-400'">
                  {{ statMod(form.stats[stat]) >= 0 ? '+' : '' }}{{ statMod(form.stats[stat]) }}
                </span>
              </label>
            </div>
          </div>

        </div>

        <div class="flex gap-2 px-6 py-4 border-t border-stone-700 shrink-0">
          <button
            class="flex-1 py-2 text-xs rounded bg-stone-700 hover:bg-stone-600 text-stone-300 transition-colors"
            @click="emit('close')"
          >Cancel</button>
          <button
            :disabled="!form.name.trim() || saving"
            class="flex-1 py-2 text-xs rounded font-semibold transition-colors disabled:opacity-40 disabled:cursor-default"
            :class="form.name.trim() && !saving ? 'bg-parchment-500 hover:bg-parchment-400 text-stone-900' : 'bg-stone-700 text-stone-500'"
            data-testid="new-char-create"
            @click="submit"
          >
            <i v-if="saving" class="fa-solid fa-spinner fa-spin mr-1" />
            {{ saving ? 'Creating…' : 'Create Character' }}
          </button>
        </div>

      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, nextTick, onMounted } from 'vue'
import { useCharacterStore, statMod } from '@/stores/characterStore.js'

const emit = defineEmits(['close'])

const characterStore = useCharacterStore()
const saving = ref(false)
const nameInputEl = ref(null)

const STATS = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA']

const form = ref({
  name:          '',
  level:         1,
  ancestry:      '',
  class:         '',
  title:         '',
  alignment:     '',
  background:    '',
  deity:         '',
  languages:     'Common',
  maxHitPoints:  8,
  armorClass:    10,
  XP:            0,
  gearSlotsTotal: 10,
  stats: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
  attacks: [],
  gear:    [],
  gold:    0,
  silver:  0,
  copper:  0,
})

onMounted(() => nextTick(() => nameInputEl.value?.focus()))

async function submit() {
  if (!form.value.name.trim() || saving.value) return
  saving.value = true
  try {
    const result = await characterStore.importCharacter({ ...form.value })
    if (result) emit('close')
  } finally {
    saving.value = false
  }
}
</script>
