<template>
  <div class="relative">
    <button
      class="ds-tb-btn"
      :title="copied ? 'Copied!' : 'Copy session link'"
      @click="copyLink"
    >
      <i :class="copied ? 'fa-solid fa-check' : 'fa-solid fa-link'" style="font-size:14px" />
      <span>{{ copied ? 'Copied!' : 'Share' }}</span>
    </button>
  </div>
</template>

<script setup>
import { ref } from 'vue'

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
