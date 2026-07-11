<template>
  <Transition name="map-fade">
    <div v-if="visible" class="map-loading-overlay">
      <svg class="map-spinner" width="52" height="52" viewBox="0 0 52 52" fill="none">
        <polygon
          points="26,3 47.7,15 47.7,37 26,49 4.3,37 4.3,15"
          stroke="#d4a74b"
          stroke-width="2"
          stroke-linejoin="round"
        />
        <polygon
          points="26,13 40.6,21 40.6,37 26,45 11.4,37 11.4,21"
          stroke="#d4a74b"
          stroke-width="1.2"
          stroke-linejoin="round"
          opacity="0.35"
        />
      </svg>
      <span class="map-loading-label">{{ label }}</span>
    </div>
  </Transition>
</template>

<script setup>
defineProps({
  visible: { type: Boolean, default: false },
  label: { type: String, default: 'Loading…' },
})
</script>

<style scoped>
.map-loading-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: rgba(8, 12, 22, 0.72);
  backdrop-filter: blur(3px);
  z-index: 10;
  gap: 16px;
  pointer-events: none;
}

.map-spinner {
  animation: map-hex-spin 2.4s linear infinite;
  transform-origin: center;
}

@keyframes map-hex-spin {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}

.map-loading-label {
  font-family: 'Cinzel', 'Cormorant Garamond', Georgia, serif;
  font-size: 11px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: rgba(212, 167, 75, 0.7);
}

.map-fade-enter-active,
.map-fade-leave-active {
  transition: opacity 0.3s ease;
}
.map-fade-enter-from,
.map-fade-leave-to {
  opacity: 0;
}
</style>
