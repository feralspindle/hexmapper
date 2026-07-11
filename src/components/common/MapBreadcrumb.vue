<template>
  <nav
    v-if="showWhenEmpty || visibleAncestors.length"
    class="mb-nav"
    :class="{ 'mb-lead': leadingGap }"
    :title="fullBreadcrumbPath"
  >
    <template
      v-for="(segment, i) in visibleAncestors"
      :key="segment.id ?? segment.ellipsis"
    >
      <span v-if="i > 0" class="mb-sep">/</span>
      <span v-if="segment.ellipsis" class="mb-sep">…</span>
      <button
        v-else-if="navigable"
        class="mb-seg mb-btn"
        data-testid="map-breadcrumb"
        @click="emit('navigate', segment.id)"
      >{{ segment.name }}</button>
      <span v-else class="mb-seg">{{ segment.name }}</span>
    </template>

    <template v-if="mapStore.activeMap">
      <span v-if="visibleAncestors.length" class="mb-sep">/</span>
      <button
        v-if="leaf != null && navigable"
        class="mb-seg mb-btn"
        @click="emit('navigate', mapStore.activeMap.id)"
      >{{ mapStore.activeMap.name }}</button>
      <span
        v-else
        class="mb-seg mb-terminal"
        :style="{ maxWidth: terminalMaxWidth + 'px' }"
        data-testid="active-map-name"
      >{{ mapStore.activeMap.name }}</span>
    </template>

    <template v-if="leaf != null">
      <span class="mb-sep">/</span>
      <span class="mb-seg mb-terminal" :style="{ maxWidth: terminalMaxWidth + 'px' }">{{ leaf }}</span>
    </template>
  </nav>
</template>

<script setup>
import { useMapStore } from '@/stores/mapStore.js'
import { useMapBreadcrumb } from '@/composables/useMapBreadcrumb.js'

const props = defineProps({
  leaf: { type: String, default: null },
  navigable: { type: Boolean, default: true },
  showWhenEmpty: { type: Boolean, default: false },
  leadingGap: { type: Boolean, default: false },
  terminalMaxWidth: { type: Number, default: 140 },
})
const emit = defineEmits(['navigate'])

const mapStore = useMapStore()
const { visibleAncestors, fullBreadcrumbPath } = useMapBreadcrumb(
  () => props.leaf,
)
</script>

<style scoped>
.mb-nav {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  overflow: hidden;
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: 0.04em;
  color: rgba(237, 225, 199, 0.45);
}
.mb-lead { margin-left: 8px; }

.mb-sep {
  opacity: 0.4;
  flex-shrink: 0;
}

.mb-seg {
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex-shrink: 1;
  color: rgba(237, 225, 199, 0.55);
}

.mb-btn {
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: 0.04em;
}

.mb-terminal { color: rgba(237, 225, 199, 0.8); }
</style>
