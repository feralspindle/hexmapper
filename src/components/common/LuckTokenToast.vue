<template>
  <Teleport to="body">
    <Transition name="lt">
      <div v-if="current" :key="current.id" class="lt-overlay">
        <div class="lt-frame">
          <div class="lt-star-wrap">
            <div class="lt-ring lt-ring-1" />
            <div class="lt-ring lt-ring-2" />
            <div
              v-for="n in 12" :key="n"
              class="lt-arm"
              :style="`--angle: ${(n - 1) * 30}deg`"
            >
              <div class="lt-spark" :style="`--delay: ${80 + n * 22}ms`" />
            </div>
            <svg class="lt-star" viewBox="0 0 24 24" width="96" height="96" aria-hidden="true">
              <path d="M12 2 L14.5 9.5 L22 12 L14.5 14.5 L12 22 L9.5 14.5 L2 12 L9.5 9.5 Z" fill="currentColor" />
            </svg>
          </div>
          <div class="lt-text">
            <span class="lt-name">{{ current.characterName }}</span>
            <span class="lt-caption">spends a luck token</span>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref, watch } from 'vue'
import { useCharacterStore } from '@/stores/characterStore.js'

const characterStore = useCharacterStore()
const current = ref(null)
const seenIds = new Set()
let dismissTimer = null

watch(
  () => characterStore.luckEvents,
  (events) => {
    const latest = events[events.length - 1]
    if (!latest || seenIds.has(latest.id)) return
    seenIds.add(latest.id)
    current.value = latest
    if (dismissTimer) clearTimeout(dismissTimer)
    dismissTimer = setTimeout(() => { current.value = null }, 3400)
  },
  { deep: true },
)
</script>

<style scoped>
.lt-overlay {
  position: fixed;
  inset: 0;
  display: grid;
  place-items: center;
  pointer-events: none;
  z-index: 900;
  background: rgba(0, 0, 0, 0.42);
}

.lt-frame {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
  padding: 36px 56px;
  background: var(--paper-2, #e4d8c0);
  border: 1px solid var(--rule-strong, #c8baa0);
  box-shadow:
    0 24px 64px rgba(0, 0, 0, 0.55),
    0 4px 16px rgba(0, 0, 0, 0.3),
    inset 1px 0 0 rgba(255, 255, 255, 0.32);
  animation: lt-frame-arrive 520ms cubic-bezier(0.34, 1.56, 0.64, 1) both;
}

@keyframes lt-frame-arrive {
  from { transform: scale(0.84); }
  to   { transform: scale(1); }
}

.lt-star-wrap {
  position: relative;
  width: 96px;
  height: 96px;
}

.lt-ring {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  border: 2px solid rgba(200, 168, 107, 0.7);
}

.lt-ring-1 {
  animation: lt-ring-burst 680ms cubic-bezier(0.23, 1, 0.32, 1) 180ms both;
}

.lt-ring-2 {
  border-color: rgba(200, 168, 107, 0.4);
  animation: lt-ring-burst 820ms cubic-bezier(0.23, 1, 0.32, 1) 320ms both;
}

@keyframes lt-ring-burst {
  from { transform: scale(0.5); opacity: 1; }
  to   { transform: scale(2.8); opacity: 0; }
}

.lt-star {
  position: relative;
  z-index: 1;
  color: #c8a86b;
  animation:
    lt-star-arrive 500ms cubic-bezier(0.34, 1.56, 0.64, 1) both,
    lt-glow-pulse 1.6s 500ms ease-in-out infinite alternate both;
}

@keyframes lt-star-arrive {
  from { transform: scale(0.5); }
  to   { transform: scale(1); }
}

@keyframes lt-glow-pulse {
  from {
    filter:
      drop-shadow(0 0 14px rgba(200, 168, 107, 0.8))
      drop-shadow(0 0 32px rgba(200, 168, 107, 0.45));
  }
  to {
    filter:
      drop-shadow(0 0 22px rgba(200, 168, 107, 1))
      drop-shadow(0 0 56px rgba(200, 168, 107, 0.7))
      drop-shadow(0 0 88px rgba(200, 168, 107, 0.35));
  }
}

.lt-arm {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 1px;
  height: 1px;
  transform: rotate(var(--angle));
  transform-origin: 0 0;
}

.lt-spark {
  position: absolute;
  left: 0;
  background: #c8a86b;
  clip-path: polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%);
  animation: lt-spark-fly 560ms ease-out var(--delay, 80ms) both;
}

.lt-arm:nth-child(odd) .lt-spark {
  width: 9px;
  height: 9px;
  top: -4.5px;
}

.lt-arm:nth-child(even) .lt-spark {
  width: 6px;
  height: 6px;
  top: -3px;
  animation-duration: 640ms;
}

@keyframes lt-spark-fly {
  from {
    transform: translateX(22px) scale(0);
    opacity: 1;
  }
  60% { opacity: 1; }
  to {
    transform: translateX(88px) scale(0.4);
    opacity: 0;
  }
}

.lt-text {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  animation: lt-text-rise 320ms 240ms ease-out both;
}

@keyframes lt-text-rise {
  from { transform: translateY(10px); opacity: 0; }
  to   { transform: translateY(0);    opacity: 1; }
}

.lt-name {
  font-family: var(--font-display, 'IM Fell English', serif);
  font-style: italic;
  font-size: 28px;
  color: var(--ink, #1a1410);
  line-height: 1.15;
}

.lt-caption {
  font-family: var(--font-zine, 'Special Elite', serif);
  font-size: 11px;
  letter-spacing: .18em;
  text-transform: uppercase;
  color: var(--ink-mute, #9e8e7e);
}

.lt-enter-active { transition: opacity 250ms ease-out; }
.lt-leave-active { transition: opacity 350ms ease-out; }
.lt-enter-from   { opacity: 0; }
.lt-leave-to     { opacity: 0; }

@media (prefers-reduced-motion: reduce) {
  .lt-frame,
  .lt-star,
  .lt-ring,
  .lt-spark,
  .lt-text { animation: none; }
}
</style>
