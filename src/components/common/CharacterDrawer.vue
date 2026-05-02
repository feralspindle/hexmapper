<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition-all duration-200 ease-out"
      enter-from-class="opacity-0 -translate-y-2"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition-all duration-150 ease-in"
      leave-from-class="opacity-100 translate-y-0"
      leave-to-class="opacity-0 -translate-y-2"
    >
      <div v-if="open" class="fixed z-40 overflow-hidden flex flex-col ds-char-drawer" :style="drawerStyle">
        <CharacterSheet class="flex-1 min-h-0" />
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { computed } from 'vue'
import CharacterSheet from './CharacterSheet.vue'

const HEX_MAP_THEME = {
  '--paper':      '#1c1917',
  '--paper-2':    '#292524',
  '--paper-3':    '#3c3835',
  '--paper-edge': '#57534e',
  '--ink':        '#f5f5f4',
  '--ink-2':      '#d6d3d1',
  '--ink-soft':   '#a8a29e',
  '--ink-mute':   '#78716c',
  '--rule':       'rgba(255,255,255,.08)',
  '--rule-strong':'rgba(255,255,255,.18)',
  '--accent':     '#dca85a',
  '--accent-2':   '#e8c488',
  '--accent-3':   '#86efac',
  '--font-body':  'ui-sans-serif, system-ui, sans-serif',
  '--font-zine':  'ui-monospace, monospace',
  '--font-mono':  'ui-monospace, monospace',
  '--font-ui':    'ui-sans-serif, system-ui, sans-serif',
}

const props = defineProps({
  open:      { type: Boolean, default: false },
  navHeight: { type: Number, default: 44 },
  parchment: { type: Boolean, default: false },
})
defineEmits(['close'])

const drawerStyle = computed(() => ({
  top: `${props.navHeight}px`,
  right: '18rem',
  width: '18rem',
  maxHeight: '70vh',
  ...(props.parchment ? {} : HEX_MAP_THEME),
}))
</script>

<style scoped>
.ds-char-drawer {
  background: var(--paper, #ede1c7);
  border-bottom: 1px solid var(--rule-strong, #c8baa0);
  border-left: 1px solid var(--rule-strong, #c8baa0);
  box-shadow: -4px 4px 24px rgba(0,0,0,.45);
}
</style>
