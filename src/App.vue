<template>
  <RouterView />
  <RealtimeStatusBanner />
</template>

<script setup>
import { RouterView } from 'vue-router'
import { useAuthStore } from '@/stores/authStore.js'
import RealtimeStatusBanner from '@/components/common/RealtimeStatusBanner.vue'

const authStore = useAuthStore()
authStore.init()
</script>
