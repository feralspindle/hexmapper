<template>
  <Teleport to="body">
    <div
      v-if="state.visible"
      class="fixed inset-0 z-50 flex items-center justify-center"
    >
      <div class="absolute inset-0 bg-black/60" @click="cancel" />
      <div class="relative bg-stone-950 border-2 border-stone-600 p-5 shadow-[4px_4px_0_rgba(0,0,0,0.6)] w-72 flex flex-col gap-4">
        <p class="text-parchment-200 text-sm text-center font-body">{{ state.message }}</p>
        <div class="flex gap-2 justify-center">
          <button
            class="px-4 py-1.5 border border-stone-600 text-sm text-stone-300 bg-stone-800 hover:bg-stone-700 transition-colors font-display tracking-wide"
            data-testid="confirm-cancel"
            @click="cancel"
          >
            Cancel
          </button>
          <button
            class="px-4 py-1.5 border text-sm transition-colors font-display tracking-wide"
            :class="state.confirmClass"
            data-testid="confirm-accept"
            @click="accept"
          >
            <i v-if="state.confirmIcon" :class="[state.confirmIcon, 'mr-1']" />{{ state.confirmLabel }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { useConfirmDialog } from '@/composables/useConfirmDialog.js'

const { state, accept, cancel } = useConfirmDialog()
</script>
