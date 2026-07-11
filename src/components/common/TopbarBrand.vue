<template>
    <RouterLink
        to="/"
        class="ds-brand"
        style="flex-shrink: 0; text-decoration: none"
    >
        <svg
            class="ds-brand-mark"
            width="28"
            height="28"
            viewBox="0 0 32 32"
            xmlns="http://www.w3.org/2000/svg"
        >
            <rect width="32" height="32" rx="6" fill="#1c1917" />
            <polygon
                points="16,3.5 27.5,9.75 27.5,22.25 16,28.5 4.5,22.25 4.5,9.75"
                fill="#1c1917"
                stroke="#d4a74b"
                stroke-width="2"
                stroke-linejoin="round"
            />
            <circle cx="16" cy="16" r="2" fill="#d4a74b" />
        </svg>
        Hex Mapper
    </RouterLink>
</template>

<script setup>
import { RouterLink } from "vue-router";
</script>
