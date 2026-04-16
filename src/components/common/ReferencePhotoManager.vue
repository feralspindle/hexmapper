<template>
  <div class="flex flex-col h-full overflow-hidden">

    <!-- Upload -->
    <div class="shrink-0 p-3 border-b border-stone-700 flex flex-col gap-2">
      <label
        class="block w-full py-2 px-3 rounded text-xs text-center transition-colors cursor-pointer"
        :class="photoStore.uploading
          ? 'bg-stone-700 text-stone-500 pointer-events-none'
          : 'bg-stone-700 hover:bg-stone-600 text-stone-200'"
      >
        <i class="fa-solid fa-upload mr-1.5" />{{ photoStore.uploading ? 'Uploading…' : 'Upload Photo' }}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          class="hidden"
          :disabled="photoStore.uploading"
          @change="handleUpload"
        />
      </label>
      <p v-if="uploadError" class="text-xs text-red-400">{{ uploadError }}</p>
    </div>

    <!-- Name input shown after file is picked -->
    <div v-if="pendingFile" class="shrink-0 p-3 border-b border-stone-700 flex flex-col gap-2 bg-stone-800">
      <div class="text-xs text-stone-400">Photo name</div>
      <input
        v-model="pendingName"
        type="text"
        class="w-full bg-stone-700 border border-stone-600 rounded px-2 py-1.5 text-xs text-stone-100 focus:outline-none focus:border-parchment-400"
        placeholder="e.g. Ancient Ring, Throne Room…"
        @keyup.enter="confirmUpload"
      />
      <div class="flex gap-2">
        <button
          class="flex-1 py-1.5 rounded text-xs bg-parchment-500 hover:bg-parchment-400 text-stone-900 font-semibold transition-colors disabled:opacity-50"
          :disabled="photoStore.uploading"
          @click="confirmUpload"
        >
          <i v-if="photoStore.uploading" class="fa-solid fa-spinner fa-spin mr-1" />
          {{ photoStore.uploading ? 'Uploading…' : 'Upload' }}
        </button>
        <button
          class="flex-1 py-1.5 rounded text-xs bg-stone-700 hover:bg-stone-600 text-stone-300 transition-colors"
          @click="cancelUpload"
        >Cancel</button>
      </div>
    </div>

    <!-- Photo grid -->
    <div class="flex-1 overflow-y-auto p-2">
      <div v-if="photoStore.loading" class="flex items-center justify-center h-24 text-stone-500 text-xs">
        Loading…
      </div>

      <div
        v-else-if="!photoStore.photos.length"
        class="flex flex-col items-center justify-center h-24 gap-2 text-stone-600"
      >
        <i class="fa-solid fa-images text-2xl" />
        <span class="text-xs">No photos yet</span>
      </div>

      <div v-else class="grid grid-cols-2 gap-2">
        <div
          v-for="photo in photoStore.photos"
          :key="photo.id"
          class="group relative rounded overflow-hidden bg-stone-800"
        >
          <img
            :src="photo.url"
            :alt="photo.name"
            class="w-full h-24 object-cover block"
          />

          <!-- Hover overlay -->
          <div class="absolute inset-0 flex flex-col items-center justify-center gap-1.5
                      bg-black/0 opacity-0 group-hover:bg-black/60 group-hover:opacity-100
                      transition-all">
            <button
              class="px-2.5 py-1 rounded bg-parchment-500 hover:bg-parchment-400 text-stone-900 text-xs font-semibold transition-colors"
              @click="broadcast(photo)"
            >
              <i class="fa-solid fa-tower-broadcast mr-1" />Broadcast
            </button>
            <button
              class="text-stone-400 hover:text-red-400 text-xs transition-colors"
              @click="remove(photo)"
            >
              <i class="fa-solid fa-trash mr-1" />Delete
            </button>
          </div>

          <!-- Name label -->
          <div class="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent px-1.5 pt-4 pb-1">
            <span class="text-xs text-stone-300 truncate block">{{ photo.name }}</span>
          </div>
        </div>
      </div>
    </div>

  </div>
</template>

<script setup>
import { ref } from 'vue'
import { usePhotoStore } from '@/stores/photoStore.js'

const photoStore  = usePhotoStore()
const uploadError = ref('')
const pendingFile = ref(null)
const pendingName = ref('')

function handleUpload(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  uploadError.value = ''
  pendingFile.value = file
  pendingName.value = file.name.replace(/\.[^.]+$/, '')
}

async function confirmUpload() {
  if (!pendingFile.value || photoStore.uploading) return
  uploadError.value = ''
  try {
    await photoStore.uploadPhoto(pendingFile.value, pendingName.value)
    pendingFile.value = null
    pendingName.value = ''
  } catch (e) {
    uploadError.value = e.message
  }
}

function cancelUpload() {
  pendingFile.value = null
  pendingName.value = ''
  uploadError.value = ''
}

async function broadcast(photo) {
  if (!confirm(`Reveal "${photo.name}" to all players?`)) return
  await photoStore.broadcastPhoto(photo)
}

async function remove(photo) {
  if (!confirm(`Delete "${photo.name}"? This cannot be undone.`)) return
  await photoStore.deletePhoto(photo)
}
</script>
