<template>
    <header class="ds-topbar">
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

        <div class="ds-divider" />

        <nav
            :title="fullBreadcrumbPath"
            style="
                display: flex;
                align-items: center;
                gap: 4px;
                font-family: var(--font-mono);
                font-size: 10px;
                letter-spacing: 0.04em;
                color: rgba(237, 225, 199, 0.45);
                min-width: 0;
                overflow: hidden;
            "
        >
            <template
                v-for="(segment, i) in visibleAncestors"
                :key="segment.id ?? segment.ellipsis"
            >
                <span v-if="i > 0" style="opacity: 0.4; flex-shrink: 0">/</span>
                <span
                    v-if="segment.ellipsis"
                    style="opacity: 0.4; flex-shrink: 0"
                    >…</span
                >
                <button
                    v-else
                    style="
                        background: none;
                        border: none;
                        cursor: pointer;
                        color: rgba(237, 225, 199, 0.55);
                        font-family: var(--font-mono);
                        font-size: 10px;
                        letter-spacing: 0.04em;
                        padding: 0;
                        max-width: 120px;
                        overflow: hidden;
                        text-overflow: ellipsis;
                        white-space: nowrap;
                        flex-shrink: 1;
                    "
                    @click="goToMap(segment.id)"
                >
                    {{ segment.name }}
                </button>
            </template>
            <span
                v-if="visibleAncestors.length"
                style="opacity: 0.4; flex-shrink: 0"
                >/</span
            >
            <button
                style="
                    background: none;
                    border: none;
                    cursor: pointer;
                    color: rgba(237, 225, 199, 0.55);
                    font-family: var(--font-mono);
                    font-size: 10px;
                    letter-spacing: 0.04em;
                    padding: 0;
                    max-width: 120px;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                    flex-shrink: 1;
                "
                @click="goToMap(mapStore.activeMap?.id)"
            >
                {{ mapStore.activeMap?.name }}
            </button>
            <span style="opacity: 0.4; flex-shrink: 0">/</span>
            <span
                style="
                    color: rgba(237, 225, 199, 0.8);
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    max-width: 160px;
                    flex-shrink: 1;
                "
                >{{ dungeonStore.dungeon?.name ?? "Unnamed Dungeon" }}</span
            >
        </nav>

        <div class="ds-divider" />

        <SessionTorchTimer />

        <div style="flex: 1" />

        <div class="ds-presence">
            <div
                v-for="user in visibleOnlineUsers"
                :key="user.user_id ?? user._clientId"
                class="ds-avatar"
                :style="{
                    '--player-color': playerColor(
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

        <CharacterPicker />

        <button
            class="ds-tb-btn"
            :class="{ active: charOpen }"
            title="Character sheet"
            @click="emit('toggle-char')"
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

        <ShareModal :session-id="sessionStore.sessionId" />

        <BugReportButton />

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

            <div
                ref="settingsWrapEl"
                class="ds-tb-settings-dropdown"
                style="
                    position: relative;
                    align-self: stretch;
                    display: flex;
                    align-items: center;
                "
            >
                <button
                    class="ds-tb-btn"
                    :class="{ active: settingsOpen }"
                    title="Display settings"
                    @click="settingsOpen = !settingsOpen"
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
                        <circle cx="12" cy="12" r="3" />
                        <path
                            d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"
                        />
                    </svg>
                </button>
                <DungeonTweaksPanel
                    v-if="settingsOpen"
                    @close="settingsOpen = false"
                />
            </div>
        </div>
    </header>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from "vue";
import { RouterLink, useRouter, useRoute } from "vue-router";
import { useSessionStore } from "@/stores/sessionStore.js";
import { useAuthStore } from "@/stores/authStore.js";
import { useMapStore } from "@/stores/mapStore.js";
import { useD } from "@/stores/dungeonStore.js";
import SessionTorchTimer from "@/components/common/SessionTorchTimer.vue";
import CharacterPicker from "@/components/common/CharacterPicker.vue";
import ShareModal from "@/components/common/ShareModal.vue";
import BugReportButton from "@/components/common/BugReportButton.vue";
import DungeonTweaksPanel from "@/components/dungeon/DungeonTweaksPanel.vue";
import { playerColorFor } from "@/composables/usePlayerColor.js";
import { activeNavDropdown } from "@/composables/useNavDropdown.js";

const props = defineProps({
    dungeonId: String,
    charOpen: { type: Boolean, default: false },
});
const emit = defineEmits(["toggle-char"]);

const router = useRouter();
const route = useRoute();
const sessionStore = useSessionStore();
const authStore = useAuthStore();
const mapStore = useMapStore();
const dungeonStore = useD();

const settingsOpen = ref(false);
const avatarErr = ref(false);
const settingsWrapEl = ref(null);

const visibleAncestors = computed(() => {
    const chain = mapStore.ancestorChain();
    if (chain.length <= 2) return chain;
    return [chain[0], { ellipsis: true }, chain[chain.length - 1]];
});

const fullBreadcrumbPath = computed(() => {
    const parts = mapStore.ancestorChain().map((a) => a.name);
    parts.push(mapStore.activeMap?.name ?? "");
    parts.push(dungeonStore.dungeon?.name ?? "Unnamed Dungeon");
    return parts.join(" / ");
});

function goToMap(mapId) {
    if (mapId) mapStore.navigateLocal(mapId);
    router.push({
        name: "hex-map",
        params: { sessionId: route.params.sessionId },
    });
}

function playerColor(userId) {
    return playerColorFor(userId);
}

const visibleOnlineUsers = computed(() => sessionStore.onlineUsers.slice(0, 6));

watch(settingsOpen, (val) => {
    if (val) activeNavDropdown.value = "settings";
    else if (activeNavDropdown.value === "settings")
        activeNavDropdown.value = null;
});
watch(activeNavDropdown, (val) => {
    if (val !== null && val !== "settings") settingsOpen.value = false;
});

function onDocClick(e) {
    if (
        settingsOpen.value &&
        settingsWrapEl.value &&
        !settingsWrapEl.value.contains(e.target)
    ) {
        settingsOpen.value = false;
    }
}

onMounted(() => document.addEventListener("mousedown", onDocClick));
onUnmounted(() => document.removeEventListener("mousedown", onDocClick));
</script>
