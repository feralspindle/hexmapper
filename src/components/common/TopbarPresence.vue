<template>
    <div class="ds-presence">
        <div
            v-for="user in visibleOnlineUsers"
            :key="user.user_id ?? user._clientId"
            class="ds-avatar"
            :style="{
                '--player-color': playerColorFor(
                    user.user_id ?? user._clientId,
                ),
            }"
            v-tooltip.bottom="user.display_name"
        >
            <img
                v-if="user.avatar_url"
                :src="user.avatar_url"
                :alt="user.display_name"
                style="
                    width: 100%;
                    height: 100%;
                    border-radius: 50%;
                    object-fit: cover;
                "
            />
            <span v-else>{{
                user.display_name?.charAt(0)?.toUpperCase()
            }}</span>
            <div class="ds-status-dot" />
        </div>
        <span v-if="visibleOnlineUsers.length" class="hm-presence-count">
            {{ visibleOnlineUsers.length }} online
        </span>
    </div>
</template>

<script setup>
import { computed } from "vue";
import { useSessionStore } from "@/stores/sessionStore.js";
import { playerColorFor } from "@/composables/usePlayerColor.js";

const sessionStore = useSessionStore();
const visibleOnlineUsers = computed(() => sessionStore.onlineUsers.slice(0, 6));
</script>
