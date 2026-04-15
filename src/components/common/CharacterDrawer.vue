<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition-transform duration-200 ease-out"
      enter-from-class="-translate-y-full"
      enter-to-class="translate-y-0"
      leave-active-class="transition-transform duration-200 ease-in"
      leave-from-class="translate-y-0"
      leave-to-class="-translate-y-full"
    >
      <div
        v-if="open"
        class="fixed z-40 bg-stone-900 border-b border-l border-stone-700 shadow-2xl overflow-hidden flex flex-col"
        :style="drawerStyle"
      >

        <CharacterSheet class="flex-1 min-h-0" />
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { computed } from 'vue'
import CharacterSheet from './CharacterSheet.vue'

const props = defineProps({
  open: { type: Boolean, default: false },
  navHeight: { type: Number, default: 44 },
})
defineEmits(['close'])

const drawerStyle = computed(() => ({
  top: `${props.navHeight}px`,
  right: '18rem',
  width: '18rem',
  maxHeight: '70vh',
}))
</script>
