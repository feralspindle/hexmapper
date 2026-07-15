<template>
    <header class="ds-topbar">
        <TopbarBrand />

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
            <button
                class="hm-switch-btn"
                aria-label="Switch"
                @click="$emit('switch-mode')"
            >
                <span class="hm-switch-text">Switch</span>
                <svg
                    class="hm-switch-icon"
                    width="14"
                    height="14"
                    viewBox="0 0 14 14"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.5"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                >
                    <path d="M2 4.5h8.5M8.5 2l2.5 2.5L8.5 7" />
                    <path d="M12 9.5H3.5M5.5 12L3 9.5 5.5 7" />
                </svg>
            </button>
        </div>

        <MapBreadcrumb
            leading-gap
            :navigable="sessionStore.isGM"
            @navigate="mapStore.setActiveMap"
        />

        <div style="flex: 1" />

        <TopbarPresence />

        <SessionTorchTimer />

        <CharacterPicker />

        <CharacterSheetButton :char-open="charOpen" @toggle-char="$emit('toggle-char')" />

        <ShareModal :session-id="sessionStore.sessionId" />
        <BugReportButton />

        <TopbarUserBlock>
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
        </TopbarUserBlock>
    </header>
</template>

<script setup>
import { ref, nextTick } from "vue";
import { useSessionStore } from "@/stores/sessionStore.js";
import { useAuthStore } from "@/stores/authStore.js";
import { useMapStore } from "@/stores/mapStore.js";
import ShareModal from "@/components/common/ShareModal.vue";
import BugReportButton from "@/components/common/BugReportButton.vue";
import CharacterPicker from "@/components/common/CharacterPicker.vue";
import SessionTorchTimer from "@/components/common/SessionTorchTimer.vue";
import TopbarBrand from "@/components/common/TopbarBrand.vue";
import TopbarPresence from "@/components/common/TopbarPresence.vue";
import TopbarUserBlock from "@/components/common/TopbarUserBlock.vue";
import CharacterSheetButton from "@/components/common/CharacterSheetButton.vue";
import MapBreadcrumb from "@/components/common/MapBreadcrumb.vue";

defineProps({
    hexMode: { type: String, default: null },
    charOpen: { type: Boolean, default: false },
});

defineEmits(["switch-mode", "toggle-char"]);

const sessionStore = useSessionStore();
const authStore = useAuthStore();
const mapStore = useMapStore();

const editing = ref(false);
const nameInput = ref("");
const nameInputEl = ref(null);

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
