<template>
    <div
        class="dungeon-scribe"
        data-testid="hex-map-view"
        :data-density="prefs.density"
        :data-palette="prefs.palette"
    >
        <HexTopbar
            :hex-mode="hexMode"
            :char-open="charOpen"
            @switch-mode="onSwitchMode"
            @toggle-char="charOpen = !charOpen"
        />

        <div v-if="mapsBlocked" class="hm-setup-bg">
            <div
                data-testid="maps-blocked"
                style="
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 14px;
                    padding: 28px 32px;
                    background: var(--paper, #ede1c7);
                    border: 1px solid var(--rule, #c9b990);
                    border-radius: 4px;
                    max-width: 380px;
                    text-align: center;
                "
            >
                <span
                    style="
                        font-family: var(--font-display);
                        font-size: 14px;
                        color: var(--ink, #1a1410);
                    "
                    >Couldn't load this session's maps</span
                >
                <span
                    style="
                        font-family: var(--font-mono);
                        font-size: 11px;
                        line-height: 1.5;
                        color: var(--ink-mute, #6b5d49);
                    "
                    >Nothing has been changed. This is usually temporary —
                    try again in a moment.</span
                >
                <button class="ds-btn" @click="bootstrapMaps">Retry</button>
            </div>
        </div>

        <div v-else-if="showModePicker" class="hm-setup-bg">
            <HexModePicker @pick-fow="onPickFow" @pick-blank="onPickBlank" />
        </div>

        <div v-else class="hm-body" :class="{ 'hm-body--player-hex': hexMode && !sessionStore.isGM }">
            <HexLeftToolbar
                v-if="hexMode && sessionStore.isGM"
                :hex-mode="hexMode"
                :active-tool="activeTool"
                :settings-open="showMapSettings"
                :is-g-m="sessionStore.isGM"
                :exploration-available="sessionStore.playMode === 'gm_less'"
                :exploration-mode="mapStore.mapExplorationMode"
                @tool="setTool"
                @reveal-all="hexStore.revealAll()"
                @hide-all="hexStore.hideAll()"
                @map-settings="showMapSettings = !showMapSettings"
                @toggle-exploration="
                    mapStore.setExplorationMode(!mapStore.mapExplorationMode)
                "
            />
            <div v-else-if="!hexMode" style="width: var(--toolbar-w, 64px); flex-shrink: 0" />
            <div v-else />

            <div
                class="hm-canvas-area"
                data-testid="hex-canvas"
                :class="{ 'mode-blank': hexMode === 'blank' }"
                :data-tool="activeTool"
            >
                <HexGrid
                    ref="hexGridEl"
                    :session-id="sessionId"
                    :is-g-m="sessionStore.isGM"
                    :fog-mode="hexMode === 'fow'"
                    :image-mode="
                        hexMode === 'fow' && mapStore.mapType === 'image'
                    "
                    :map-image-url="mapStore.activeMapImageUrl"
                    :map-hex-width="mapStore.mapHexWidth"
                    :map-hex-height="mapStore.mapHexHeight"
                    :map-image-rotation="mapStore.mapImageRotation"
                    :map-grid-rotation="mapStore.mapGridRotation"
                    :map-image-offset-x="mapStore.mapImageOffsetX"
                    :map-image-offset-y="mapStore.mapImageOffsetY"
                    :map-grid-offset-x="mapStore.mapGridOffsetX"
                    :map-grid-offset-y="mapStore.mapGridOffsetY"
                    :map-image-scale="mapStore.mapImageScale"
                    :map-grid-cols="mapStore.mapGridCols"
                    :map-grid-rows="mapStore.mapGridRows"
                    :map-fog-reveal-all="
                        hexMode === 'blank' || mapStore.mapFogRevealAll
                    "
                    :exploration-mode="
                        sessionStore.playMode === 'gm_less' &&
                        mapStore.mapExplorationMode
                    "
                    :pan-mode="activeTool === 'pan'"
                    :move-mode="moveMode"
                    :settings-open="showMapSettings"
                    style="position: absolute; inset: 0"
                    @hex-click="onHexClick"
                    @hex-context="onHexContext"
                    @image-offset-change="onImageOffsetChange"
                    @grid-offset-change="onGridOffsetChange"
                    @grid-dims="gridDims = $event"
                />

                <MapScale
                    :scale="mapStore.mapScale"
                    :unit="mapStore.mapScaleUnit"
                />

                <HexLeftToolbar
                    v-if="hexMode && !sessionStore.isGM"
                    :floating="true"
                    :hex-mode="hexMode"
                    :active-tool="activeTool"
                    @tool="setTool"
                />

                <MapImageSettings
                    v-if="showMapSettings && sessionStore.isGM"
                    :hex-mode="hexMode"
                    :effective-cols="gridDims.cols"
                    :effective-rows="gridDims.rows"
                    v-model:move-mode="moveMode"
                    @close="showMapSettings = false"
                />

                <div class="hm-zoom">
                    <button
                        class="hm-zoom-btn"
                        title="Zoom in"
                        @click="hexGridEl?.zoomIn()"
                    >
                        +
                    </button>
                    <button
                        class="hm-zoom-btn"
                        title="Reset zoom"
                        @click="hexGridEl?.resetZoom()"
                        style="font-size: 9px; letter-spacing: 0.02em"
                    >
                        1:1
                    </button>
                    <button
                        class="hm-zoom-btn"
                        title="Zoom out"
                        @click="hexGridEl?.zoomOut()"
                    >
                        −
                    </button>
                </div>

                <HexBottomBar
                    v-if="hexMode === 'blank'"
                    :active-tool="activeTool"
                    :active-terrain="activeTerrain"
                    :active-marker-color="activeMarkerColor"
                    @terrain="activeTerrain = $event"
                    @marker-color="activeMarkerColor = $event"
                />

                <DiceRollToast />
                <LuckTokenToast />
                <QuestCompleteToast />
                <LootDealToast />
                <ChatToast />
                <JoinToast />
                <PartyFollowBanner />
            </div>

            <SessionRightPanel :inspector="HexInspectorSection" :selected="hexStore.selectedHex" />
        </div>

        <PhotoBroadcastModal v-if="photoStore.currentBroadcast" />
        <WelcomeModal v-if="showWelcome" @close="showWelcome = false" />
        <ConfirmDialog />

        <CharacterDrawer
            parchment
            :open="charOpen"
            :nav-height="48"
            @close="charOpen = false"
        />

        <DungeonPartyPanel v-if="!showModePicker" />
        <PartyNotebook v-if="!showModePicker" :session-id="sessionId" />

    </div>
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from "vue";
import { useRoute } from "vue-router";
import { useAuthStore } from "@/stores/authStore.js";
import { useSessionStore } from "@/stores/sessionStore.js";
import { useMapStore } from "@/stores/mapStore.js";
import { useHexStore } from "@/stores/hexStore.js";
import { useDiceStore } from "@/stores/diceStore.js";
import { useCharacterStore } from "@/stores/characterStore.js";
import { useChatStore } from "@/stores/chatStore.js";
import { useOracleStore } from "@/stores/oracleStore.js";
import { usePhotoStore } from "@/stores/photoStore.js";
import { useUserPrefsStore } from "@/stores/userPrefsStore.js";
import HexTopbar from "@/components/hex/HexTopbar.vue";
import HexModePicker from "@/components/hex/HexModePicker.vue";
import HexLeftToolbar from "@/components/hex/HexLeftToolbar.vue";
import SessionRightPanel from "@/components/common/SessionRightPanel.vue";
import HexInspectorSection from "@/components/hex/HexInspectorSection.vue";
import HexGrid from "@/components/hex/HexGrid.vue";
import MapImageSettings from "@/components/hex/MapImageSettings.vue";
import ConfirmDialog from "@/components/common/ConfirmDialog.vue";
import DiceRollToast      from "@/components/common/DiceRollToast.vue";
import LuckTokenToast     from "@/components/common/LuckTokenToast.vue";
import QuestCompleteToast from "@/components/common/QuestCompleteToast.vue";
import LootDealToast      from "@/components/common/LootDealToast.vue";
import ChatToast from "@/components/common/ChatToast.vue";
import JoinToast from "@/components/common/JoinToast.vue";
import PartyFollowBanner from "@/components/common/PartyFollowBanner.vue";
import PhotoBroadcastModal from "@/components/common/PhotoBroadcastModal.vue";
import WelcomeModal from "@/components/common/WelcomeModal.vue";
import CharacterDrawer from "@/components/common/CharacterDrawer.vue";
import DungeonPartyPanel from "@/components/common/DungeonPartyPanel.vue";
import PartyNotebook       from "@/components/common/PartyNotebook.vue";

import HexBottomBar from "@/components/hex/HexBottomBar.vue";
import MapScale from "@/components/hex/MapScale.vue";
import { mapBootstrapAction } from "@/lib/mapBootstrap.js";

const hexGridEl = ref(null);
const gridDims = ref({ cols: null, rows: null });
const charOpen = ref(false);
const showMapSettings = ref(false);
const moveMode = ref("none");
const showWelcome = ref(false);

const hexMode = ref(null);
const showModePicker = ref(false);
const activeTool = ref("select");
const activeTerrain = ref("plains");
const activeMarkerColor = ref("town");

const route = useRoute();
const sessionId = route.params.sessionId;

const authStore = useAuthStore();
const sessionStore = useSessionStore();
const mapStore = useMapStore();
const hexStore = useHexStore();
const diceStore = useDiceStore();
const chatStore = useChatStore();
const oracleStore = useOracleStore();
const characterStore = useCharacterStore();
const photoStore = usePhotoStore();
const prefs = useUserPrefsStore();

const modeKey = computed(() => `hex_mode_${sessionId}`);

function syncOracleStore() {
    if (sessionStore.playMode === "gm_less") {
        oracleStore.init(sessionId);
    } else {
        oracleStore.cleanup();
    }
}

function loadMode() {
    if (sessionStore.isGM) {
        const saved = localStorage.getItem(modeKey.value);
        if (saved === "fow" || saved === "blank") {
            hexMode.value = saved;
            showModePicker.value = false;
            if (sessionStore.hexMode !== saved) sessionStore.setHexMode(saved);
        } else if (sessionStore.hexMode) {
            hexMode.value = sessionStore.hexMode;
            showModePicker.value = false;
        } else {
            showModePicker.value = true;
        }
    } else {
        hexMode.value = sessionStore.hexMode ?? "fow";
        showModePicker.value = false;
    }
}

function onSwitchMode() {
    if (!sessionStore.isGM) return;
    hexMode.value = null;
    showModePicker.value = true;
    showMapSettings.value = false;
    localStorage.removeItem(modeKey.value);
    activeTool.value = "select";
}

async function onPickFow(file) {
    showModePicker.value = false;
    hexMode.value = "fow";
    localStorage.setItem(modeKey.value, "fow");
    activeTool.value = "select";
    await sessionStore.setHexMode("fow");
    await mapStore.setFogRevealAll(false);
    if (file) {
        try {
            const path = await mapStore.uploadMapImage(file);
            await mapStore.updateActiveMap({
                mapImagePath: path,
                mapType: "image",
            });
        } catch (e) {
            console.error("Map upload failed:", e.message);
        }
    }
}

async function onPickBlank() {
    showModePicker.value = false;
    hexMode.value = "blank";
    localStorage.setItem(modeKey.value, "blank");
    activeTool.value = "select";
    await sessionStore.setHexMode("blank");
    await mapStore.setFogRevealAll(true);
}

function setTool(tool) {
    activeTool.value = tool;
}

function onKeyDown(e) {
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
    const key = e.key.toUpperCase();
    if (key === "V") setTool("select");
    else if (key === "H") setTool("pan");
    else if (key === "R" && hexMode.value === "fow") setTool("reveal");
    else if (key === "X" && hexMode.value === "fow") setTool("hide");
    else if (key === "T" && hexMode.value === "blank") setTool("paint");
    else if (key === "M" && hexMode.value === "blank") setTool("marker");
    else if (key === "E" && hexMode.value === "blank") setTool("erase");
}

watch(
    () => sessionStore.hexMode,
    (newMode) => {
        if (!sessionStore.isGM && newMode && newMode !== hexMode.value) {
            hexMode.value = newMode;
        }
    },
);

watch(
    () => mapStore.maps.length,
    (newLen, oldLen) => {
        if (oldLen === 0 && newLen > 0 && sessionStore.isGM) {
            showMapSettings.value = true;
        }
    },
);

watch(
    () => sessionStore.activeMapId,
    async (newId) => {
        if (newId) {
            moveMode.value = "none";
            await hexStore.init(sessionId, newId);
        }
    },
);

const mapsBlocked = ref(false);

async function bootstrapMaps() {
    mapsBlocked.value = false;
    const mapsLoaded = await mapStore.init(sessionId);
    const action = mapBootstrapAction({
        mapsLoaded,
        mapsCount: mapStore.maps.length,
        activeMapId: sessionStore.activeMapId,
        isGM: sessionStore.isGM,
    });
    if (action === "blocked") {
        mapsBlocked.value = true;
    } else if (action === "create") {
        const map = await mapStore.createMap({
            name: "World Map",
            mapType: "hex",
        });
        if (map) await mapStore.setActiveMap(map.id);
    } else if (action === "adopt_first") {
        await mapStore.setActiveMap(mapStore.maps[0].id);
    } else if (action === "init") {
        await hexStore.init(sessionId, sessionStore.activeMapId);
    }
}

onMounted(async () => {
    await prefs.load();
    if (sessionStore.sessionId !== sessionId) {
        await sessionStore.joinSession(sessionId);
    }
    await bootstrapMaps();

    diceStore.init(sessionId);
    chatStore.init(sessionId);
    syncOracleStore();
    characterStore.loadAll(sessionId);
    sessionStore.initPresence(sessionId);
    photoStore.init(sessionId);

    if (!authStore.user?.user_metadata?.welcome_seen) showWelcome.value = true;

    loadMode();
    await nextTick();
    if (hexStore.partyHex) {
        hexGridEl.value?.centerOnHex(hexStore.partyHex.q, hexStore.partyHex.r);
    }
    window.addEventListener("keydown", onKeyDown);
});

watch(() => sessionStore.playMode, syncOracleStore);

onUnmounted(() => {
    hexStore.cleanup();
    characterStore.cleanup();
    chatStore.cleanup();
    oracleStore.cleanup();
    mapStore.cleanup();
    sessionStore.cleanup();
    window.removeEventListener("keydown", onKeyDown);
});

function onHexClick(q, r) {
    if (hexMode.value === "fow") {
        if (activeTool.value === "reveal") {
            hexStore.upsertHex(q, r, { revealed: true });
        } else if (activeTool.value === "hide") {
            hexStore.upsertHex(q, r, { revealed: false });
        } else {
            hexStore.selectHex(q, r);
        }
    } else if (hexMode.value === "blank") {
        if (activeTool.value === "paint") {
            hexStore.upsertHex(q, r, { terrain_type: activeTerrain.value });
        } else if (activeTool.value === "marker") {
            hexStore.addMarker(q, r, activeMarkerColor.value);
            hexStore.selectHex(q, r);
        } else if (activeTool.value === "erase") {
            hexStore.deleteHex(q, r);
        } else {
            hexStore.selectHex(q, r);
        }
    }
}

function onHexContext(q, r) {
    hexStore.selectHex(q, r);
}

async function onImageOffsetChange(x, y) {
    await mapStore.updateActiveMap({ mapImageOffsetX: x, mapImageOffsetY: y });
}

async function onGridOffsetChange(x, y) {
    await mapStore.updateActiveMap({ mapGridOffsetX: x, mapGridOffsetY: y });
}
</script>
