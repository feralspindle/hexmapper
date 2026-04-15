<template>
  <div class="bg-stone-900/90 border border-stone-700 rounded-lg p-3 text-xs font-body">
    <p class="text-stone-400 mb-2 font-display text-xs uppercase tracking-wider">Terrain</p>
    <div class="grid grid-cols-2 gap-x-4 gap-y-1">
      <div v-for="t in TERRAIN_TYPES" :key="t.id" class="flex items-center gap-1.5">
        <span class="w-3 h-3 rounded-full shrink-0" :style="{ backgroundColor: t.color }" />
        <span class="text-stone-200 text-sm">{{ t.label }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { TERRAIN_TYPES } from '@/stores/hexStore.js'
</script>
