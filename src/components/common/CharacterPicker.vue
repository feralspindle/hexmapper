<template>
  <div class="relative" ref="wrapperEl">
    <button
      class="flex items-center gap-1.5 text-xs px-2 py-1 rounded transition-colors max-w-36"
      :class="open
        ? 'text-stone-900 bg-parchment-400'
        : 'text-parchment-400 hover:text-parchment-200 hover:bg-stone-800'"
      @click="open = !open"
    >
      <i class="fa-solid fa-chevron-down text-xs shrink-0 transition-transform" :class="open ? 'rotate-180' : ''" />
      <span class="truncate">{{ characterStore.character?.name ?? 'Characters' }}</span>
    </button>

    <Transition
      enter-active-class="transition-all duration-150 ease-out"
      enter-from-class="opacity-0 -translate-y-1"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition-all duration-100 ease-in"
      leave-from-class="opacity-100 translate-y-0"
      leave-to-class="opacity-0 -translate-y-1"
    >
      <div
        v-if="open"
        class="absolute top-full right-0 mt-1.5 w-56 bg-stone-800 border border-stone-600 rounded-lg shadow-2xl z-50 overflow-hidden"
        @click.stop
      >

       
        <template v-if="!importMode">
          <div v-if="characterStore.loading" class="px-3 py-3 text-xs text-stone-500">
            Loading…
          </div>

          <template v-else>
         
            <div
              v-if="sessionStore.isGM && characterStore.myCharacters.length"
              class="px-3 pt-2 pb-1 text-xs text-stone-500 uppercase tracking-wider font-display"
            >
              Your Characters
            </div>
            <button
              v-for="char in characterStore.myCharacters"
              :key="char.id"
              class="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-stone-700 transition-colors text-left group"
              @click="selectChar(char.id)"
            >
              <i
                class="fa-solid fa-check text-parchment-400 text-xs w-3 shrink-0"
                :class="char.id === characterStore.activeId ? 'opacity-100' : 'opacity-0'"
              />
              <span class="flex-1 text-xs text-stone-200 truncate">{{ char.data?.name ?? 'Unnamed' }}</span>
              <button
                class="opacity-0 group-hover:opacity-100 text-stone-600 hover:text-red-400 transition-colors shrink-0"
                title="Delete character"
                @click.stop="confirmDelete(char)"
              >
                <i class="fa-solid fa-trash text-xs" />
              </button>
            </button>

            <template v-if="sessionStore.isGM && characterStore.otherCharacters.length">
              <div class="px-3 pt-2 pb-1 text-xs text-stone-500 uppercase tracking-wider font-display border-t border-stone-700 mt-1">
                Players' Characters
              </div>
              <button
                v-for="char in characterStore.otherCharacters"
                :key="char.id"
                class="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-stone-700 transition-colors text-left"
                @click="selectChar(char.id)"
              >
                <i
                  class="fa-solid fa-check text-parchment-400 text-xs w-3 shrink-0"
                  :class="char.id === characterStore.activeId ? 'opacity-100' : 'opacity-0'"
                />
                <i class="fa-solid fa-user text-stone-500 text-xs shrink-0" />
                <span class="flex-1 text-xs text-stone-300 truncate">{{ char.data?.name ?? 'Unnamed' }}</span>
              </button>
            </template>

            <template v-if="!sessionStore.isGM">
              <div v-if="!characterStore.myCharacters.length" class="px-3 py-3 text-xs text-stone-500 italic">
                No characters yet
              </div>
            </template>

            <div
              v-if="sessionStore.isGM && !characterStore.characters.length"
              class="px-3 py-3 text-xs text-stone-500 italic"
            >
              No trashbags in this campaign yet
            </div>
          </template>

          <div class="border-t border-stone-700" />

          <button
            class="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-stone-700 transition-colors text-xs text-stone-400 hover:text-stone-200"
            @click="importMode = true"
          >
            <i class="fa-solid fa-file-import text-xs" />
            Import trashbag
          </button>
        </template>

        <template v-else>
          <div class="p-3">
            <div class="flex items-center gap-2 mb-2.5">
              <button
                class="text-stone-500 hover:text-stone-300 transition-colors"
                @click="importMode = false; importError = ''"
              >
                <i class="fa-solid fa-arrow-left text-xs" />
              </button>
              <span class="text-xs text-stone-400 font-display">Import trashbag</span>
            </div>

            <textarea
              v-model="pasteText"
              rows="6"
              placeholder="Paste trashbag JSON here"
              class="w-full text-xs bg-stone-950/40 border border-stone-600 rounded p-2 resize-none focus:outline-none focus:border-parchment-500 font-mono text-stone-300 placeholder-stone-500"
            />

            <p v-if="importError" class="text-red-400 text-xs mt-1.5">{{ importError }}</p>

            <div class="flex gap-2 mt-2">
              <button
                class="flex-1 py-1.5 rounded text-xs bg-stone-600 hover:bg-stone-500 transition-colors text-stone-200"
                @click="handlePaste"
              >
                Import JSON
              </button>
              <label class="flex-1 py-1.5 rounded text-xs bg-stone-600 hover:bg-stone-500 transition-colors text-center cursor-pointer text-stone-200">
                Upload file
                <input type="file" accept=".json,application/json" class="hidden" @change="handleFile" />
              </label>
            </div>
          </div>
        </template>

      </div>
    </Transition>
  </div>
</template>

<script setup>
import { ref, watch, nextTick, onUnmounted } from 'vue'
import { useCharacterStore } from '@/stores/characterStore.js'
import { useSessionStore } from '@/stores/sessionStore.js'

const characterStore = useCharacterStore()
const sessionStore = useSessionStore()

const open = ref(false)
const importMode = ref(false)
const pasteText = ref('')
const importError = ref('')
const wrapperEl = ref(null)

function onOutsideClick(e) {
  if (!wrapperEl.value?.contains(e.target)) open.value = false
}
watch(open, (val) => {
  if (val) nextTick(() => document.addEventListener('click', onOutsideClick))
  else document.removeEventListener('click', onOutsideClick)
})
onUnmounted(() => document.removeEventListener('click', onOutsideClick))

function selectChar(id) {
  characterStore.setActive(id)
  open.value = false
}

async function confirmDelete(char) {
  if (!confirm(`Delete "${char.data?.name ?? 'this character'}"? This cannot be undone.`)) return
  await characterStore.deleteCharacter(char.id)
}

function parseJson(text) {
  try { return { data: JSON.parse(text), error: null } }
  catch (e) { return { data: null, error: e.message } }
}

async function handlePaste() {
  importError.value = ''
  const { data, error } = parseJson(pasteText.value.trim())
  if (error) { importError.value = `Invalid JSON: ${error}`; return }
  const result = await characterStore.importCharacter(data)
  if (result) { pasteText.value = ''; importMode.value = false; open.value = false }
}

async function handleFile(event) {
  importError.value = ''
  const file = event.target.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = async (e) => {
    const { data, error } = parseJson(e.target.result)
    if (error) { importError.value = `Invalid JSON: ${error}`; return }
    const result = await characterStore.importCharacter(data)
    if (result) { importMode.value = false; open.value = false }
  }
  reader.readAsText(file)
  event.target.value = ''
}
</script>
