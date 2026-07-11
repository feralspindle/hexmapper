<template>
    <header class="ds-topbar">
        <TopbarBrand />

        <div class="ds-divider" />

        <MapBreadcrumb
            show-when-empty
            :leaf="dungeonStore.dungeon?.name ?? 'Unnamed Dungeon'"
            :terminal-max-width="160"
            @navigate="goToMap"
        />

        <div class="ds-divider" />

        <SessionTorchTimer />

        <div style="flex: 1" />

        <TopbarPresence />

        <CharacterPicker />

        <CharacterSheetButton :char-open="charOpen" @toggle-char="emit('toggle-char')" />

        <ShareModal :session-id="sessionStore.sessionId" />

        <BugReportButton />

        <TopbarUserBlock>
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
        </TopbarUserBlock>
    </header>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted } from "vue";
import { useRouter, useRoute } from "vue-router";
import { useSessionStore } from "@/stores/sessionStore.js";
import { useMapStore } from "@/stores/mapStore.js";
import { useD } from "@/stores/dungeonStore.js";
import SessionTorchTimer from "@/components/common/SessionTorchTimer.vue";
import CharacterPicker from "@/components/common/CharacterPicker.vue";
import ShareModal from "@/components/common/ShareModal.vue";
import BugReportButton from "@/components/common/BugReportButton.vue";
import DungeonTweaksPanel from "@/components/dungeon/DungeonTweaksPanel.vue";
import TopbarBrand from "@/components/common/TopbarBrand.vue";
import TopbarPresence from "@/components/common/TopbarPresence.vue";
import TopbarUserBlock from "@/components/common/TopbarUserBlock.vue";
import CharacterSheetButton from "@/components/common/CharacterSheetButton.vue";
import MapBreadcrumb from "@/components/common/MapBreadcrumb.vue";
import { activeNavDropdown } from "@/composables/useNavDropdown.js";

defineProps({
    dungeonId: String,
    charOpen: { type: Boolean, default: false },
});
const emit = defineEmits(["toggle-char"]);

const router = useRouter();
const route = useRoute();
const sessionStore = useSessionStore();
const mapStore = useMapStore();
const dungeonStore = useD();

const settingsOpen = ref(false);
const settingsWrapEl = ref(null);

function goToMap(mapId) {
    if (mapId && sessionStore.isGM) mapStore.setActiveMap(mapId);
    router.push({
        name: "hex-map",
        params: { sessionId: route.params.sessionId },
    });
}

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
