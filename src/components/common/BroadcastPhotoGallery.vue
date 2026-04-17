<template>
  <div class="flex flex-col h-full overflow-hidden">

    <div class="flex-1 overflow-y-auto p-2">
      <div v-if="photoStore.loading" class="flex items-center justify-center h-24 text-stone-500 text-sm">
        Loading…
      </div>

      <div
        v-else-if="!photoStore.broadcastHistory.length"
        class="flex flex-col items-center justify-center h-full gap-2 text-stone-600 px-4 text-center"
      >
        <i class="fa-solid fa-eye-slash text-2xl" />
        <span class="text-sm">Nothing revealed yet</span>
      </div>

      <div v-else class="grid grid-cols-2 gap-2">
        <button
          v-for="photo in photoStore.broadcastHistory"
          :key="photo.id"
          class="group relative rounded overflow-hidden bg-stone-800 text-left"
          @click="enlarged = photo"
        >
          <img
            :src="photo.photo_url"
            :alt="photo.photo_name"
            class="w-full h-24 object-cover block transition-opacity group-hover:opacity-80"
          />
          <div class="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent px-1.5 pt-4 pb-1">
            <span class="text-sm text-stone-300 truncate block">{{ photo.photo_name }}</span>
          </div>
        </button>
      </div>
    </div>

    <!-- Lightbox -->
    <Teleport to="body">
      <div
        v-if="enlarged"
        class="fixed inset-0 z-[200] flex items-center justify-center"
        @click.self="enlarged = null"
      >
        <div class="absolute inset-0 bg-black/80 backdrop-blur-sm" @click="enlarged = null" />
        <div class="relative mx-4 flex flex-col bg-stone-900 border border-stone-600 rounded-xl shadow-2xl overflow-hidden max-w-2xl w-full">
          <div class="flex items-center justify-between px-4 py-3 shrink-0 border-b border-stone-700">
            <span class="text-sm font-display text-parchment-200 truncate">{{ enlarged.photo_name }}</span>
            <button
              class="ml-3 shrink-0 w-7 h-7 flex items-center justify-center text-stone-400 hover:text-stone-100 hover:bg-stone-700 rounded transition-colors"
              @click="enlarged = null"
            ><i class="fa-solid fa-xmark" /></button>
          </div>
          <img
            :src="enlarged.photo_url"
            :alt="enlarged.photo_name"
            class="block w-full object-contain max-h-[75vh]"
          />
        </div>
      </div>
    </Teleport>

  </div>
</template>

<script setup>
import { ref } from 'vue'
import { usePhotoStore } from '@/stores/photoStore.js'

const photoStore = usePhotoStore()
const enlarged   = ref(null)
</script>
