<template>
  <Teleport to="body">
    <Transition name="ht">
      <div v-if="current" :key="current.id" class="ht-overlay" data-testid="hell-toast">
        <div class="ht-frame">
          <div class="ht-pit">
            <i
              v-for="(f, i) in flames"
              :key="i"
              class="fa-solid fa-fire ht-flame"
              :style="f"
            />
          </div>
          <div class="ht-text">
            <span class="ht-name">{{ current.characterName }}</span>
            <span class="ht-caption">descending</span>
          </div>
          <div class="ht-pit ht-pit--bottom">
            <i
              v-for="(f, i) in flames"
              :key="i"
              class="fa-solid fa-fire ht-flame"
              :style="f"
            />
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
  () => characterStore.hellEvents,
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

const flames = [
  { fontSize: '22px', color: '#d84c1e', left: '12%', animationDelay: '0s',    animationDuration: '0.85s' },
  { fontSize: '30px', color: '#f28c28', left: '26%', animationDelay: '0.3s',  animationDuration: '1.1s' },
  { fontSize: '18px', color: '#a82810', left: '42%', animationDelay: '0.6s',  animationDuration: '0.8s' },
  { fontSize: '34px', color: '#e06018', left: '52%', animationDelay: '0.15s', animationDuration: '1.25s' },
  { fontSize: '20px', color: '#f28c28', left: '70%', animationDelay: '0.45s', animationDuration: '0.95s' },
  { fontSize: '26px', color: '#d84c1e', left: '82%', animationDelay: '0.75s', animationDuration: '1.05s' },
]
</script>

<style scoped>
.ht-overlay {
  position: fixed;
  inset: 0;
  display: grid;
  place-items: center;
  pointer-events: none;
  z-index: 900;
  background:
    radial-gradient(ellipse at center, rgba(60, 8, 2, 0.35) 0%, rgba(16, 3, 1, 0.62) 100%);
}
.ht-frame {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 18px 56px;
  background: #2a0f08;
  border: 1px solid #8a2c10;
  box-shadow:
    0 0 42px rgba(216, 76, 30, 0.45),
    0 24px 64px rgba(0, 0, 0, 0.6),
    inset 0 0 26px rgba(120, 30, 8, 0.55);
  animation: ht-frame-arrive 460ms cubic-bezier(0.34, 1.56, 0.64, 1) both;
}
@keyframes ht-frame-arrive {
  from { transform: scale(0.84) translateY(-12px); }
  to   { transform: scale(1) translateY(0); }
}
.ht-pit {
  position: relative;
  width: 300px;
  height: 30px;
}
.ht-pit--bottom {
  transform: scaleY(-1);
  opacity: 0.8;
}
.ht-flame {
  position: absolute;
  bottom: 0;
  transform-origin: 50% 100%;
  animation-name: ht-flicker;
  animation-iteration-count: infinite;
  animation-timing-function: ease-in-out;
  animation-direction: alternate;
  filter: drop-shadow(0 0 8px rgba(240, 120, 30, 0.9));
}
@keyframes ht-flicker {
  0% {
    opacity: 0.7;
    transform: scaleY(0.8) scaleX(1.08) rotate(-4deg);
  }
  100% {
    opacity: 1;
    transform: scaleY(1.35) scaleX(0.9) rotate(4deg);
  }
}
.ht-text {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  padding: 8px 0 10px;
  animation: ht-text-sink 680ms cubic-bezier(0.55, 0, 1, 0.45) both;
}
@keyframes ht-text-sink {
  from { transform: translateY(-22px); opacity: 0; }
  60%  { opacity: 1; }
  to   { transform: translateY(0); opacity: 1; }
}
.ht-name {
  font-family: var(--font-display, 'IM Fell English', serif);
  font-style: italic;
  font-size: 30px;
  color: #ffb37a;
  text-shadow: 0 0 18px rgba(240, 120, 30, 0.65);
  line-height: 1.15;
}
.ht-caption {
  font-family: var(--font-zine, 'Special Elite', serif);
  font-size: 12px;
  letter-spacing: 0.34em;
  text-transform: uppercase;
  color: #d8956a;
}
.ht-enter-active { transition: opacity 250ms ease-out; }
.ht-leave-active { transition: opacity 400ms ease-out; }
.ht-enter-from   { opacity: 0; }
.ht-leave-to     { opacity: 0; }

@media (prefers-reduced-motion: reduce) {
  .ht-frame,
  .ht-flame,
  .ht-text { animation: none; }
}
</style>
