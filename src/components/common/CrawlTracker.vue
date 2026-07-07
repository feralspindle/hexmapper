<template>
  <div class="ds-panel-section" :class="{ collapsed: !open }">
    <div class="ds-section-head" @click="open = !open">
      <i class="fa-solid fa-shoe-prints" style="flex:0 0 auto" />
      <h3>Crawl</h3>
      <span class="ds-meta">round {{ sessionStore.crawlRound }} · {{ elapsedLabel }}</span>
      <svg class="ds-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <path d="M6 9l6 6 6-6"/>
      </svg>
    </div>

    <div v-show="open" class="crawl-body">
      <div class="crawl-row">
        <button type="button" class="ds-btn" data-testid="crawl-advance" @click="advance">
          <i class="fa-solid fa-forward-step" />
          <span>Next round</span>
        </button>
        <button type="button" class="hm-card-icon-btn" title="Reset rounds" data-testid="crawl-reset" @click="sessionStore.resetCrawlRound()">
          <i class="fa-solid fa-rotate-left" />
        </button>
      </div>

      <div class="crawl-config">
        <span class="ds-field-label">check every</span>
        <input
          :value="sessionStore.crawlCheckEvery"
          type="number"
          min="0"
          max="100"
          class="ds-input crawl-every"
          data-testid="crawl-every"
          title="Roll d6 every N rounds, encounter on a 1. 0 turns the check off. Tag a table crawl.encounter to have hits roll it."
          @change="sessionStore.setCrawlCheckEvery(Number($event.target.value) || 0)"
        />
        <span class="ds-meta">rounds (d6, encounter on 1)</span>
      </div>

      <p v-if="lastEncounter" class="crawl-encounter" data-testid="crawl-encounter">
        {{ lastEncounter }}
      </p>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useSessionStore } from '@/stores/sessionStore.js'

// shadowdark-ish: one crawling round is about ten minutes of dungeon time
const MINUTES_PER_ROUND = 10

const sessionStore = useSessionStore()
const open = ref(true)
const lastEncounter = ref('')

const elapsedLabel = computed(() => {
  const minutes = sessionStore.crawlRound * MINUTES_PER_ROUND
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
})

async function advance() {
  lastEncounter.value = ''
  const result = await sessionStore.advanceCrawlRound()
  const enc = result?.encounter
  if (!enc || enc === null) return
  if (enc.hit) {
    lastEncounter.value = `encounter! ${enc.result ?? ''}`
  } else if (enc.checked) {
    lastEncounter.value = `check: rolled ${enc.die}, clear`
  }
}
</script>

<style scoped>
.crawl-body {
  padding: 8px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.crawl-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.crawl-row .ds-btn {
  flex: 1;
}

.crawl-config {
  display: flex;
  align-items: center;
  gap: 6px;
}

.crawl-every {
  width: 52px;
  padding: 3px 6px;
  text-align: center;
}

.crawl-encounter {
  margin: 0;
  font-family: var(--font-body);
  font-size: 13px;
  color: var(--accent-2);
}
</style>
