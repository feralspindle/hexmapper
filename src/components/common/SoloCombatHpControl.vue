<template>
  <div class="hp-control" :class="{ low: max > 0 && current / max <= .25 }">
    <button title="Damage" @click="$emit('adjust', -1)">−</button>
    <span><strong>{{ current }}</strong>/{{ max }}</span>
    <button title="Heal" @click="$emit('adjust', 1)">+</button>
  </div>
</template>

<script setup>
defineProps({ current: { type: Number, required: true }, max: { type: Number, required: true } })
defineEmits(['adjust'])
</script>

<style scoped>
.hp-control { display: flex; align-items: center; flex: 0 0 auto; border: 1px solid var(--rule-strong); background: var(--paper); }
.hp-control button { width: 24px; height: 25px; border: 0; background: transparent; color: var(--ink-mute); font-size: 15px; }.hp-control button:hover { color: var(--accent); }
.hp-control span { min-width: 43px; text-align: center; font: 10px var(--font-mono); }.hp-control strong { font-size: 13px; color: var(--ink); }.hp-control.low strong { color: #a32727; }
</style>
