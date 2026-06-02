<template>
  <Teleport to="body">
    <Transition name="qc">
      <div v-if="current" :key="current.id" class="qc-overlay">
        <div class="qc-frame">
          <div class="qc-icon-wrap">
            <div class="qc-ring qc-ring-1" />
            <div class="qc-ring qc-ring-2" />
            <div
              v-for="n in 12" :key="n"
              class="qc-arm"
              :style="`--angle: ${(n - 1) * 30}deg`"
            >
              <div class="qc-spark" :style="`--delay: ${80 + n * 22}ms`" />
            </div>
            <svg class="qc-icon" viewBox="0 0 24 24" width="80" height="80" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z"/>
              <path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z"/>
            </svg>
          </div>
          <div class="qc-text">
            <span class="qc-title">{{ current.title || 'Quest' }}</span>
            <span class="qc-caption">quest complete</span>
            <div v-if="current.rewards?.length" class="qc-rewards">
              <span v-for="r in current.rewards" :key="r.id" class="qc-reward">{{ formatReward(r) }}</span>
              <span class="qc-reward-sub">→ pending loot</span>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref, watch } from 'vue'
import { useQuestToast } from '@/composables/useQuestToast.js'
import { playLuckSound } from '@/lib/diceSound.js'

const { questEvents } = useQuestToast()
const current = ref(null)
const seenIds = new Set()
let dismissTimer = null

watch(questEvents, (events) => {
  const latest = events[events.length - 1]
  if (!latest || seenIds.has(latest.id)) return
  seenIds.add(latest.id)
  current.value = latest
  playLuckSound()
  if (dismissTimer) clearTimeout(dismissTimer)
  dismissTimer = setTimeout(() => { current.value = null }, 3800)
}, { deep: true })

function formatReward(r) {
  if (r.type === 'coins') return `${r.qty} ${r.currency}`
  return r.qty > 1 ? `×${r.qty} ${r.name}` : r.name
}
</script>

<style scoped>
.qc-overlay {
  position: fixed;
  inset: 0;
  display: grid;
  place-items: center;
  pointer-events: none;
  z-index: 900;
  background: rgba(0, 0, 0, 0.42);
}

.qc-frame {
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
  animation: qc-frame-arrive 520ms cubic-bezier(0.34, 1.56, 0.64, 1) both;
}

@keyframes qc-frame-arrive {
  from { transform: scale(0.84); }
  to   { transform: scale(1); }
}

.qc-icon-wrap {
  position: relative;
  width: 80px;
  height: 80px;
  display: grid;
  place-items: center;
}

.qc-ring {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  border: 2px solid rgba(200, 168, 107, 0.7);
}
.qc-ring-1 { animation: qc-ring-burst 680ms cubic-bezier(0.23, 1, 0.32, 1) 180ms both; }
.qc-ring-2 {
  border-color: rgba(200, 168, 107, 0.4);
  animation: qc-ring-burst 820ms cubic-bezier(0.23, 1, 0.32, 1) 320ms both;
}

@keyframes qc-ring-burst {
  from { transform: scale(0.5); opacity: 1; }
  to   { transform: scale(2.8); opacity: 0; }
}

.qc-icon {
  position: relative;
  z-index: 1;
  color: #c8a86b;
  animation:
    qc-icon-arrive 500ms cubic-bezier(0.34, 1.56, 0.64, 1) both,
    qc-glow-pulse 1.6s 500ms ease-in-out infinite alternate both;
}

@keyframes qc-icon-arrive {
  from { transform: scale(0.5); opacity: 0; }
  to   { transform: scale(1);   opacity: 1; }
}

@keyframes qc-glow-pulse {
  from { filter: drop-shadow(0 0 10px rgba(200, 168, 107, 0.7)) drop-shadow(0 0 24px rgba(200, 168, 107, 0.35)); }
  to   { filter: drop-shadow(0 0 18px rgba(200, 168, 107, 1))   drop-shadow(0 0 48px rgba(200, 168, 107, 0.6)); }
}

.qc-arm {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 1px;
  height: 1px;
  transform: rotate(var(--angle));
  transform-origin: 0 0;
}
.qc-spark {
  position: absolute;
  left: 0;
  background: #c8a86b;
  clip-path: polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%);
  animation: qc-spark-fly 560ms ease-out var(--delay, 80ms) both;
}
.qc-arm:nth-child(odd) .qc-spark  { width: 9px; height: 9px; top: -4.5px; }
.qc-arm:nth-child(even) .qc-spark { width: 6px; height: 6px; top: -3px; animation-duration: 640ms; }

@keyframes qc-spark-fly {
  from { transform: translateX(18px) scale(0); opacity: 1; }
  60%  { opacity: 1; }
  to   { transform: translateX(72px) scale(0.4); opacity: 0; }
}

.qc-text {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  animation: qc-text-rise 320ms 240ms ease-out both;
}

@keyframes qc-text-rise {
  from { transform: translateY(10px); opacity: 0; }
  to   { transform: translateY(0);    opacity: 1; }
}

.qc-title {
  font-family: var(--font-display, 'IM Fell English', serif);
  font-style: italic;
  font-size: 26px;
  color: var(--ink, #1a1410);
  line-height: 1.15;
  text-align: center;
  max-width: 320px;
}

.qc-caption {
  font-family: var(--font-zine, 'Special Elite', serif);
  font-size: 11px;
  letter-spacing: .18em;
  text-transform: uppercase;
  color: var(--ink-mute, #9e8e7e);
}

.qc-rewards {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  margin-top: 6px;
  padding-top: 8px;
  border-top: 1px solid var(--rule, rgba(26,20,16,.18));
  width: 100%;
}

.qc-reward {
  font-family: var(--font-body, serif);
  font-size: 13px;
  color: var(--ink-soft, #5a4a3a);
}

.qc-reward-sub {
  font-family: var(--font-zine, 'Special Elite', serif);
  font-size: 9px;
  letter-spacing: .12em;
  text-transform: uppercase;
  color: var(--ink-mute, #9e8e7e);
  margin-top: 2px;
}

.qc-enter-active { transition: opacity 250ms ease-out; }
.qc-leave-active { transition: opacity 350ms ease-out; }
.qc-enter-from   { opacity: 0; }
.qc-leave-to     { opacity: 0; }

@media (prefers-reduced-motion: reduce) {
  .qc-frame, .qc-icon, .qc-ring, .qc-spark, .qc-text { animation: none; }
}
</style>
