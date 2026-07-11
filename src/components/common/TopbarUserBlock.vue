<template>
    <div
        style="
            display: flex;
            align-items: center;
            padding-left: 10px;
            border-left: 1px solid rgba(237, 225, 199, 0.15);
            gap: 8px;
            flex-shrink: 0;
        "
    >
        <img
            v-if="authStore.avatarUrl && !avatarErr"
            :src="authStore.avatarUrl"
            :alt="authStore.displayName"
            style="
                width: 24px;
                height: 24px;
                border-radius: 50%;
                object-fit: cover;
                border: 1px solid rgba(237, 225, 199, 0.25);
                flex-shrink: 0;
            "
            @error="avatarErr = true"
        />
        <div
            v-else
            style="
                width: 24px;
                height: 24px;
                border-radius: 50%;
                background: var(--accent);
                display: flex;
                align-items: center;
                justify-content: center;
                font-family: var(--font-display);
                font-size: 12px;
                color: var(--paper);
                flex-shrink: 0;
            "
        >
            {{ authStore.displayName?.charAt(0)?.toUpperCase() }}
        </div>

        <span
            style="
                font-family: var(--font-display);
                font-size: 12px;
                color: rgba(237, 225, 199, 0.75);
                max-width: 100px;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            "
        >
            {{ authStore.displayName }}
        </span>

        <slot />
    </div>
</template>

<script setup>
import { ref } from "vue";
import { useAuthStore } from "@/stores/authStore.js";

const authStore = useAuthStore();
const avatarErr = ref(false);
</script>
