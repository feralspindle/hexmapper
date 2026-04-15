<template>
  <div class="relative" ref="wrapperEl">
    <button
      class="flex items-center gap-1.5 text-xs px-2 py-1 rounded transition-colors max-w-40"
      :class="open
        ? 'text-stone-900 bg-parchment-400'
        : 'text-parchment-400 hover:text-parchment-200 hover:bg-stone-800'"
      @click="open = !open"
    >
      <i class="fa-solid fa-map text-xs shrink-0" />
      <i class="fa-solid fa-chevron-down text-xs shrink-0 transition-transform" :class="open ? 'rotate-180' : ''" />
      <span class="truncate">{{ mapStore.gmMap?.name ?? 'Maps' }}</span>
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
        class="absolute top-full right-0 mt-1.5 w-60 bg-stone-800 border border-stone-600 rounded-lg shadow-2xl z-50 overflow-hidden"
        @click.stop
      >
        <div v-if="mapStore.loading" class="px-3 py-3 text-xs text-stone-500">Loading…</div>

        <template v-else>
          <button
            v-for="map in mapStore.maps"
            :key="map.id"
            class="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-stone-700 transition-colors text-left group"
            @click="selectMap(map.id)"
          >
            <span
              :title="map.id === sessionStore.activeMapId ? 'Live — players see this map' : ''"
              :class="[
                'w-2 h-2 rounded-full shrink-0 transition-colors',
                map.id === sessionStore.activeMapId ? 'bg-green-400' : 'bg-stone-600',
              ]"
            />

            <input
              v-if="renamingId === map.id"
              ref="renameInputEl"
              v-model="renameDraft"
              class="flex-1 bg-stone-600 border border-parchment-500 rounded px-1.5 py-0.5 text-xs text-stone-100 focus:outline-none"
              @keydown.enter="commitRename(map.id)"
              @keydown.escape="renamingId = null"
              @blur="commitRename(map.id)"
              @click.stop
            />
            <span v-else class="flex-1 text-xs text-stone-200 truncate">{{ map.name }}</span>

            <span
              v-if="map.id === mapStore.gmMapId && map.id !== sessionStore.activeMapId"
              class="text-[9px] px-1 py-0.5 rounded bg-parchment-700/40 text-parchment-400 font-display uppercase tracking-wide shrink-0"
            >editing</span>

            <button
              v-if="renamingId !== map.id"
              class="opacity-0 group-hover:opacity-100 w-4 h-4 flex items-center justify-center text-stone-500 hover:text-stone-200 transition-colors shrink-0"
              title="Rename"
              @click.stop="startRename(map)"
            >
              <i class="fa-solid fa-pencil text-[9px]" />
            </button>

            <button
              v-if="mapStore.maps.length > 1 && renamingId !== map.id"
              class="opacity-0 group-hover:opacity-100 w-4 h-4 flex items-center justify-center text-stone-500 hover:text-red-400 transition-colors shrink-0"
              title="Delete map"
              @click.stop="confirmDelete(map)"
            >
              <i class="fa-solid fa-trash text-[9px]" />
            </button>
          </button>

          <div class="border-t border-stone-700" />

          <button
            class="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-stone-700 transition-colors text-xs text-stone-400 hover:text-stone-200"
            @click="openNewMapModal"
          >
            <i class="fa-solid fa-plus text-xs" />
            New map
          </button>
        </template>
      </div>
    </Transition>
  </div>
</template>

<script setup>
import { ref, watch, nextTick, onUnmounted } from 'vue'
import { useMapStore } from '@/stores/mapStore.js'
import { useSessionStore } from '@/stores/sessionStore.js'

const mapStore     = useMapStore()
const sessionStore = useSessionStore()

const open          = ref(false)
const renamingId    = ref(null)
const renameDraft   = ref('')
const renameInputEl = ref(null)
const wrapperEl     = ref(null)

function onOutsideClick(e) {
  if (!wrapperEl.value?.contains(e.target)) open.value = false
}
watch(open, (val) => {
  if (val) nextTick(() => document.addEventListener('click', onOutsideClick))
  else document.removeEventListener('click', onOutsideClick)
})
onUnmounted(() => document.removeEventListener('click', onOutsideClick))

function selectMap(id) {
  mapStore.selectGmMap(id)
  open.value = false
}

function startRename(map) {
  renamingId.value  = map.id
  renameDraft.value = map.name
  nextTick(() => renameInputEl.value?.focus())
}

async function commitRename(mapId) {
  if (renamingId.value !== mapId) return
  const name = renameDraft.value.trim() || 'Untitled Map'
  renamingId.value = null
  await mapStore.renameMap(mapId, name)
}

function openNewMapModal() {
  open.value = false
  mapStore.newMapModalOpen = true
}

async function confirmDelete(map) {
  if (!confirm(`Delete "${map.name}"? All hex data on this map will be permanently erased.`)) return
  const remaining = mapStore.maps.filter(m => m.id !== map.id)
  if (map.id === sessionStore.activeMapId && remaining.length) {
    await mapStore.setActiveMap(remaining[0].id)
  } else if (map.id === mapStore.gmMapId && remaining.length) {
    mapStore.selectGmMap(remaining[0].id)
  }
  await mapStore.deleteMap(map.id)
}
</script>
