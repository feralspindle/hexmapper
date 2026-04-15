<template>
  <div
    class="absolute left-1/2 -translate-x-1/2 z-20 flex flex-col-reverse gap-1.5 pointer-events-none select-none items-center"
    :class="bottomClass"
  >
    <TransitionGroup name="chat-toast">
      <div
        v-for="toast in toasts"
        :key="toast.id"
        class="bg-stone-900/90 border border-stone-600 rounded-lg px-3 py-1.5 backdrop-blur flex items-center gap-2 text-xs max-w-xs pointer-events-auto"
      >
        <i class="fa-solid fa-comment text-stone-500 shrink-0 text-[10px]" />
        <span
          class="font-display shrink-0"
          :class="toast.msg.user_id === authStore.user?.id ? 'text-parchment-400' : 'text-stone-300'"
        >{{ gmName(toast.msg.user_id, toast.msg.display_name) }}</span>
        <span class="text-stone-500 shrink-0">·</span>
        <span class="text-stone-200 truncate">{{ toast.msg.body }}</span>
        <button
          class="ml-1 text-parchment-400 hover:text-parchment-200 transition-colors shrink-0 leading-none text-sm"
          @click="toasts = toasts.filter(t => t.id !== toast.id)"
        >&times;</button>
      </div>
    </TransitionGroup>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'

const props = defineProps({
  bottomClass: { type: String, default: 'bottom-16' },
})
import { useChatStore } from '@/stores/chatStore.js'
import { useAuthStore } from '@/stores/authStore.js'
import { useGMLabel } from '@/composables/useGMLabel.js'

const chatStore = useChatStore()
const authStore = useAuthStore()
const { gmName } = useGMLabel()

const toasts = ref([])

watch(
  () => chatStore.latestMessage,
  (msg) => {
    if (!msg) return

    const id = msg.id ?? `${msg.user_id}-${msg.created_at}`
    if (toasts.value.some(t => t.id === id)) return

    toasts.value.push({ id, msg })
    if (toasts.value.length > 4) toasts.value.shift()

    setTimeout(() => {
      toasts.value = toasts.value.filter(t => t.id !== id)
    }, 4000)
  },
)
</script>

<style scoped>
.chat-toast-enter-active { transition: all 0.15s ease-out; }
.chat-toast-leave-active { transition: all 0.4s ease-in; }
.chat-toast-enter-from   { opacity: 0; transform: translateY(8px); }
.chat-toast-leave-to     { opacity: 0; transform: translateY(8px); }
.chat-toast-move         { transition: transform 0.2s ease; }
</style>
