<template>
  <div class="ds-chat-toasts" :class="bottomClass">
    <TransitionGroup name="chat-toast">
      <div v-for="toast in toasts" :key="toast.id" class="ds-chat-toast">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--accent);flex:0 0 auto;margin-top:1px">
          <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
        </svg>
        <span class="ds-ct-who" :style="{ color: playerColorFor(toast.msg.user_id) }">
          {{ gmName(toast.msg.user_id, toast.msg.display_name) }}
        </span>
        <span class="ds-ct-sep">·</span>
        <span class="ds-ct-body">{{ toast.msg.body }}</span>
        <button class="ds-ct-close" @click="toasts = toasts.filter(t => t.id !== toast.id)">×</button>
      </div>
    </TransitionGroup>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import { useChatStore } from '@/stores/chatStore.js'
import { useGMLabel } from '@/composables/useGMLabel.js'
import { playerColorFor } from '@/composables/usePlayerColor.js'

defineProps({ bottomClass: { type: String, default: 'bottom-16' } })

const chatStore = useChatStore()
const { gmName } = useGMLabel()
const toasts = ref([])

watch(() => chatStore.latestMessage, (msg) => {
  if (!msg) return
  const id = msg.id ?? `${msg.user_id}-${msg.created_at}`
  if (toasts.value.some(t => t.id === id)) return
  toasts.value.push({ id, msg })
  if (toasts.value.length > 4) toasts.value.shift()
  setTimeout(() => { toasts.value = toasts.value.filter(t => t.id !== id) }, 4000)
})
</script>

<style scoped>
.ds-chat-toasts {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  z-index: 20;
  display: flex;
  flex-direction: column-reverse;
  gap: 6px;
  pointer-events: none;
  user-select: none;
  align-items: center;
}

.ds-chat-toast {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  background: var(--paper-2, #e3d4b3);
  border: 1px solid var(--rule-strong, rgba(26,20,16,.42));
  padding: 7px 10px;
  box-shadow: 1px 0 0 rgba(255,255,255,.4) inset, 0 4px 12px rgba(0,0,0,.2);
  max-width: 280px;
  pointer-events: auto;
}

.ds-ct-who {
  font-family: var(--font-ui, sans-serif);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: .02em;
  flex: 0 0 auto;
  white-space: nowrap;
}

.ds-ct-sep {
  color: var(--ink-mute, #8a7a68);
  flex: 0 0 auto;
  font-size: 11px;
}

.ds-ct-body {
  font-family: var(--font-body, serif);
  font-size: 13px;
  color: var(--ink, #1a1410);
  line-height: 1.35;
  word-break: break-word;
  flex: 1;
  min-width: 0;
}

.ds-ct-close {
  background: transparent;
  border: 0;
  color: var(--ink-mute, #8a7a68);
  font-size: 15px;
  line-height: 1;
  cursor: pointer;
  padding: 0 0 0 4px;
  flex: 0 0 auto;
  transition: color .12s;
}
.ds-ct-close:hover { color: var(--accent, #8a1c1c); }

.chat-toast-enter-active { transition: all 0.15s ease-out; }
.chat-toast-leave-active { transition: all 0.4s ease-in; }
.chat-toast-enter-from   { opacity: 0; transform: translateY(6px); }
.chat-toast-leave-to     { opacity: 0; transform: translateY(6px); }
.chat-toast-move         { transition: transform 0.2s ease; }
</style>
