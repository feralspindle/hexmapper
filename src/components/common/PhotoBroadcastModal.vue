<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-[200] flex items-center justify-center">
      <div class="absolute inset-0 bg-black/80 backdrop-blur-sm" @click="photoStore.dismissBroadcast()" />

      <div class="relative mx-4 flex flex-col bg-stone-900 border border-stone-600 rounded-xl shadow-2xl overflow-hidden max-w-2xl w-full">
        <div class="flex items-center justify-between px-4 py-3 shrink-0 border-b border-stone-700">
          <span class="text-sm font-display text-parchment-200 truncate">{{ photoStore.currentBroadcast.photo_name }}</span>
          <button
            class="ml-3 shrink-0 w-7 h-7 flex items-center justify-center text-stone-400 hover:text-stone-100 hover:bg-stone-700 rounded transition-colors"
            title="Close"
            @click="photoStore.dismissBroadcast()"
          ><i class="fa-solid fa-xmark" /></button>
        </div>

        <img
          :src="photoStore.currentBroadcast.photo_url"
          :alt="photoStore.currentBroadcast.photo_name"
          class="block w-full object-contain max-h-[75vh]"
        />
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { usePhotoStore } from '@/stores/photoStore.js'
const photoStore = usePhotoStore()
</script>
