<template>
  <div class="relative" ref="wrapperEl">
    <button
      class="flex items-center gap-1.5 text-sm px-2 py-1 rounded transition-colors max-w-40"
      :class="open
        ? 'text-stone-900 bg-parchment-400'
        : 'text-parchment-400 hover:text-parchment-200 hover:bg-stone-800'"
      @click="open = !open"
    >
      <i class="fa-solid fa-map text-sm shrink-0" />
      <i class="fa-solid fa-chevron-down text-sm shrink-0 transition-transform" :class="open ? 'rotate-180' : ''" />
      <span class="truncate">{{ mapStore.activeMap?.name ?? 'Maps' }}</span>
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
        <div v-if="mapStore.loading" class="px-3 py-3 text-sm text-stone-500">Loading…</div>

        <template v-else>
          <template v-for="map in rootMaps" :key="map.id">
            <MapPickerRow
              :map="map"
              :renaming-id="renamingId"
              :rename-draft="renameDraft"
              :can-delete="mapStore.maps.length > 1"
              :indent="0"
              @select="selectMap(map.id)"
              @start-rename="startRename(map)"
              @commit-rename="commitRename(map.id)"
              @cancel-rename="renamingId = null"
              @update-draft="renameDraft = $event"
              @delete="confirmDelete(map)"
            />
            <template v-for="child in childrenOf(map.id)" :key="child.id">
              <MapPickerRow
                :map="child"
                :renaming-id="renamingId"
                :rename-draft="renameDraft"
                :can-delete="mapStore.maps.length > 1"
                :indent="1"
                @select="selectMap(child.id)"
                @start-rename="startRename(child)"
                @commit-rename="commitRename(child.id)"
                @cancel-rename="renamingId = null"
                @update-draft="renameDraft = $event"
                @delete="confirmDelete(child)"
              />
              <template v-for="grandchild in childrenOf(child.id)" :key="grandchild.id">
                <MapPickerRow
                  :map="grandchild"
                  :renaming-id="renamingId"
                  :rename-draft="renameDraft"
                  :can-delete="mapStore.maps.length > 1"
                  :indent="2"
                  @select="selectMap(grandchild.id)"
                  @start-rename="startRename(grandchild)"
                  @commit-rename="commitRename(grandchild.id)"
                  @cancel-rename="renamingId = null"
                  @update-draft="renameDraft = $event"
                  @delete="confirmDelete(grandchild)"
                />
              </template>
            </template>
          </template>

          <div class="border-t border-stone-700" />

          <button
            class="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-stone-700 transition-colors text-sm text-stone-400 hover:text-stone-200"
            @click="openNewMapModal"
          >
            <i class="fa-solid fa-plus text-sm" />
            New map
          </button>
        </template>
      </div>
    </Transition>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick, onUnmounted } from 'vue'
import { useMapStore } from '@/stores/mapStore.js'
import { useSessionStore } from '@/stores/sessionStore.js'
import { useConfirmDialog } from '@/composables/useConfirmDialog.js'
import MapPickerRow from './MapPickerRow.vue'

const mapStore     = useMapStore()
const sessionStore = useSessionStore()
const { confirm }  = useConfirmDialog()

const rootMaps = computed(() => mapStore.maps.filter(m => !m.parent_map_id))

function childrenOf(parentId) {
  return mapStore.maps.filter(m => m.parent_map_id === parentId)
}

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

async function selectMap(id) {
  await mapStore.setActiveMap(id)
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

function confirmDelete(map) {
  confirm(
    `Delete "${map.name}"? All hex data on this map will be permanently erased.`,
    async () => {
      const remaining = mapStore.maps.filter(m => m.id !== map.id)
      if (map.id === sessionStore.activeMapId && remaining.length) {
        await mapStore.setActiveMap(remaining[0].id)
      }
      await mapStore.deleteMap(map.id)
    },
  )
}
</script>
