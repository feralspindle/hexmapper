<template>
  <button
    class="w-full flex items-center gap-2 py-2.5 hover:bg-stone-700 transition-colors text-left group"
    :style="{ paddingLeft: `${12 + indent * 16}px`, paddingRight: '12px' }"
    @click="$emit('select')"
  >
    <span
      v-if="indent > 0"
      class="text-stone-600 shrink-0 select-none"
      style="font-size: 10px; margin-left: -4px"
    >↳</span>

    <span
      :title="map.id === sessionStore.activeMapId ? 'Live — players see this map' : ''"
      :class="[
        'w-2 h-2 rounded-full shrink-0 transition-colors',
        map.id === sessionStore.activeMapId ? 'bg-green-400' : 'bg-stone-600',
      ]"
    />

    <input
      v-if="renamingId === map.id"
      ref="renameInputEl"
      :value="renameDraft"
      class="flex-1 bg-stone-600 border border-parchment-500 rounded px-1.5 py-0.5 text-sm text-stone-100 focus:outline-none"
      @input="$emit('update-draft', $event.target.value)"
      @keydown.enter="$emit('commit-rename')"
      @keydown.escape="$emit('cancel-rename')"
      @blur="$emit('commit-rename')"
      @click.stop
    />
    <span v-else class="flex-1 text-sm text-stone-200 truncate">{{ map.name }}</span>

    <button
      v-if="renamingId !== map.id"
      class="opacity-0 group-hover:opacity-100 w-4 h-4 flex items-center justify-center text-stone-500 hover:text-stone-200 transition-colors shrink-0"
      title="Rename"
      @click.stop="$emit('start-rename')"
    >
      <i class="fa-solid fa-pencil text-[9px]" />
    </button>

    <button
      v-if="canDelete && renamingId !== map.id"
      class="opacity-0 group-hover:opacity-100 w-4 h-4 flex items-center justify-center text-stone-500 hover:text-red-400 transition-colors shrink-0"
      title="Delete map"
      @click.stop="$emit('delete')"
    >
      <i class="fa-solid fa-trash text-[9px]" />
    </button>
  </button>
</template>

<script setup>
import { useSessionStore } from '@/stores/sessionStore.js'

defineProps({
  map:         { type: Object,  required: true },
  renamingId:  { type: String,  default: null },
  renameDraft: { type: String,  default: '' },
  canDelete:   { type: Boolean, default: true },
  indent:      { type: Number,  default: 0 },
})

defineEmits(['select', 'start-rename', 'commit-rename', 'cancel-rename', 'update-draft', 'delete'])

const sessionStore = useSessionStore()
</script>
