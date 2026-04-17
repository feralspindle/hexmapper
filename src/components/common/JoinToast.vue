<template>
  <div
    class="absolute left-1/2 -translate-x-1/2 z-20 flex flex-col-reverse gap-1.5 pointer-events-none select-none items-center"
    :class="bottomClass"
  >
    <TransitionGroup name="join-toast">
      <div
        v-for="toast in toasts"
        :key="toast.id"
        class="bg-stone-900/90 border border-stone-600 rounded-lg px-3 py-1.5 backdrop-blur flex items-center gap-2 text-sm max-w-xs pointer-events-auto"
      >
        <i class="fa-solid fa-shield-halved text-parchment-500 shrink-0 text-[10px]" />
        <span class="text-stone-200">Hail and well met, <span class="font-display text-parchment-300">{{ toast.display_name }}</span>!</span>
        <button
          class="ml-1 text-parchment-400 hover:text-parchment-200 transition-colors shrink-0 leading-none text-sm"
          @click="dismiss(toast.id)"
        >&times;</button>
      </div>
    </TransitionGroup>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import { useSessionStore } from '@/stores/sessionStore.js'

const props = defineProps({
  bottomClass: { type: String, default: 'bottom-16' },
})

const sessionStore = useSessionStore()
const toasts = ref([])

watch(
  () => sessionStore.latestJoin,
  (join) => {
    if (!join) return
    const id = `${join.user_id ?? join._clientId}-${join._ts}`
    if (toasts.value.some(t => t.id === id)) return

    toasts.value.push({ id, display_name: join.display_name ?? 'Adventurer' })
    if (toasts.value.length > 3) toasts.value.shift()

    setTimeout(() => {
      toasts.value = toasts.value.filter(t => t.id !== id)
    }, 5000)
  },
)

function dismiss(id) {
  toasts.value = toasts.value.filter(t => t.id !== id)
}
</script>

<style scoped>
.join-toast-enter-active { transition: all 0.15s ease-out; }
.join-toast-leave-active { transition: all 0.4s ease-in; }
.join-toast-enter-from   { opacity: 0; transform: translateY(8px); }
.join-toast-leave-to     { opacity: 0; transform: translateY(8px); }
.join-toast-move         { transition: transform 0.2s ease; }
</style>
