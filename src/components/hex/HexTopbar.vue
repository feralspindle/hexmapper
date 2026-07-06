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

        <div
            class="ds-session-name"
            style="cursor: default"
            @click="startEdit"
            v-if="!editing"
        >
            <span class="ds-ornament">✦</span>
            {{ sessionStore.sessionName }}
            <span class="ds-ornament">✦</span>
        </div>
        <input
            v-else
            ref="nameInputEl"
            v-model="nameInput"
            class="hm-session-edit"
            @blur="commitName"
            @keyup.enter="commitName"
            @keyup.escape="cancelEdit"
        />

        <div
            v-if="hexMode && sessionStore.isGM"
            class="hm-mode-badge"
            :data-mode="hexMode"
        >
            <span class="hm-mode-label">{{
                hexMode === "fow" ? "Fog of War" : "Blank Slate"
            }}</span>
            <button class="hm-switch-btn" @click="$emit('switch-mode')">
                Switch
            </button>
        </div>

        <nav
            v-if="visibleAncestors.length"
            :title="fullBreadcrumbPath"
            style="
                display: flex;
                align-items: center;
                gap: 4px;
                margin-left: 8px;
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
                    v-else-if="sessionStore.isGM"
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
                    data-testid="map-breadcrumb"
                    @click="mapStore.setActiveMap(segment.id)"
                >
                    {{ segment.name }}
                </button>
                <span
                    v-else
                    style="
                        color: rgba(237, 225, 199, 0.55);
                        max-width: 120px;
                        overflow: hidden;
                        text-overflow: ellipsis;
                        white-space: nowrap;
                        flex-shrink: 1;
                    "
                >
                    {{ segment.name }}
                </span>
            </template>
            <span style="opacity: 0.4; flex-shrink: 0">/</span>
            <span
                style="
                    color: rgba(237, 225, 199, 0.8);
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    max-width: 140px;
                    flex-shrink: 1;
                "
                data-testid="active-map-name"
                >{{ mapStore.activeMap?.name }}</span
            >
        </nav>

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

        <SessionTorchTimer />

        <CharacterPicker />

        <button
            class="ds-tb-btn"
            :class="{ active: charOpen }"
            title="Character sheet"
            data-testid="char-sheet-toggle"
            @click="$emit('toggle-char')"
        >
            <svg
                width="13"
                height="13"
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
            <span>Sheet</span>
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
                "
            >
                {{ authStore.displayName?.charAt(0)?.toUpperCase() }}
            </div>
            <span
                style="
                    font-family: var(--font-display);
                    font-size: 12px;
                    color: rgba(237, 225, 199, 0.7);
                    max-width: 80px;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                "
            >
                {{ authStore.displayName }}
            </span>
            <button
                style="
                    background: none;
                    border: none;
                    color: rgba(237, 225, 199, 0.45);
                    font-size: 16px;
                    cursor: pointer;
                    padding: 0;
                    line-height: 1;
                "
                title="Sign out"
                @click="authStore.signOut()"
            >
                &times;
            </button>
        </div>
    </header>
</template>

<script setup>
import { ref, computed, nextTick } from "vue";
import { RouterLink } from "vue-router";
import { useSessionStore } from "@/stores/sessionStore.js";
import { useAuthStore } from "@/stores/authStore.js";
import { useMapStore } from "@/stores/mapStore.js";
import { playerColorFor } from "@/composables/usePlayerColor.js";
import ShareModal from "@/components/common/ShareModal.vue";
import BugReportButton from "@/components/common/BugReportButton.vue";
import CharacterPicker from "@/components/common/CharacterPicker.vue";
import SessionTorchTimer from "@/components/common/SessionTorchTimer.vue";

const props = defineProps({
    hexMode: { type: String, default: null },
    charOpen: { type: Boolean, default: false },
});

const emit = defineEmits(["switch-mode", "toggle-char"]);

const sessionStore = useSessionStore();
const authStore = useAuthStore();
const mapStore = useMapStore();

const editing = ref(false);
const nameInput = ref("");
const nameInputEl = ref(null);
const avatarErr = ref(false);

function playerColor(userId) {
    return playerColorFor(userId);
}

const visibleOnlineUsers = computed(() => sessionStore.onlineUsers.slice(0, 6));

const visibleAncestors = computed(() => {
    const chain = mapStore.ancestorChain();
    if (chain.length <= 2) return chain;
    return [chain[0], { ellipsis: true }, chain[chain.length - 1]];
});

const fullBreadcrumbPath = computed(() => {
    const parts = mapStore.ancestorChain().map((a) => a.name);
    parts.push(mapStore.activeMap?.name ?? "");
    return parts.join(" / ");
});

function startEdit() {
    nameInput.value = sessionStore.sessionName;
    editing.value = true;
    nextTick(() => nameInputEl.value?.focus());
}
function commitName() {
    editing.value = false;
    if (nameInput.value.trim())
        sessionStore.updateSessionName(nameInput.value.trim());
}
function cancelEdit() {
    editing.value = false;
}
</script>
