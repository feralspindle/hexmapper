<template>
    <aside v-if="!floating" class="ds-toolbar" @mouseover="onHover" @mouseleave="onLeave">
        <div class="ds-tool-group">
            <span class="ds-tool-label">View</span>
            <button
                class="ds-tool"
                data-testid="hex-tool-select"
                :aria-pressed="activeTool === 'select'"
                @click="emit('tool', 'select')"
            >
                <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    stroke="none"
                >
                    <path d="M5 3l5 16 2.5-6.5L19 10z" />
                </svg>
                <span class="ds-tool-key">V</span>
                <span class="ds-tip">Select hex <kbd>V</kbd></span>
            </button>
            <button
                class="ds-tool"
                data-testid="hex-tool-pan"
                :aria-pressed="activeTool === 'pan'"
                @click="emit('tool', 'pan')"
            >
                <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.6"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                >
                    <path d="M9 11V5.5a1.5 1.5 0 013 0V11" />
                    <path d="M12 11V4a1.5 1.5 0 013 0v7" />
                    <path d="M15 11V5.5a1.5 1.5 0 013 0V14" />
                    <path
                        d="M9 11V8.5a1.5 1.5 0 00-3 0V15c0 3 2 6 6 6h2a4 4 0 004-4v-3"
                    />
                </svg>
                <span class="ds-tool-key">H</span>
                <span class="ds-tip">Pan map <kbd>H</kbd></span>
            </button>
            <button
                class="ds-tool"
                data-testid="hex-markers-visibility"
                :aria-pressed="!prefs.showHexMarkers"
                @click="prefs.setShowHexMarkers(!prefs.showHexMarkers)"
            >
                <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.6"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                >
                    <path
                        d="M12 2a6 6 0 00-6 6c0 5 6 12 6 12s6-7 6-12a6 6 0 00-6-6z"
                    />
                    <circle cx="12" cy="8" r="2.2" />
                    <path v-if="!prefs.showHexMarkers" d="M3 3l18 18" />
                </svg>
                <span class="ds-tip">{{ prefs.showHexMarkers ? 'Hide markers' : 'Show markers' }}</span>
            </button>
        </div>

        <template v-if="hexMode === 'fow' && isGM">
            <div class="ds-tool-group">
                <span class="ds-tool-label">Reveal</span>
                <button
                    class="ds-tool"
                    data-testid="hex-tool-reveal"
                    :aria-pressed="activeTool === 'reveal'"
                    @click="emit('tool', 'reveal')"
                >
                    <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="1.6"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                    >
                        <path
                            d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"
                        />
                        <circle cx="12" cy="12" r="3" />
                    </svg>
                    <span class="ds-tool-key">R</span>
                    <span class="ds-tip">Reveal hex <kbd>R</kbd></span>
                </button>
                <button
                    class="ds-tool danger"
                    data-testid="hex-tool-hide"
                    :aria-pressed="activeTool === 'hide'"
                    @click="emit('tool', 'hide')"
                >
                    <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="1.6"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                    >
                        <path d="M3 3l18 18" />
                        <path d="M10.6 10.6a3 3 0 004.2 4.2" />
                        <path
                            d="M9.9 4.2A10.5 10.5 0 0112 4c6.5 0 10 7 10 7a17 17 0 01-3.5 4.5M6.5 6.5A17 17 0 002 12s3.5 7 10 7c1.5 0 2.9-.4 4.2-1"
                        />
                    </svg>
                    <span class="ds-tool-key">X</span>
                    <span class="ds-tip">Hide hex <kbd>X</kbd></span>
                </button>
            </div>
            <div class="ds-tool-group">
                <span class="ds-tool-label">All</span>
                <button class="ds-tool" data-testid="hex-reveal-all" @click="emit('reveal-all')">
                    <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="1.6"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                    >
                        <circle cx="12" cy="12" r="4" />
                        <path
                            d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12"
                        />
                    </svg>
                    <span class="ds-tip">Reveal all hexes</span>
                </button>
                <button class="ds-tool danger" data-testid="hex-hide-all" @click="emit('hide-all')">
                    <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="1.6"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                    >
                        <path
                            d="M21 12.79A9 9 0 1111.21 3a7 7 0 009.79 9.79z"
                        />
                    </svg>
                    <span class="ds-tip">Hide all hexes</span>
                </button>
                <button
                    v-if="explorationAvailable"
                    class="ds-tool"
                    data-testid="hex-exploration-mode"
                    :aria-pressed="explorationMode"
                    @click="emit('toggle-exploration')"
                >
                    <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="1.6"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                    >
                        <polygon points="3 11 22 2 13 21 11 13 3 11" />
                    </svg>
                    <span class="ds-tip">Exploration mode — unentered hexes generate on arrival</span>
                </button>
            </div>
            <div class="ds-tool-group">
                <span class="ds-tool-label">Map</span>
                <button
                    class="ds-tool"
                    data-testid="hex-map-settings"
                    :aria-pressed="settingsOpen"
                    @click="emit('map-settings')"
                >
                    <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="1.6"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                    >
                        <circle cx="12" cy="12" r="3" />
                        <path
                            d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"
                        />
                    </svg>
                    <span class="ds-tip">Map image settings</span>
                </button>
            </div>
        </template>

        <template v-else-if="hexMode === 'blank'">
            <div v-if="isGM" class="ds-tool-group">
                <span class="ds-tool-label">Map</span>
                <button
                    class="ds-tool"
                    data-testid="hex-map-settings"
                    :aria-pressed="settingsOpen"
                    @click="emit('map-settings')"
                >
                    <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="1.6"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                    >
                        <circle cx="12" cy="12" r="3" />
                        <path
                            d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"
                        />
                    </svg>
                    <span class="ds-tip">Map settings</span>
                </button>
                <button
                    v-if="explorationAvailable"
                    class="ds-tool"
                    data-testid="hex-exploration-mode"
                    :aria-pressed="explorationMode"
                    @click="emit('toggle-exploration')"
                >
                    <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="1.6"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                    >
                        <polygon points="3 11 22 2 13 21 11 13 3 11" />
                    </svg>
                    <span class="ds-tip">Exploration mode — unentered hexes generate on arrival</span>
                </button>
            </div>
            <div class="ds-tool-group">
                <span class="ds-tool-label">Terrain</span>
                <button
                    class="ds-tool"
                    data-testid="hex-tool-paint"
                    :aria-pressed="activeTool === 'paint'"
                    @click="emit('tool', 'paint')"
                >
                    <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="1.6"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                    >
                        <path d="M14 3l7 7-9 9-3 1-1-3z" />
                        <path d="M5 17l-2 4 4-2" />
                    </svg>
                    <span class="ds-tool-key">T</span>
                    <span class="ds-tip">Paint terrain <kbd>T</kbd></span>
                </button>
            </div>
            <div class="ds-tool-group">
                <span class="ds-tool-label">Mark</span>
                <button
                    class="ds-tool"
                    data-testid="hex-tool-marker"
                    :aria-pressed="activeTool === 'marker'"
                    @click="emit('tool', 'marker')"
                >
                    <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="1.6"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                    >
                        <path
                            d="M12 2a6 6 0 00-6 6c0 5 6 12 6 12s6-7 6-12a6 6 0 00-6-6z"
                        />
                        <circle cx="12" cy="8" r="2.2" />
                    </svg>
                    <span class="ds-tool-key">M</span>
                    <span class="ds-tip">Drop marker <kbd>M</kbd></span>
                </button>
                <button
                    class="ds-tool danger"
                    data-testid="hex-tool-erase"
                    :aria-pressed="activeTool === 'erase'"
                    @click="emit('tool', 'erase')"
                >
                    <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="1.6"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                    >
                        <path d="M3 18l9-9 5 5-9 9H5l-2-3z" />
                        <path d="M14 7l3-3 5 5-3 3" />
                    </svg>
                    <span class="ds-tool-key">E</span>
                    <span class="ds-tip">Erase hex <kbd>E</kbd></span>
                </button>
            </div>
        </template>

        <div class="ds-tool-group">
            <ToolbarToggleButton kind="sound" testid="hex-sound-toggle" />
        </div>

        <div class="ds-tool-group">
            <span class="ds-tool-label">Party</span>
            <ToolbarToggleButton kind="party" testid="hex-party-toggle" />
            <ToolbarToggleButton kind="vault" testid="hex-vault-toggle" />
        </div>
    </aside>

    <div v-else class="ds-toolbar-float">
        <button
            class="ds-tool"
            data-testid="hex-tool-select"
            :aria-pressed="activeTool === 'select'"
            @click="emit('tool', 'select')"
        >
            <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="currentColor"
                stroke="none"
            >
                <path d="M5 3l5 16 2.5-6.5L19 10z" />
            </svg>
            <span class="ds-tip">Select <kbd>V</kbd></span>
        </button>
        <button
            class="ds-tool"
            data-testid="hex-tool-pan"
            :aria-pressed="activeTool === 'pan'"
            @click="emit('tool', 'pan')"
        >
            <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.6"
                stroke-linecap="round"
                stroke-linejoin="round"
            >
                <path d="M9 11V5.5a1.5 1.5 0 013 0V11" />
                <path d="M12 11V4a1.5 1.5 0 013 0v7" />
                <path d="M15 11V5.5a1.5 1.5 0 013 0V14" />
                <path
                    d="M9 11V8.5a1.5 1.5 0 00-3 0V15c0 3 2 6 6 6h2a4 4 0 004-4v-3"
                />
            </svg>
            <span class="ds-tip">Pan <kbd>H</kbd></span>
        </button>
        <button
            class="ds-tool"
            data-testid="hex-markers-visibility"
            :aria-pressed="!prefs.showHexMarkers"
            @click="prefs.setShowHexMarkers(!prefs.showHexMarkers)"
        >
            <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.6"
                stroke-linecap="round"
                stroke-linejoin="round"
            >
                <path
                    d="M12 2a6 6 0 00-6 6c0 5 6 12 6 12s6-7 6-12a6 6 0 00-6-6z"
                />
                <circle cx="12" cy="8" r="2.2" />
                <path v-if="!prefs.showHexMarkers" d="M3 3l18 18" />
            </svg>
            <span class="ds-tip">{{ prefs.showHexMarkers ? 'Hide markers' : 'Show markers' }}</span>
        </button>
        <div class="ds-float-sep" />
        <ToolbarToggleButton kind="party" testid="hex-party-toggle" :size="16" />
        <ToolbarToggleButton kind="vault" testid="hex-vault-toggle" :size="16" />
        <div class="ds-float-sep" />
        <ToolbarToggleButton kind="sound" testid="hex-sound-toggle" :size="16" />
        <template v-if="hexMode === 'blank'">
            <div class="ds-float-sep" />
            <button
                class="ds-tool"
                data-testid="hex-tool-paint"
                :aria-pressed="activeTool === 'paint'"
                @click="emit('tool', 'paint')"
            >
                <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.6"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                >
                    <path d="M14 3l7 7-9 9-3 1-1-3z" />
                    <path d="M5 17l-2 4 4-2" />
                </svg>
                <span class="ds-tip">Paint terrain <kbd>T</kbd></span>
            </button>
            <div class="ds-float-sep" />
            <button
                class="ds-tool"
                data-testid="hex-tool-marker"
                :aria-pressed="activeTool === 'marker'"
                @click="emit('tool', 'marker')"
            >
                <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.6"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                >
                    <path
                        d="M12 2a6 6 0 00-6 6c0 5 6 12 6 12s6-7 6-12a6 6 0 00-6-6z"
                    />
                    <circle cx="12" cy="8" r="2.2" />
                </svg>
                <span class="ds-tip">Drop marker <kbd>M</kbd></span>
            </button>
            <button
                class="ds-tool danger"
                data-testid="hex-tool-erase"
                :aria-pressed="activeTool === 'erase'"
                @click="emit('tool', 'erase')"
            >
                <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.6"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                >
                    <path d="M3 18l9-9 5 5-9 9H5l-2-3z" />
                    <path d="M14 7l3-3 5 5-3 3" />
                </svg>
                <span class="ds-tip">Erase <kbd>E</kbd></span>
            </button>
        </template>
    </div>

    <Teleport to="body">
        <div
            v-if="tip.show"
            class="ds-tip ds-tip-portal"
            :style="{ left: tip.x + 'px', top: tip.y + 'px' }"
            v-html="tip.html"
        />
    </Teleport>
</template>

<script setup>
import { useToolTooltip } from "@/composables/useToolTooltip.js";
import ToolbarToggleButton from "@/components/common/ToolbarToggleButton.vue";
import { useUserPrefsStore } from "@/stores/userPrefsStore.js";

defineProps({
    hexMode: { type: String, default: null },
    activeTool: { type: String, default: "select" },
    settingsOpen: { type: Boolean, default: false },
    isGM: { type: Boolean, default: false },
    floating: { type: Boolean, default: false },
    explorationAvailable: { type: Boolean, default: false },
    explorationMode: { type: Boolean, default: false },
});

const emit = defineEmits(["tool", "reveal-all", "hide-all", "map-settings", "toggle-exploration"]);

const prefs = useUserPrefsStore();
const { tip, onHover, onLeave } = useToolTooltip();
</script>
