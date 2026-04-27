<template>
  <div class="relative" ref="wrapperEl" style="align-self:stretch;display:flex;align-items:center">
    <button
      class="ds-tb-btn"
      :class="{ active: open }"
      style="max-width:160px"
      @click="open = !open"
    >
      <i class="fa-solid fa-chevron-down shrink-0 transition-transform" style="font-size:11px" :class="open ? 'rotate-180' : ''" />
      <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px">{{ characterStore.character?.name ?? 'Characters' }}</span>
    </button>

    <Transition
      enter-active-class="transition-all duration-150 ease-out"
      enter-from-class="opacity-0 -translate-y-1"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition-all duration-100 ease-in"
      leave-from-class="opacity-100 translate-y-0"
      leave-to-class="opacity-0 -translate-y-1"
    >
      <div v-if="open" class="cp-menu" @click.stop>

        <template v-if="!importMode">
          <div v-if="characterStore.loading" class="cp-empty">Loading…</div>

          <template v-else>
            <div v-if="sessionStore.isGM && characterStore.myCharacters.length" class="cp-section-head">
              Your Characters
            </div>
            <button
              v-for="char in characterStore.myCharacters"
              :key="char.id"
              class="cp-row cp-row-group"
              @click="selectChar(char.id)"
            >
              <i class="fa-solid fa-check cp-check" :style="char.id === characterStore.activeId ? 'opacity:1' : 'opacity:0'" />
              <span class="cp-name">{{ char.data?.name ?? 'Unnamed' }}</span>
              <button class="cp-del" title="Delete character" @click.stop="confirmDelete(char)">
                <i class="fa-solid fa-trash" />
              </button>
            </button>

            <template v-if="sessionStore.isGM && characterStore.otherCharacters.length">
              <div class="cp-section-head cp-section-head--ruled">Players' Characters</div>
              <button
                v-for="char in characterStore.otherCharacters"
                :key="char.id"
                class="cp-row"
                @click="selectChar(char.id)"
              >
                <i class="fa-solid fa-check cp-check" :style="char.id === characterStore.activeId ? 'opacity:1' : 'opacity:0'" />
                <i class="fa-solid fa-user cp-other-icon" />
                <span class="cp-name">{{ char.data?.name ?? 'Unnamed' }}</span>
              </button>
            </template>

            <div v-if="!sessionStore.isGM && !characterStore.myCharacters.length" class="cp-empty">
              No characters yet
            </div>
            <div v-if="sessionStore.isGM && !characterStore.characters.length" class="cp-empty">
              No trashbags in this campaign yet
            </div>
          </template>

          <div class="cp-divider" />

          <button class="cp-row cp-row--muted" @click="newCharOpen = true; open = false">
            <i class="fa-solid fa-user-plus" />
            New trashbag
          </button>
          <button class="cp-row cp-row--muted" @click="importMode = true">
            <i class="fa-solid fa-file-import" />
            Import trashbag
          </button>
        </template>

        <template v-else>
          <div class="cp-import">
            <div class="cp-import-head">
              <button class="cp-back" @click="importMode = false; importError = ''">
                <i class="fa-solid fa-arrow-left" />
              </button>
              <span class="cp-import-title">Import trashbag</span>
            </div>
            <textarea v-model="pasteText" rows="6" placeholder="Paste trashbag JSON here" class="cp-textarea" />
            <p v-if="importError" class="cp-error">{{ importError }}</p>
            <div class="cp-import-btns">
              <button class="ds-btn tiny" style="flex:1" @click="handlePaste">Import JSON</button>
              <label class="ds-btn tiny" style="flex:1;text-align:center;cursor:pointer">
                Upload file
                <input type="file" accept=".json,application/json" style="display:none" @change="handleFile" />
              </label>
            </div>
          </div>
        </template>

      </div>
    </Transition>
  </div>

  <NewCharacterModal v-if="newCharOpen" @close="newCharOpen = false" />
</template>

<script setup>
import { ref, watch, nextTick, onUnmounted } from 'vue'
import { useCharacterStore } from '@/stores/characterStore.js'
import { useSessionStore } from '@/stores/sessionStore.js'
import { useConfirmDialog } from '@/composables/useConfirmDialog.js'
import { activeNavDropdown } from '@/composables/useNavDropdown.js'
import NewCharacterModal from './NewCharacterModal.vue'

const characterStore = useCharacterStore()
const sessionStore = useSessionStore()
const { confirm } = useConfirmDialog()

const open = ref(false)
const importMode = ref(false)
const newCharOpen = ref(false)
const pasteText = ref('')
const importError = ref('')
const wrapperEl = ref(null)

function onOutsideClick(e) {
  if (!wrapperEl.value?.contains(e.target)) open.value = false
}
watch(open, (val) => {
  if (val) {
    activeNavDropdown.value = 'char-picker'
    nextTick(() => document.addEventListener('click', onOutsideClick))
  } else {
    if (activeNavDropdown.value === 'char-picker') activeNavDropdown.value = null
    document.removeEventListener('click', onOutsideClick)
  }
})
watch(activeNavDropdown, (val) => {
  if (val !== null && val !== 'char-picker') open.value = false
})
onUnmounted(() => document.removeEventListener('click', onOutsideClick))

function selectChar(id) {
  characterStore.setActive(id)
  open.value = false
}

function confirmDelete(char) {
  confirm(
    `Delete "${char.data?.name ?? 'this character'}"? This cannot be undone.`,
    () => characterStore.deleteCharacter(char.id),
  )
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

<style scoped>
.cp-menu {
  position: absolute;
  top: 100%; right: 0;
  margin-top: 0;
  width: 224px;
  z-index: 50;
  background: var(--paper, #ede1c7);
  border: 1px solid var(--rule-strong, rgba(26,20,16,.42));
  box-shadow: 0 8px 24px rgba(0,0,0,.28), 0 2px 6px rgba(0,0,0,.14);
  font-family: var(--font-body, "Cormorant Garamond", Georgia, serif);
  overflow: hidden;
}
.cp-section-head {
  padding: 6px 12px 4px;
  font-family: var(--font-zine, "Special Elite", monospace);
  font-size: 9px;
  letter-spacing: .1em;
  text-transform: uppercase;
  color: var(--ink-mute, #8a7a68);
}
.cp-section-head--ruled {
  border-top: 1px solid var(--rule, rgba(26,20,16,.18));
  margin-top: 2px;
  padding-top: 8px;
}
.cp-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 12px;
  width: 100%;
  text-align: left;
  background: transparent;
  border: none;
  font-family: var(--font-body, "Cormorant Garamond", Georgia, serif);
  font-size: 13px;
  color: var(--ink, #1a1410);
  cursor: default;
  transition: background .1s;
}
.cp-row:hover { background: var(--paper-2, #e3d4b3); }
.cp-row--muted { color: var(--ink-mute, #8a7a68); font-size: 12px; }
.cp-row--muted:hover { color: var(--ink, #1a1410); }
.cp-check { font-size: 11px; width: 12px; flex-shrink: 0; color: var(--accent, #8a1c1c); transition: opacity .1s; }
.cp-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cp-other-icon { font-size: 11px; color: var(--ink-mute, #8a7a68); flex-shrink: 0; }
.cp-del {
  opacity: 0;
  background: transparent;
  border: none;
  color: var(--ink-mute, #8a7a68);
  font-size: 11px;
  cursor: default;
  padding: 2px 4px;
  transition: color .1s, opacity .1s;
  flex-shrink: 0;
}
.cp-row-group:hover .cp-del { opacity: 1; }
.cp-del:hover { color: var(--accent, #8a1c1c); }
.cp-divider { border-top: 1px solid var(--rule, rgba(26,20,16,.18)); margin: 2px 0; }
.cp-empty {
  padding: 10px 12px;
  font-style: italic;
  font-size: 12px;
  color: var(--ink-mute, #8a7a68);
}
.cp-import { padding: 10px 12px; display: flex; flex-direction: column; gap: 8px; }
.cp-import-head { display: flex; align-items: center; gap: 8px; }
.cp-back {
  background: transparent;
  border: none;
  color: var(--ink-mute, #8a7a68);
  cursor: default;
  font-size: 12px;
  padding: 2px;
  transition: color .1s;
}
.cp-back:hover { color: var(--ink, #1a1410); }
.cp-import-title {
  font-family: var(--font-zine, "Special Elite", monospace);
  font-size: 10px;
  letter-spacing: .08em;
  text-transform: uppercase;
  color: var(--ink-mute, #8a7a68);
}
.cp-textarea {
  width: 100%;
  background: var(--paper-2, #e3d4b3);
  border: 1px solid var(--rule-strong, rgba(26,20,16,.42));
  padding: 6px 8px;
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  color: var(--ink, #1a1410);
  resize: none;
  outline: none;
  transition: border-color .15s;
}
.cp-textarea:focus { border-color: var(--accent, #8a1c1c); }
.cp-textarea::placeholder { color: var(--ink-mute, #8a7a68); }
.cp-error { font-size: 11px; color: var(--accent, #8a1c1c); margin: 0; }
.cp-import-btns { display: flex; gap: 6px; }
</style>
