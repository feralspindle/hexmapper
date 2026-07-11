<template>
  <div class="ds-panel-section" :class="{ collapsed: !open }">
    <div class="ds-section-head" @click="open = !open">
      <i class="fa-solid fa-route" style="flex:0 0 auto" />
      <h3>Travel</h3>
      <span class="ds-meta">
        {{ state.enabled ? `${Math.round((state.fraction ?? 0) * 100)}% of the day gone` : 'off' }}
      </span>
      <svg class="ds-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <path d="M6 9l6 6 6-6"/>
      </svg>
    </div>

    <div v-show="open" class="travel-body">
      <label class="travel-toggle">
        <input
          type="checkbox"
          :checked="state.enabled"
          data-testid="travel-enabled"
          @change="sessionStore.travel('config', { patch: { enabled: $event.target.checked } })"
        />
        <span>moving the party burns travel time</span>
      </label>

      <div v-if="state.enabled" class="travel-day">
        <div class="travel-bar">
          <div class="travel-bar-fill" :style="{ width: `${Math.min(100, (state.fraction ?? 0) * 100)}%` }" />
        </div>
        <span class="ds-meta">day rolls over at 100% - calendar advances, weather rolls</span>
      </div>

      <details v-if="state.enabled" class="travel-rates">
        <summary class="ds-field-label">pace (hexes per day)</summary>
        <div class="travel-rate-grid">
          <label v-for="terrain in TERRAINS" :key="terrain" class="travel-rate">
            <span>{{ terrain }}<i v-if="isDifficult(terrain)" class="fa-solid fa-triangle-exclamation" title="navigation check on entry" /></span>
            <input
              :value="state.rates?.[terrain] ?? 2"
              type="number"
              min="0.25"
              max="12"
              step="0.25"
              class="ds-input"
              :data-testid="`travel-rate-${terrain}`"
              @change="setRate(terrain, $event.target.value)"
            />
          </label>
        </div>
      </details>

      <p v-if="lastEvent" class="travel-event" data-testid="travel-event">{{ lastEvent }}</p>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useSessionStore } from '@/stores/sessionStore.js'

const TERRAINS = ['plains', 'forest', 'mountain', 'water', 'desert', 'swamp', 'snow', 'volcanic']

const sessionStore = useSessionStore()
const open = ref(false)
const lastEvent = ref('')

const state = computed(() => sessionStore.travelState ?? { enabled: false, fraction: 0 })

function isDifficult(terrain) {
  return (state.value.difficult ?? []).includes(terrain)
}

function setRate(terrain, raw) {
  const value = Math.min(12, Math.max(0.25, Number(raw) || 2))
  sessionStore.travel('config', {
    patch: { rates: { ...(state.value.rates ?? {}), [terrain]: value } },
  })
}

// surface day rollovers and lost results reported back from moves; the chat
// line reaches everyone, this is just the local echo
watch(() => sessionStore.travelState, (next, prev) => {
  if (!prev || !next) return
  if ((next.fraction ?? 0) < (prev.fraction ?? 0)) {
    lastEvent.value = 'a day on the road passes'
  }
})
</script>

<style scoped>
.travel-body {
  padding: 8px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.travel-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  font-family: var(--font-body);
  font-size: 13px;
  cursor: pointer;
}

.travel-day {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.travel-bar {
  height: 6px;
  border: 1px solid var(--rule);
  border-radius: 3px;
  overflow: hidden;
}

.travel-bar-fill {
  height: 100%;
  background: var(--accent-2, #c9a227);
  transition: width 0.3s ease;
}

.travel-rates summary {
  cursor: pointer;
}

.travel-rate-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px 10px;
  margin-top: 6px;
}

.travel-rate {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  font-size: 12px;
}

.travel-rate i {
  margin-left: 4px;
  color: var(--accent-2, #c9a227);
  font-size: 10px;
}

.travel-rate .ds-input {
  width: 54px;
  padding: 2px 4px;
  text-align: center;
}

.travel-event {
  margin: 0;
  font-size: 12px;
  font-style: italic;
  color: var(--ink-mute);
}
</style>
