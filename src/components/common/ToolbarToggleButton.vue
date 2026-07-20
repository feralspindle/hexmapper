<template>
  <button
    class="ds-tool"
    :data-testid="testid"
    :aria-pressed="pressed ? 'true' : 'false'"
    @click="onClick"
  >
    <svg :width="size" :height="size" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
      <template v-if="kind === 'party'">
        <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
      </template>
      <template v-else-if="kind === 'vault'">
        <path d="M3 9h18M3 9V7a1 1 0 011-1h16a1 1 0 011 1v2M3 9v9a1 1 0 001 1h16a1 1 0 001-1V9" />
        <path d="M10 13h4" />
      </template>
      <template v-else-if="kind === 'toolkit'">
        <path d="M11 4l1.6 4.8a2 2 0 001.3 1.3L18.7 12l-4.8 1.6a2 2 0 00-1.3 1.3L11 19.7l-1.6-4.8a2 2 0 00-1.3-1.3L3.3 12l4.8-1.6a2 2 0 001.3-1.3z" />
        <path d="M19 3v4M17 5h4" />
      </template>
      <template v-else-if="kind === 'sound'">
        <path d="M11 5L6 9H2v6h4l5 4V5z" />
        <template v-if="soundEnabled">
          <path d="M15.54 8.46a5 5 0 010 7.07" />
          <path d="M19.07 4.93a10 10 0 010 14.14" />
        </template>
        <template v-else>
          <line x1="23" y1="9" x2="17" y2="15" />
          <line x1="17" y1="9" x2="23" y2="15" />
        </template>
      </template>
    </svg>
    <span class="ds-tip">{{ tipText }}</span>
  </button>
</template>

<script setup>
import { computed } from 'vue'
import { usePartyToggles } from '@/composables/usePartyToggles.js'
import { soundEnabled, toggleSound } from '@/lib/soundSettings.js'

const props = defineProps({
  kind: { type: String, required: true },
  testid: { type: String, default: null },
  size: { type: Number, default: 18 },
})

const { partyVisible, toggleParty, vaultVisible, toggleVault, toolkitVisible, toggleToolkit } = usePartyToggles()

const pressed = computed(() => {
  if (props.kind === 'party') return partyVisible.value
  if (props.kind === 'vault') return vaultVisible.value
  if (props.kind === 'toolkit') return toolkitVisible.value
  return !soundEnabled.value
})

const tipText = computed(() => {
  if (props.kind === 'party') return 'Party panel'
  if (props.kind === 'vault') return 'Party vault'
  if (props.kind === 'toolkit') return 'Solo toolkit'
  return soundEnabled.value ? 'Mute sounds' : 'Unmute sounds'
})

function onClick() {
  if (props.kind === 'party') toggleParty()
  else if (props.kind === 'vault') toggleVault()
  else if (props.kind === 'toolkit') toggleToolkit()
  else toggleSound()
}
</script>
