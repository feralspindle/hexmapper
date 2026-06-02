<template>
  <Teleport to="body">
    <div class="ld-toasts">
      <TransitionGroup name="ld">
        <div v-for="t in toasts" :key="t.id" class="ld-toast" :class="`ld-toast--${t.type}`">
          <div class="ld-icon">
            <svg v-if="t.type === 'coins'" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
              <circle cx="12" cy="12" r="9"/>
              <path d="M12 7v2m0 6v2M9.5 9.5C9.5 8.4 10.6 8 12 8s2.5.4 2.5 1.5-1.1 1.5-2.5 1.5-2.5.4-2.5 1.5S10.6 14 12 14s2.5-.4 2.5-1.5"/>
            </svg>
            <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 8v13H3V8"/>
              <path d="M1 3h22v5H1z"/>
              <path d="M10 12h4"/>
            </svg>
          </div>
          <div class="ld-body">
            <div class="ld-name">{{ t.charName }}</div>
            <div class="ld-what">
              <template v-if="t.type === 'coins'">+{{ t.amount }} {{ t.currency }}</template>
              <template v-else>{{ t.qty > 1 ? `×${t.qty} ` : '' }}{{ t.itemName }}</template>
            </div>
          </div>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, watch } from 'vue'
import { useLootToast } from '@/composables/useLootToast.js'

const { lootEvents } = useLootToast()
const toasts = ref([])

let processedCount = lootEvents.value.length

watch(lootEvents, (events) => {
  for (let i = processedCount; i < events.length; i++) {
    const event = events[i]
    processedCount = i + 1
    toasts.value.push(event)
    if (toasts.value.length > 6) toasts.value.shift()
    setTimeout(() => {
      toasts.value = toasts.value.filter(t => t.id !== event.id)
    }, 4500)
  }
}, { deep: true })
</script>

<style scoped>
.ld-toasts {
  position: fixed;
  bottom: 72px;
  left: 16px;
  z-index: 20;
  display: flex;
  flex-direction: column-reverse;
  gap: 6px;
  max-width: 220px;
  pointer-events: none;
  user-select: none;
}

.ld-toast {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  background: var(--paper-2, #e3d4b3);
  border: 1px solid var(--rule-strong, rgba(26,20,16,.42));
  border-left-width: 3px;
  padding: 9px 12px;
  box-shadow: 1px 0 0 rgba(255,255,255,.4) inset, 0 4px 14px rgba(0,0,0,.22);
}

.ld-toast--coins { border-left-color: var(--gold, #c8a84b); }
.ld-toast--item  { border-left-color: var(--accent-3, #4a7c59); }

.ld-icon {
  flex: 0 0 auto;
  width: 26px;
  height: 26px;
  display: grid;
  place-items: center;
  background: var(--paper-3, #d8c69e);
  border: 1px solid var(--rule-strong, rgba(26,20,16,.42));
  margin-top: 1px;
}

.ld-toast--coins .ld-icon { color: var(--gold, #c8a84b); }
.ld-toast--item  .ld-icon { color: var(--accent-3, #4a7c59); }

.ld-body { flex: 1; min-width: 0; }

.ld-name {
  font-family: var(--font-display, 'IM Fell English', serif);
  font-style: italic;
  font-size: 16px;
  color: var(--ink, #1a1410);
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ld-what {
  font-family: var(--font-zine, 'Special Elite', serif);
  font-size: 13px;
  letter-spacing: .08em;
  text-transform: uppercase;
  margin-top: 2px;
}

.ld-toast--coins .ld-what { color: var(--ink, #1a1410); }
.ld-toast--item  .ld-what { color: var(--accent-3, #4a7c59); }

.ld-enter-active { transition: all 0.18s ease-out; }
.ld-leave-active { transition: all 0.45s ease-in; }
.ld-enter-from   { opacity: 0; transform: translateX(-10px); }
.ld-leave-to     { opacity: 0; transform: translateX(-10px); }
.ld-move         { transition: transform 0.2s ease; }
</style>
