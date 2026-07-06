<template>
  <!-- Views capture route params once on mount, so a param-only navigation
       (e.g. dungeon A -> dungeon B) must remount rather than reuse the component. -->
  <RouterView :key="$route.path" />
  <RealtimeStatusBanner />
</template>

<script setup>
import { RouterView } from 'vue-router'
import { useAuthStore } from '@/stores/authStore.js'
import RealtimeStatusBanner from '@/components/common/RealtimeStatusBanner.vue'

const authStore = useAuthStore()
authStore.init()
</script>
