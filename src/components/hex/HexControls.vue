<template>
  <div class="flex items-center gap-2 bg-stone-900/90 border border-stone-600 rounded-full px-4 py-2 backdrop-blur">
    <template v-if="!liveMode && !imageMode">
      <button
        v-for="terrain in TERRAIN_TYPES"
        :key="terrain.id"
        :title="terrain.label"
        :class="[
          'w-6 h-6 rounded-full border-2 transition-transform hover:scale-110',
          !fogMode && activeTerrain === terrain.id ? 'border-parchment-300 scale-110' : 'border-transparent',
        ]"
        :style="{ backgroundColor: terrain.color }"
        @click="selectTerrain(terrain.id)"
      />
      <button
        title="Clear hex"
        :class="[
          'w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs transition-transform hover:scale-110',
          !fogMode && activeTerrain === null ? 'border-parchment-300' : 'border-stone-500',
          'bg-stone-800 text-stone-400',
        ]"
        @click="selectTerrain(null)"
      >
        ✕
      </button>
    </template>

    <button
      v-for="m in MARKER_COLORS"
      :key="m.id"
      :title="`${m.label} marker`"
      :class="[
        'w-6 h-6 rounded-full border-2 transition-transform hover:scale-110',
        activeMarker === m.id ? 'border-parchment-300 scale-110 ring-1 ring-parchment-400/50' : 'border-transparent',
      ]"
      :style="{ backgroundColor: m.color }"
      @click="selectMarker(m.id)"
    />
    <button
      v-if="activeMarker"
      title="Exit marker mode"
      class="w-6 h-6 rounded-full border-2 border-stone-500 bg-stone-800 text-stone-400 flex items-center justify-center text-xs hover:border-stone-300 hover:text-stone-200 transition-all"
      @click="selectMarker(null)"
    >✕</button>


    <template v-if="isGM">
      <div class="w-px h-5 bg-stone-600 mx-1" />

      <button
        title="Fog brush — click hexes to reveal / hide"
        :class="[
          'w-7 h-7 rounded-full border-2 flex items-center justify-center text-xs transition-all',
          fogMode
            ? 'border-sky-400 bg-sky-900/60 text-sky-300 scale-110'
            : 'border-stone-500 bg-stone-800 text-stone-400 hover:border-stone-400 hover:text-stone-200',
        ]"
        @click="emit('update:fogMode', !fogMode)"
      >
        <i class="fa-solid fa-cloud text-xs" />
      </button>

      <button
        title="Reveal all hexes to players"
        class="w-7 h-7 rounded-full border-2 border-stone-500 bg-stone-800 flex items-center justify-center text-xs text-stone-400 hover:border-stone-400 hover:text-stone-200 transition-colors"
        @click="hexStore.revealAll()"
      >
        <i class="fa-solid fa-eye text-xs" />
      </button>


      <button
        title="Hide all hexes (full fog)"
        class="w-7 h-7 rounded-full border-2 border-stone-500 bg-stone-800 flex items-center justify-center text-xs text-stone-400 hover:border-stone-400 hover:text-stone-200 transition-colors"
        @click="hexStore.hideAll()"
      >
        <i class="fa-solid fa-eye-slash text-xs" />
      </button>
    </template>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useHexStore, TERRAIN_TYPES, MARKER_COLORS } from '@/stores/hexStore.js'

const props = defineProps({
  isGM:      { type: Boolean, default: false },
  fogMode:   { type: Boolean, default: false },
  liveMode:  { type: Boolean, default: false },
  imageMode: { type: Boolean, default: false },
})

const emit = defineEmits(['update:fogMode', 'update:markerColor'])

const hexStore = useHexStore()
const activeTerrain = ref('plains')
const activeMarker  = ref(null)

function selectTerrain(id) {
  if (props.fogMode) emit('update:fogMode', false)
  activeTerrain.value = id
  applyToSelected()
}

function selectMarker(id) {
  if (props.fogMode) emit('update:fogMode', false)
  activeMarker.value = id
  emit('update:markerColor', id)
}

function applyToSelected() {
  if (!hexStore.selectedHex) return
  const { q, r } = hexStore.selectedHex
  if (activeTerrain.value === null) {
    hexStore.deleteHex(q, r)
  } else {
    hexStore.upsertHex(q, r, { terrain_type: activeTerrain.value, color: null })
  }
}

defineExpose({ activeTerrain, applyToSelected, activeMarker })
</script>
