<template>
    <aside v-if="!floating" class="ds-toolbar">
        <div class="ds-tool-group">
            <span class="ds-tool-label">View</span>
            <button
                class="ds-tool"
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
        </div>

        <template v-if="hexMode === 'fow' && isGM">
            <div class="ds-tool-group">
                <span class="ds-tool-label">Reveal</span>
                <button
                    class="ds-tool"
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
                <button class="ds-tool" @click="emit('reveal-all')">
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
                <button class="ds-tool danger" @click="emit('hide-all')">
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
            </div>
            <div class="ds-tool-group">
                <span class="ds-tool-label">Map</span>
                <button
                    class="ds-tool"
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
            </div>
            <div class="ds-tool-group">
                <span class="ds-tool-label">Terrain</span>
                <button
                    class="ds-tool"
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
            <button
                class="ds-tool"
                :aria-pressed="!soundEnabled ? 'true' : 'false'"
                @click="toggleSound()"
            >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M11 5L6 9H2v6h4l5 4V5z"/>
                    <template v-if="soundEnabled">
                        <path d="M15.54 8.46a5 5 0 010 7.07"/>
                        <path d="M19.07 4.93a10 10 0 010 14.14"/>
                    </template>
                    <template v-else>
                        <line x1="23" y1="9" x2="17" y2="15"/>
                        <line x1="17" y1="9" x2="23" y2="15"/>
                    </template>
                </svg>
                <span class="ds-tip">{{ soundEnabled ? 'Mute sounds' : 'Unmute sounds' }}</span>
            </button>
        </div>

        <div class="ds-tool-group">
            <span class="ds-tool-label">Party</span>
            <button
                class="ds-tool"
                :aria-pressed="partyVisible ? 'true' : 'false'"
                @click="toggleParty()"
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
                    <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M22 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
                </svg>
                <span class="ds-tip">Party panel</span>
            </button>
            <button
                class="ds-tool"
                :aria-pressed="vaultVisible ? 'true' : 'false'"
                @click="toggleVault()"
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
                    <path d="M3 9h18M3 9V7a1 1 0 011-1h16a1 1 0 011 1v2M3 9v9a1 1 0 001 1h16a1 1 0 001-1V9"/>
                    <path d="M10 13h4"/>
                </svg>
                <span class="ds-tip">Party vault</span>
            </button>
        </div>
    </aside>

    <div v-else class="ds-toolbar-float">
        <button
            class="ds-tool"
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
        <div class="ds-float-sep" />
        <button
            class="ds-tool"
            :aria-pressed="partyVisible ? 'true' : 'false'"
            @click="toggleParty()"
        >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M22 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
            </svg>
            <span class="ds-tip">Party panel</span>
        </button>
        <button
            class="ds-tool"
            :aria-pressed="vaultVisible ? 'true' : 'false'"
            @click="toggleVault()"
        >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 9h18M3 9V7a1 1 0 011-1h16a1 1 0 011 1v2M3 9v9a1 1 0 001 1h16a1 1 0 001-1V9"/>
                <path d="M10 13h4"/>
            </svg>
            <span class="ds-tip">Party vault</span>
        </button>
        <div class="ds-float-sep" />
        <button
            class="ds-tool"
            :aria-pressed="!soundEnabled ? 'true' : 'false'"
            @click="toggleSound()"
        >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                <path d="M11 5L6 9H2v6h4l5 4V5z"/>
                <template v-if="soundEnabled">
                    <path d="M15.54 8.46a5 5 0 010 7.07"/>
                    <path d="M19.07 4.93a10 10 0 010 14.14"/>
                </template>
                <template v-else>
                    <line x1="23" y1="9" x2="17" y2="15"/>
                    <line x1="17" y1="9" x2="23" y2="15"/>
                </template>
            </svg>
            <span class="ds-tip">{{ soundEnabled ? 'Mute sounds' : 'Unmute sounds' }}</span>
        </button>
        <template v-if="hexMode === 'blank'">
            <div class="ds-float-sep" />
            <button
                class="ds-tool"
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
</template>

<script setup>
import { computed } from "vue";
import { usePartyNotebook } from "@/composables/usePartyNotebook.js";
import { usePartyPanel } from "@/composables/usePartyPanel.js";
import { soundEnabled, toggleSound } from "@/lib/soundSettings.js";

const props = defineProps({
    hexMode: { type: String, default: null },
    activeTool: { type: String, default: "select" },
    settingsOpen: { type: Boolean, default: false },
    isGM: { type: Boolean, default: false },
    floating: { type: Boolean, default: false },
});

const emit = defineEmits(["tool", "reveal-all", "hide-all", "map-settings"]);

const { visible: inventoryVisible, activeTab: notebookTab, toggle: toggleInventory, open: openNotebook } = usePartyNotebook();
const { visible: partyVisible, toggle: toggleParty } = usePartyPanel();
const vaultVisible = computed(() => inventoryVisible.value && notebookTab.value === 'vault');
function toggleVault() {
  if (vaultVisible.value) { toggleInventory(); } else { openNotebook('vault'); }
}
</script>
