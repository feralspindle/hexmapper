<template>
  <Transition name="rt-banner">
    <div v-if="showDisconnected" class="rt-banner" role="status" aria-live="polite" data-testid="realtime-banner">
      <svg class="rt-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M1 1l22 22M16.72 11.06A10.94 10.94 0 0119 12.55M5 12.55a10.94 10.94 0 015.17-2.39M10.71 5.05A16 16 0 0122.58 9M1.42 9a15.91 15.91 0 014.7-2.88M8.53 16.11a6 6 0 016.95 0M12 20h.01"/>
      </svg>
      <div class="rt-body">
        <div class="rt-title">Live updates disconnected</div>
        <div class="rt-sub">
          Reconnecting automatically — the map will refresh when the
          connection returns. If this persists, check your internet
          connection or refresh the page.
        </div>
      </div>
      <button class="rt-refresh" @click="reload">Refresh</button>
    </div>
  </Transition>
</template>

<script setup>
import { useRealtimeConnection } from '@/composables/useRealtimeConnection.js'

const { showDisconnected } = useRealtimeConnection()

function reload() {
  window.location.reload()
}
</script>

<style scoped>
.rt-banner {
  position: fixed;
  left: 50%;
  bottom: 18px;
  transform: translateX(-50%);
  z-index: 1000;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  max-width: min(440px, calc(100vw - 24px));
  padding: 10px 12px;
  background: var(--paper, #ede1c7);
  border: 1px solid var(--accent, #9b3b2e);
  border-left-width: 3px;
  border-radius: 3px;
  box-shadow: 0 6px 24px rgba(0, 0, 0, .35), 0 1px 4px rgba(0, 0, 0, .18);
}

.rt-icon {
  flex: 0 0 auto;
  margin-top: 1px;
  color: var(--accent, #9b3b2e);
}

.rt-body {
  flex: 1 1 auto;
  min-width: 0;
}

.rt-title {
  font-family: var(--font-display);
  font-size: 12px;
  letter-spacing: .04em;
  color: var(--ink, #1a1410);
}

.rt-sub {
  font-family: var(--font-mono);
  font-size: 10.5px;
  line-height: 1.45;
  color: var(--ink-mute, #6b5d49);
  margin-top: 3px;
}

.rt-refresh {
  flex: 0 0 auto;
  align-self: center;
  padding: 5px 11px;
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: .04em;
  color: var(--paper, #ede1c7);
  background: var(--accent, #9b3b2e);
  border: 1px solid var(--accent, #9b3b2e);
  border-radius: 2px;
  cursor: pointer;
  transition: opacity .15s;
}
.rt-refresh:hover { opacity: .85; }

.rt-banner-enter-active,
.rt-banner-leave-active { transition: opacity .25s, transform .25s; }
.rt-banner-enter-from,
.rt-banner-leave-to { opacity: 0; transform: translate(-50%, 8px); }
</style>
