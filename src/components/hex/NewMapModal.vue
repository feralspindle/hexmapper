<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-[100] flex items-center justify-center">
      <div
        class="absolute inset-0 bg-black/60 backdrop-blur-sm"
        @click="!isFirst && close()"
      />

      <div class="relative w-full max-w-sm mx-4 bg-stone-900 border border-stone-600 rounded-xl shadow-2xl p-6 flex flex-col gap-5">

        <div class="text-sm font-display text-parchment-200 uppercase tracking-wider">
          {{ isFirst ? 'Create Your First Map' : 'New Map' }}
        </div>

        <div class="flex flex-col gap-1.5">
          <label class="text-sm text-stone-400">Map name</label>
          <input
            ref="nameInputEl"
            v-model="name"
            type="text"
            placeholder="e.g. World Map, Dungeon Level 1…"
            class="bg-stone-800 border border-stone-600 rounded px-3 py-2 text-sm text-stone-100 focus:outline-none focus:border-parchment-400 placeholder-stone-600"
            @keydown.enter="submit"
          />
        </div>

        <div class="flex flex-col gap-1.5">
          <label class="text-sm text-stone-400">Map type</label>
          <div class="flex gap-2">
            <button
              :class="[
                'flex-1 py-2 text-sm rounded transition-colors flex items-center justify-center gap-1.5',
                mapType === 'hex'
                  ? 'bg-parchment-500 text-stone-900 font-semibold'
                  : 'bg-stone-700 text-stone-400 hover:text-stone-200',
              ]"
              @click="mapType = 'hex'"
            >
              <i class="fa-solid fa-border-all" />Standard Grid
            </button>
            <button
              :class="[
                'flex-1 py-2 text-sm rounded transition-colors flex items-center justify-center gap-1.5',
                mapType === 'image'
                  ? 'bg-parchment-500 text-stone-900 font-semibold'
                  : 'bg-stone-700 text-stone-400 hover:text-stone-200',
              ]"
              @click="mapType = 'image'"
            >
              <i class="fa-solid fa-image" />Custom Image
            </button>
          </div>
          <p class="text-sm text-stone-600">
            {{ mapType === 'image'
              ? 'Upload a custom map image and overlay a hex grid on top.'
              : 'A blank hex grid with terrain painting and fog of war.' }}
          </p>
        </div>

        <label
          class="flex items-center gap-3 cursor-pointer"
          :class="isFirst ? 'opacity-50 pointer-events-none' : ''"
        >
          <div
            :class="[
              'w-8 h-5 rounded-full relative transition-colors shrink-0',
              (setActive || isFirst) ? 'bg-parchment-500' : 'bg-stone-700',
            ]"
          >
            <div
              :class="[
                'absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform',
                (setActive || isFirst) ? 'translate-x-3.5' : 'translate-x-0.5',
              ]"
            />
          </div>
          <span class="text-sm text-stone-300">
            {{ isFirst || isOnly ? 'Set as active map (required)' : 'Set as active map' }}
          </span>
          <input
            v-model="setActive"
            type="checkbox"
            class="hidden"
            :disabled="isFirst"
          />
        </label>

        <div class="flex gap-2 mt-1">
          <button
            v-if="!isFirst"
            class="flex-1 py-2 text-sm rounded bg-stone-700 hover:bg-stone-600 text-stone-300 transition-colors"
            @click="close"
          >
            Cancel
          </button>
          <button
            :disabled="!name.trim() || saving"
            class="flex-1 py-2 text-sm rounded font-semibold transition-colors disabled:opacity-40 disabled:cursor-default"
            :class="name.trim() && !saving
              ? 'bg-parchment-500 hover:bg-parchment-400 text-stone-900'
              : 'bg-stone-700 text-stone-500'"
            @click="submit"
          >
            <i v-if="saving" class="fa-solid fa-spinner fa-spin mr-1" />
            {{ saving ? 'Creating…' : 'Create Map' }}
          </button>
        </div>

      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed, nextTick, onMounted } from 'vue'
import { useMapStore } from '@/stores/mapStore.js'

const mapStore = useMapStore()

const name        = ref('World Map')
const mapType     = ref('hex')
const setActive   = ref(false)
const saving      = ref(false)
const nameInputEl = ref(null)

const isFirst = computed(() => mapStore.maps.length === 0)

onMounted(() => nextTick(() => nameInputEl.value?.select()))

function close() {
  mapStore.newMapModalOpen = false
}

async function submit() {
  const trimmed = name.value.trim()
  if (!trimmed || saving.value) return
  saving.value = true
  const shouldSetActive = setActive.value || isFirst.value
  try {
    const map = await mapStore.createMap({ name: trimmed, mapType: mapType.value })
    if (map) {
      if (shouldSetActive) {
        await mapStore.setActiveMap(map.id)
      } else {
        mapStore.selectGmMap(map.id)
      }
    }
    close()
  } finally {
    saving.value = false
  }
}
</script>
