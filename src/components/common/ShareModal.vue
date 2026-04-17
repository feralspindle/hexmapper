<template>
  <div class="relative">
    <button
      class="flex items-center gap-1.5 text-sm px-2 py-1 rounded transition-colors text-parchment-400 hover:text-parchment-200 hover:bg-stone-800"
      @click="copyLink"
    >
      <i :class="copied ? 'fa-solid fa-check' : 'fa-solid fa-link'" class="mr-1" />
      {{ copied ? 'Copied Session ID!' : 'Share Session ID' }}
    </button>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRoute } from 'vue-router'

const props = defineProps({ sessionId: String })
const copied = ref(false)

function copyLink() {
  const sessionId = `${props.sessionId}`
  navigator.clipboard.writeText(sessionId).then(() => {
    copied.value = true
    setTimeout(() => (copied.value = false), 2000)
  })
}
</script>
