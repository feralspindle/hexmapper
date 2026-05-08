<template>
    <div v-if="props.scale != null" class="map-scale-overlay">
        <div class="map-scale-labels">
            <span>0</span>
            <span>{{ props.scale }} {{ displayUnit }}</span>
        </div>
        <div class="map-scale-rule">
            <div class="map-scale-tick" />
            <div class="map-scale-seg map-scale-filled" />
            <div class="map-scale-tick" />
            <div class="map-scale-seg map-scale-empty" />
            <div class="map-scale-tick" />
        </div>
    </div>
</template>

<script setup>
import { computed } from "vue";

const props = defineProps({
    scale: { type: Number, default: null },
    unit: { type: String, default: "miles" },
});

const displayUnit = computed(() => (props.unit === "feet" ? "ft" : "mi"));
</script>

<style scoped>
.map-scale-overlay {
    position: absolute;
    bottom: 16px;
    right: 16px;
    z-index: 50;
    pointer-events: none;
    background: var(--paper);
    border: 1px solid var(--rule-strong);
    border-radius: 3px;
    padding: 6px 10px 7px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}

.map-scale-labels {
    display: flex;
    justify-content: space-between;
    margin-bottom: 4px;
    color: var(--ink-2);
    font-family: var(--font-display);
    font-style: italic;
    font-size: 11px;
    line-height: 1;
}

.map-scale-rule {
    display: flex;
    align-items: flex-end;
    width: 100px;
}

.map-scale-tick {
    width: 1.5px;
    height: 9px;
    background: var(--ink-2);
    flex-shrink: 0;
}

.map-scale-seg {
    flex: 1;
    height: 6px;
}

.map-scale-filled {
    background: var(--ink-2);
}

.map-scale-empty {
    border-top: 1.5px solid var(--ink-2);
    border-bottom: 1.5px solid var(--ink-2);
}
</style>
