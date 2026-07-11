<template>
    <button
        class="ds-tb-btn"
        :class="{ active: charOpen }"
        title="Character sheet"
        data-testid="char-sheet-toggle"
        @click="$emit('toggle-char')"
    >
        <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
        >
            <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
            <circle cx="12" cy="7" r="4" />
        </svg>
        <span style="font-size: 13px">Sheet</span>
    </button>
</template>

<script setup>
defineProps({
    charOpen: { type: Boolean, default: false },
});
defineEmits(["toggle-char"]);
</script>
