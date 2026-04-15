<template>
  <div class="flex flex-col min-h-0 overflow-hidden">

    <div class="px-3 py-1.5 shrink-0 border-b border-stone-800 flex items-center bg-stone-900 sticky top-0 z-10">
      <span class="text-stone-400 text-xs uppercase tracking-widest">Chat</span>
    </div>

    <div ref="logEl" class="flex-1 min-h-0 overflow-y-auto px-2.5 py-2 space-y-1.5">
      <div
        v-if="!chatStore.messages.length"
        class="text-stone-600 text-xs italic text-center py-4"
      >
        No messages yet
      </div>
      <div
        v-for="msg in chatStore.messages"
        :key="msg.id"
        class="text-xs leading-snug"
        :class="msg.id?.toString().startsWith('pending-') ? 'opacity-50' : ''"
      >
        <div class="flex items-baseline justify-between gap-1.5">
          <span
            class="font-display shrink-0"
            :class="msg.user_id === authStore.user?.id ? 'text-parchment-400' : 'text-stone-400'"
          >{{ gmName(msg.user_id, msg.display_name) }}</span>
          <span v-if="msg.created_at" class="text-stone-600 text-[10px] shrink-0">{{ timeAgo(msg.created_at) }}</span>
        </div>
        <span class="text-stone-200 break-words">{{ msg.body }}</span>
      </div>
    </div>

    <div class="px-2 py-2 shrink-0 flex gap-1.5 border-t border-stone-800">
      <input
        v-model="draft"
        type="text"
        placeholder="Message… (Enter to send)"
        maxlength="500"
        class="flex-1 min-w-0 bg-stone-800 border border-stone-700 rounded px-2 py-1.5 text-xs text-stone-100 placeholder-stone-600 focus:outline-none focus:border-parchment-400"
        @keydown.enter.prevent="send"
      />
      <button
        :disabled="!draft.trim()"
        class="bg-parchment-500 hover:bg-parchment-400 disabled:opacity-40 text-stone-900 font-display rounded px-2.5 py-1.5 text-xs transition-colors shrink-0"
        @click="send"
      >Send</button>
    </div>

  </div>
</template>

<script setup>
import { ref, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { useChatStore } from '@/stores/chatStore.js'
import { useAuthStore } from '@/stores/authStore.js'
import { useGMLabel } from '@/composables/useGMLabel.js'

const chatStore = useChatStore()
const authStore = useAuthStore()
const { gmName } = useGMLabel()

const draft = ref('')
const logEl = ref(null)

function send() {
  const body = draft.value.trim()
  if (!body) return
  draft.value = ''
  chatStore.sendMessage(body)
}

const now = ref(Date.now())
let tickInterval = null
onMounted(() => { tickInterval = setInterval(() => { now.value = Date.now() }, 10000) })
onUnmounted(() => { clearInterval(tickInterval) })

function timeAgo(ts) {
  const diff = now.value - new Date(ts).getTime()
  if (diff < 60000)   return `${Math.floor(diff / 1000)}s ago`
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  return `${Math.floor(diff / 3600000)}h ago`
}

watch(
  () => chatStore.messages.length,
  () => nextTick(() => {
    if (logEl.value) logEl.value.scrollTop = logEl.value.scrollHeight
  }),
  { immediate: true },
)
</script>
