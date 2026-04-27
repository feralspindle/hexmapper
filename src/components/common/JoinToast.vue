<template>
  <div class="ds-join-toasts" :class="bottomClass">
    <TransitionGroup name="join-toast">
      <div v-for="toast in toasts" :key="toast.id" class="ds-join-toast">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--accent);flex:0 0 auto;margin-top:1px">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        </svg>
        <span class="ds-jt-body">Hail, <span class="ds-jt-name">{{ toast.display_name }}</span>!</span>
        <button class="ds-jt-close" @click="dismiss(toast.id)">×</button>
      </div>
    </TransitionGroup>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import { useSessionStore } from '@/stores/sessionStore.js'

defineProps({ bottomClass: { type: String, default: 'bottom-16' } })

const sessionStore = useSessionStore()
const toasts = ref([])

watch(() => sessionStore.latestJoin, (join) => {
  if (!join) return
  const id = `${join.user_id ?? join._clientId}-${join._ts}`
  if (toasts.value.some(t => t.id === id)) return
  toasts.value.push({ id, display_name: join.display_name ?? 'Adventurer' })
  if (toasts.value.length > 3) toasts.value.shift()
  setTimeout(() => { toasts.value = toasts.value.filter(t => t.id !== id) }, 5000)
})

function dismiss(id) { toasts.value = toasts.value.filter(t => t.id !== id) }
</script>

<style scoped>
.ds-join-toasts {
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

.ds-join-toast {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--ink, #1a1410);
  border: 1px solid rgba(237,225,199,.18);
  border-radius: 3px;
  padding: 7px 10px;
  box-shadow: 0 4px 16px rgba(0,0,0,.6), 0 0 0 1px rgba(237,225,199,.05) inset;
  pointer-events: auto;
}

.ds-jt-body {
  font-family: var(--font-body, serif);
  font-size: 13px;
  color: rgba(237,225,199,.75);
}

.ds-jt-name {
  font-family: var(--font-display, 'IM Fell English', serif);
  font-style: italic;
  color: rgba(237,225,199,.95);
}

.ds-jt-close {
  background: transparent;
  border: 0;
  color: rgba(237,225,199,.3);
  font-size: 15px;
  line-height: 1;
  cursor: pointer;
  padding: 0 0 0 4px;
  flex: 0 0 auto;
  transition: color .12s;
}
.ds-jt-close:hover { color: rgba(237,225,199,.7); }

.join-toast-enter-active { transition: all 0.15s ease-out; }
.join-toast-leave-active { transition: all 0.4s ease-in; }
.join-toast-enter-from   { opacity: 0; transform: translateY(6px); }
.join-toast-leave-to     { opacity: 0; transform: translateY(6px); }
.join-toast-move         { transition: transform 0.2s ease; }
</style>
