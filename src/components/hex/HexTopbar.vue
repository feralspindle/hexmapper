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
import { useMapBreadcrumb } from "@/composables/useMapBreadcrumb.js";

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

const { visibleAncestors, fullBreadcrumbPath } = useMapBreadcrumb();

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
