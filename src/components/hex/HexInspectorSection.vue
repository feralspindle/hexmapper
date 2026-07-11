<template>
    <div class="ds-panel-section flex-grow" :class="{ collapsed: !open }">
        <div class="ds-section-head" @click="open = !open">
            <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.6"
                stroke-linecap="round"
                stroke-linejoin="round"
                style="flex: 0 0 auto"
            >
                <path d="M12 2l8 5v10l-8 5-8-5V7z" />
            </svg>
            <h3>Hex Inspector</h3>
            <span class="ds-meta">{{
                hexStore.selectedHex
                    ? `${hexStore.selectedHex.q}, ${hexStore.selectedHex.r}`
                    : "no hex selected"
            }}</span>
            <svg
                class="ds-chevron"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
            >
                <path d="M6 9l6 6 6-6" />
            </svg>
        </div>

        <div
            v-if="hexStore.selectedHex && !selectedHexVisibleToPlayer"
            class="ds-section-body"
        >
            <div class="hm-inspector-empty">
                <span class="hm-inspector-glyph">🌫</span>
                This hex hasn't been revealed yet.
            </div>
        </div>

        <div v-else-if="hexStore.selectedHex" class="ds-section-body">
            <div>
                <span class="ds-field-label">Name</span>
                <input
                    v-model="hexLabel"
                    type="text"
                    placeholder="e.g. Thornwood Village"
                    class="ds-input"
                    @input="debouncedSave"
                />
            </div>

            <div style="display: flex; align-items: center; gap: 8px">
                <template v-if="isPartyHex">
                    <span
                        style="
                            font-family: var(--font-mono);
                            font-size: 10px;
                            letter-spacing: 0.06em;
                            color: #7a1a1a;
                            flex: 1;
                        "
                    >
                        ● Party location
                    </span>
                    <button
                        class="hm-ghost-btn hm-ghost-btn--danger"
                        @click="hexStore.clearPartyHex()"
                    >
                        Clear
                    </button>
                </template>
                <button
                    v-else
                    class="hm-dashed-btn"
                    style="
                        width: 100%;
                        color: #7a1a1a;
                        border-color: #7a1a1a;
                        opacity: 0.75;
                    "
                    @click="
                        hexStore.setPartyHex(
                            hexStore.selectedHex.q,
                            hexStore.selectedHex.r,
                        )
                    "
                >
                    Set as party location
                </button>
            </div>

            <div
                v-if="
                    sessionStore.isGM &&
                    ((sessionStore.playMode === 'gm_less' &&
                        mapStore.mapExplorationMode) ||
                        hexStore.selectedCell?.explored === false)
                "
                style="display: flex; align-items: center; gap: 8px"
            >
                <span
                    style="
                        font-family: var(--font-mono);
                        font-size: 10px;
                        letter-spacing: 0.06em;
                        flex: 1;
                    "
                    :style="{
                        color:
                            hexStore.selectedCell?.explored === false
                                ? '#8a6a1c'
                                : 'var(--ink-mute, #6b5d49)',
                    }"
                >
                    {{
                        hexStore.selectedCell?.explored === false
                            ? "◌ Unexplored — generates on entry"
                            : "Explored"
                    }}
                </span>
                <button
                    v-if="hexStore.selectedCell?.explored === false"
                    class="hm-ghost-btn"
                    @click="
                        hexStore.markExplored(
                            hexStore.selectedHex.q,
                            hexStore.selectedHex.r,
                        )
                    "
                >
                    Mark explored
                </button>
                <button
                    v-else
                    class="hm-ghost-btn"
                    @click="
                        hexStore.markUnexplored(
                            hexStore.selectedHex.q,
                            hexStore.selectedHex.r,
                        )
                    "
                >
                    Mark unexplored
                </button>
            </div>

            <div>
                <div
                    style="
                        display: flex;
                        justify-content: space-between;
                        align-items: baseline;
                        margin-bottom: 6px;
                    "
                >
                    <span class="ds-field-label" style="margin-bottom: 0"
                        >Terrain</span
                    >
                    <button
                        v-if="hexTerrain"
                        class="hm-ghost-btn"
                        @click="setTerrain(null)"
                    >
                        Clear
                    </button>
                </div>
                <div class="hm-terrain-picker">
                    <button
                        v-for="t in TERRAIN_TYPES"
                        :key="t.id"
                        class="hm-terrain-chip"
                        :class="{ active: hexTerrain === t.id }"
                        @click="setTerrain(t.id)"
                    >
                        <span
                            class="hm-terrain-swatch"
                            :style="{ background: t.color }"
                        />
                        <span>{{ t.label }}</span>
                    </button>
                </div>
            </div>

            <div>
                <span class="ds-field-label">Markers</span>

                <div
                    v-for="m in hexMarkers"
                    :key="m.id"
                    class="hm-content-card"
                    style="margin-top: 6px"
                >
                    <div class="hm-content-card-head">
                        <div class="hm-stamp">
                            <svg
                                width="13"
                                height="13"
                                viewBox="0 0 24 24"
                                fill="currentColor"
                            >
                                <template v-if="m.kind === 'town'">
                                    <path d="M4 20V11l4-3 4 3v9z" />
                                    <path d="M12 20v-7l4-2 4 2v7z" />
                                </template>
                                <template v-else-if="m.kind === 'city'">
                                    <path d="M3 21V12l4-3v12z" />
                                    <path d="M9 21V8l5-4 5 4v13z" />
                                    <path d="M19 21V14l3 2v5z" />
                                </template>
                                <template v-else-if="m.kind === 'dungeon'">
                                    <path d="M5 21V10a7 7 0 0114 0v11z" />
                                </template>
                                <template v-else-if="m.kind === 'landmark'">
                                    <path
                                        d="M12 3l3 6 6 .8-4.5 4 1 6.2-5.5-3-5.5 3 1-6.2L3 9.8 9 9z"
                                    />
                                </template>
                            </svg>
                        </div>
                        <span class="hm-kind">{{
                            MARKER_KINDS.find((k) => k.id === m.kind)?.label ??
                            m.kind
                        }}</span>
                        <input
                            v-model="m.label"
                            type="text"
                            :placeholder="
                                MARKER_KINDS.find((k) => k.id === m.kind)
                                    ?.label ?? m.kind
                            "
                            maxlength="24"
                            class="ds-input hm-card-input"
                            @input="debouncedUpdateMarker(m)"
                        />
                        <button
                            class="hm-content-card-x"
                            @click="doRemoveMarker(m.id)"
                        >
                            ×
                        </button>
                    </div>
                </div>

                <div
                    class="hm-marker-picker"
                    :style="
                        hexMarkers.length ? 'margin-top:8px' : 'margin-top:4px'
                    "
                >
                    <button
                        v-for="k in MARKER_KINDS"
                        :key="k.id"
                        class="hm-marker-chip"
                        :title="`Add ${k.label}`"
                        @click="doAddMarker(k.id)"
                    >
                        <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="currentColor"
                            style="flex-shrink: 0"
                        >
                            <template v-if="k.id === 'town'">
                                <path d="M4 20V11l4-3 4 3v9z" />
                                <path d="M12 20v-7l4-2 4 2v7z" />
                            </template>
                            <template v-else-if="k.id === 'city'">
                                <path d="M3 21V12l4-3v12z" />
                                <path d="M9 21V8l5-4 5 4v13z" />
                                <path d="M19 21V14l3 2v5z" />
                            </template>
                            <template v-else-if="k.id === 'dungeon'">
                                <path d="M5 21V10a7 7 0 0114 0v11z" />
                            </template>
                            <template v-else-if="k.id === 'landmark'">
                                <path
                                    d="M12 3l3 6 6 .8-4.5 4 1 6.2-5.5-3-5.5 3 1-6.2L3 9.8 9 9z"
                                />
                            </template>
                        </svg>
                        {{ k.label }}
                    </button>
                </div>
            </div>

            <div v-if="sessionStore.isGM">
                <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 6px">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: #b87800; flex-shrink: 0">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                    </svg>
                    <span class="ds-field-label" style="margin-bottom: 0; color: #b87800">GM Markers</span>
                </div>

                <div
                    v-for="m in hexGmMarkers"
                    :key="m.id"
                    class="hm-content-card"
                    style="margin-top: 6px; border-color: rgba(184,120,0,0.3)"
                >
                    <div class="hm-content-card-head">
                        <div class="hm-stamp" style="background: rgba(184,120,0,0.15); color: #b87800">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                                <template v-if="m.kind === 'trap'">
                                    <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                                </template>
                                <template v-else-if="m.kind === 'secret'">
                                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                                </template>
                                <template v-else-if="m.kind === 'encounter'">
                                    <circle cx="12" cy="8" r="5"/><path d="M8 14v7M12 14v7M16 14v7"/><path d="M8 14h8"/>
                                </template>
                                <template v-else-if="m.kind === 'treasure'">
                                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                                </template>
                                <template v-else-if="m.kind === 'note'">
                                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14,2 14,8 20,8"/>
                                </template>
                            </svg>
                        </div>
                        <span class="hm-kind">{{
                            GM_MARKER_KINDS.find((k) => k.id === m.kind)?.label ?? m.kind
                        }}</span>
                        <input
                            v-model="m.label"
                            type="text"
                            :placeholder="GM_MARKER_KINDS.find((k) => k.id === m.kind)?.label ?? m.kind"
                            maxlength="24"
                            class="ds-input hm-card-input"
                            @input="debouncedUpdateGmMarker(m)"
                        />
                        <button
                            class="hm-content-card-x"
                            @click="doRemoveGmMarker(m.id)"
                        >
                            ×
                        </button>
                    </div>
                </div>

                <div
                    class="hm-marker-picker"
                    :style="hexGmMarkers.length ? 'margin-top:8px' : 'margin-top:4px'"
                >
                    <button
                        v-for="k in GM_MARKER_KINDS"
                        :key="k.id"
                        class="hm-marker-chip"
                        :data-testid="`gm-marker-add-${k.id}`"
                        :title="`Add ${k.label}`"
                        @click="doAddGmMarker(k.id)"
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0">
                            <template v-if="k.id === 'trap'">
                                <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                            </template>
                            <template v-else-if="k.id === 'secret'">
                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                            </template>
                            <template v-else-if="k.id === 'encounter'">
                                <circle cx="12" cy="8" r="5"/><path d="M8 14v7M12 14v7M16 14v7"/><path d="M8 14h8"/>
                            </template>
                            <template v-else-if="k.id === 'treasure'">
                                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                            </template>
                            <template v-else-if="k.id === 'note'">
                                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14,2 14,8 20,8"/>
                            </template>
                        </svg>
                        {{ k.label }}
                    </button>
                </div>
            </div>

            <div>
                <div
                    style="
                        display: flex;
                        justify-content: space-between;
                        align-items: baseline;
                        margin-bottom: 6px;
                    "
                >
                    <span class="ds-field-label" style="margin-bottom: 0"
                        >Notes</span
                    >
                    <span class="hm-kbd-hint"
                        >{{ notesStore.notes.length }} note{{
                            notesStore.notes.length === 1 ? "" : "s"
                        }}</span
                    >
                </div>
                <div class="hm-note-add">
                    <textarea
                        v-model="newNote"
                        rows="2"
                        placeholder="What did the party learn here? (Ctrl+Enter)"
                        class="ds-input"
                        style="resize: none"
                        @keydown.ctrl.enter.prevent="saveNote"
                    />
                    <div class="hm-note-add-row">
                        <span class="hm-kbd-hint">Ctrl+Enter</span>
                        <button
                            class="ds-btn"
                            :disabled="!newNote.trim() || savingNote"
                            @click="saveNote"
                        >
                            Save note
                        </button>
                    </div>
                </div>
                <div
                    v-if="notesStore.loading"
                    style="
                        padding: 10px 0;
                        font-family: var(--font-body);
                        font-style: italic;
                        font-size: 13px;
                        color: var(--ink-mute);
                    "
                >
                    Loading…
                </div>
                <div
                    ref="notesLogEl"
                    v-else-if="notesStore.notes.length"
                    style="
                        display: flex;
                        flex-direction: column;
                        gap: 6px;
                        margin-top: 8px;
                        max-height: 200px;
                        overflow-y: auto;
                    "
                >
                    <div
                        v-for="note in notesStore.notes"
                        :key="note.id"
                        class="hm-note"
                    >
                        <div class="hm-note-meta">
                            <span class="hm-note-author" :style="{ '--player-color': playerColorFor(note.user_id) }">{{
                                note.display_name
                            }}</span>
                            <span class="hm-note-time">{{
                                timeAgo(note.created_at)
                            }}</span>
                            <button
                                v-if="note.user_id === authStore.user?.id && editingNoteId !== note.id"
                                class="hm-note-del"
                                title="Edit note"
                                @click="startEditNote(note)"
                            >✎</button>
                            <button
                                v-if="note.user_id === authStore.user?.id || sessionStore.isGM"
                                class="hm-note-del"
                                title="Delete note"
                                @click="confirm('Delete this note?', () => notesStore.deleteNote(note.id))"
                            >×</button>
                        </div>
                        <template v-if="editingNoteId === note.id">
                            <textarea
                                v-model="editingNoteBody"
                                rows="2"
                                class="ds-input"
                                style="resize: none"
                                @keydown.ctrl.enter.prevent="saveEditNote"
                                @keydown.escape="editingNoteId = null"
                            />
                            <div class="hm-note-add-row">
                                <span class="hm-kbd-hint">Ctrl+Enter</span>
                                <button class="ds-btn" :disabled="!editingNoteBody.trim()" @click="saveEditNote">Save</button>
                                <button class="ds-btn" @click="editingNoteId = null">Cancel</button>
                            </div>
                        </template>
                        <div v-else class="hm-note-text">{{ note.body }}</div>
                    </div>
                </div>
            </div>

            <div v-if="sessionStore.isGM || hexStore.hexDungeons.length">
                <span class="ds-field-label">Dungeons</span>
                <div
                    v-if="hexStore.dungeonsLoading"
                    style="
                        font-family: var(--font-mono);
                        font-size: 11px;
                        color: var(--ink-mute);
                        margin-top: 4px;
                    "
                >
                    Loading…
                </div>
                <div
                    v-else
                    style="
                        display: flex;
                        flex-direction: column;
                        gap: 4px;
                        margin-top: 4px;
                    "
                >
                    <div
                        v-for="d in hexStore.hexDungeons"
                        :key="d.id"
                        class="hm-content-card"
                    >
                        <div class="hm-content-card-head">
                            <div class="hm-stamp">
                                <svg
                                    width="13"
                                    height="13"
                                    viewBox="0 0 24 24"
                                    fill="currentColor"
                                >
                                    <path d="M5 21V10a7 7 0 0114 0v11z" />
                                </svg>
                            </div>
                            <span
                                style="
                                    font-family: var(--font-body);
                                    font-size: 13px;
                                    color: var(--ink-2);
                                    flex: 1;
                                    overflow: hidden;
                                    text-overflow: ellipsis;
                                    white-space: nowrap;
                                "
                                >{{ d.name }}</span
                            >
                            <button
                                style="
                                    font-family: var(--font-mono);
                                    font-size: 10px;
                                    letter-spacing: 0.06em;
                                    color: var(--accent-2);
                                    background: none;
                                    border: none;
                                    cursor: pointer;
                                    flex-shrink: 0;
                                    white-space: nowrap;
                                "
                                data-testid="dungeon-enter"
                                @click="hexStore.navigateToDungeon(d.id)"
                            >
                                Enter →
                            </button>
                        </div>
                    </div>
                </div>

                <template v-if="sessionStore.isGM">
                <div
                    v-if="addingDungeon"
                    style="display: flex; gap: 6px; margin-top: 6px"
                >
                    <input
                        ref="dungeonNameEl"
                        v-model="newDungeonName"
                        type="text"
                        placeholder="Dungeon name…"
                        class="ds-input"
                        style="flex: 1; font-size: 13px"
                        data-testid="dungeon-name-input"
                        @keyup.enter="confirmNewDungeon"
                        @keyup.escape="addingDungeon = false"
                    />
                    <button class="ds-btn" data-testid="dungeon-confirm" @click="confirmNewDungeon">
                        Add
                    </button>
                </div>
                <button
                    v-else
                    class="hm-dashed-btn"
                    style="margin-top: 6px"
                    data-testid="add-dungeon"
                    @click="startAddDungeon"
                >
                    + Add Dungeon
                </button>
                </template>
            </div>

            <div v-if="sessionStore.isGM || childMapsForSelectedHex.length">
                <span class="ds-field-label">Child Maps</span>
                <div
                    style="
                        display: flex;
                        flex-direction: column;
                        gap: 4px;
                        margin-top: 4px;
                    "
                >
                    <div
                        v-for="m in childMapsForSelectedHex"
                        :key="m.id"
                        class="hm-content-card"
                        data-testid="child-map-card"
                    >
                        <div class="hm-content-card-head">
                            <div class="hm-stamp">
                                <svg
                                    width="13"
                                    height="13"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    stroke-width="1.6"
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                >
                                    <path d="M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z" />
                                </svg>
                            </div>
                            <template v-if="renamingMapId === m.id">
                                <input
                                    ref="renameMapInputEl"
                                    v-model="renameMapDraft"
                                    type="text"
                                    class="ds-input"
                                    style="flex: 1; font-size: 13px"
                                    data-testid="child-map-rename-input"
                                    @keyup.enter="confirmRenameMap(m.id)"
                                    @keyup.escape="renamingMapId = null"
                                />
                                <button
                                    class="ds-btn"
                                    data-testid="child-map-rename-confirm"
                                    @click="confirmRenameMap(m.id)"
                                >
                                    Save
                                </button>
                            </template>
                            <template v-else>
                                <span
                                    style="
                                        font-family: var(--font-body);
                                        font-size: 13px;
                                        color: var(--ink-2);
                                        flex: 1;
                                        overflow: hidden;
                                        text-overflow: ellipsis;
                                        white-space: nowrap;
                                    "
                                >{{ m.name }}</span>
                                <button
                                    v-if="sessionStore.isGM"
                                    class="hm-card-icon-btn"
                                    title="Rename map"
                                    data-testid="child-map-rename"
                                    @click="startRenameMap(m)"
                                >
                                    ✎
                                </button>
                                <button
                                    v-if="sessionStore.isGM"
                                    class="hm-card-icon-btn hm-card-icon-btn--danger"
                                    title="Delete map"
                                    data-testid="child-map-delete"
                                    @click="confirmDeleteMap(m)"
                                >
                                    ×
                                </button>
                                <button
                                    v-if="sessionStore.isGM"
                                    style="
                                        font-family: var(--font-mono);
                                        font-size: 10px;
                                        letter-spacing: 0.06em;
                                        color: var(--accent-2);
                                        background: none;
                                        border: none;
                                        cursor: pointer;
                                        flex-shrink: 0;
                                        white-space: nowrap;
                                    "
                                    data-testid="child-map-enter"
                                    @click="mapStore.setActiveMap(m.id)"
                                >
                                    Enter →
                                </button>
                            </template>
                        </div>
                    </div>
                </div>

                <template v-if="sessionStore.isGM">
                    <div
                        v-if="addingChildMap"
                        style="display: flex; gap: 6px; margin-top: 6px"
                    >
                        <input
                            ref="childMapNameEl"
                            v-model="newChildMapName"
                            type="text"
                            placeholder="Map name…"
                            class="ds-input"
                            style="flex: 1; font-size: 13px"
                            data-testid="child-map-name"
                            @keyup.enter="confirmNewChildMap"
                            @keyup.escape="addingChildMap = false"
                        />
                        <button
                            class="ds-btn"
                            data-testid="child-map-confirm"
                            @click="confirmNewChildMap"
                        >
                            Add
                        </button>
                    </div>
                    <button
                        v-else
                        class="hm-dashed-btn"
                        style="margin-top: 6px"
                        data-testid="add-child-map"
                        @click="startAddChildMap"
                    >
                        + Add Child Map
                    </button>
                </template>
            </div>

            <div
                v-if="sessionStore.isGM"
                style="padding-top: 4px; border-top: 1px solid var(--rule)"
            >
                <button
                    class="hm-ghost-btn hm-ghost-btn--danger"
                    data-testid="clear-hex"
                    @click="clearHex"
                >
                    Clear hex data
                </button>
            </div>
        </div>

        <div v-else class="hm-inspector-empty">
            <span class="hm-inspector-glyph">⬡</span>
            Click any hex on the map to inspect, name, mark terrain, and take
            notes.
        </div>
    </div>
</template>

<script setup>
import { ref, watch, computed, nextTick, onUnmounted } from "vue";
import {
    useHexStore,
    TERRAIN_TYPES,
    MARKER_KINDS,
    GM_MARKER_KINDS,
    parseMarkers,
} from "@/stores/hexStore.js";
import { useMapStore } from "@/stores/mapStore.js";
import { useNotesStore } from "@/stores/notesStore.js";
import { useSessionStore } from "@/stores/sessionStore.js";
import { useAuthStore } from "@/stores/authStore.js";
import { useConfirmDialog } from "@/composables/useConfirmDialog.js";
import { useTimeAgo } from "@/composables/useTimeAgo.js";
import { playerColorFor } from "@/composables/usePlayerColor.js";
import { useNoteEditing } from "@/composables/useNoteEditing.js";

const hexStore = useHexStore();
const mapStore = useMapStore();
const notesStore = useNotesStore();
const sessionStore = useSessionStore();
const authStore = useAuthStore();
const { confirm } = useConfirmDialog();
const { timeAgo } = useTimeAgo();

const selectedHexVisibleToPlayer = computed(() => {
  if (sessionStore.isGM) return true
  const fogMode = sessionStore.hexMode === 'fow'
  const revealAll = sessionStore.hexMode === 'blank' || mapStore.mapFogRevealAll
  if (!fogMode) return revealAll
  const cell = hexStore.selectedCell
  if (cell == null) return revealAll
  return cell.revealed !== false
})

const open = ref(true);
const hexLabel = ref("");
const hexTerrain = ref(null);
const hexMarkers = ref([]);
const hexGmMarkers = ref([]);
const { newNote, savingNote, editingNoteId, editingNoteBody, saveNote, startEditNote, saveEditNote } = useNoteEditing(notesStore, {
    beforeSave: async () => {
        if (!hexStore.selectedCell?.id && hexStore.selectedHex) {
            const { q, r } = hexStore.selectedHex;
            const cellId = await hexStore.ensureCellExists(q, r);
            if (cellId) await notesStore.initForHex(cellId, sessionStore.sessionId);
        }
    },
});
const addingDungeon = ref(false);
const newDungeonName = ref("");
const dungeonNameEl = ref(null);
const notesLogEl = ref(null);
const addingChildMap = ref(false);
const newChildMapName = ref("");
const childMapNameEl = ref(null);

const isPartyHex = computed(
    () =>
        hexStore.partyHex?.q === hexStore.selectedHex?.q &&
        hexStore.partyHex?.r === hexStore.selectedHex?.r,
);

watch(
    () => hexStore.selectedCell,
    (cell) => {
        hexLabel.value = cell?.label ?? "";
        hexTerrain.value = cell?.terrain_type ?? null;
        hexMarkers.value = parseMarkers(cell?.marker_color);
        hexGmMarkers.value = parseMarkers(cell?.gm_markers);
        addingDungeon.value = false;
        addingChildMap.value = false;
        hexStore.fetchDungeonsForHex(cell?.id ?? null);
        notesStore.initForHex(cell?.id ?? null, sessionStore.sessionId);
        if (cell) open.value = true;
    },
    { immediate: true },
);

watch(
    () => notesStore.notes.length,
    () => {
        nextTick(() => {
            if (notesLogEl.value)
                notesLogEl.value.scrollTop = notesLogEl.value.scrollHeight;
        });
    },
);

let saveTimer = null;
function debouncedSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveHex, 500);
}

function saveHex() {
    if (!hexStore.selectedHex) return;
    const { q, r } = hexStore.selectedHex;
    hexStore.upsertHex(q, r, {
        label: hexLabel.value,
        terrain_type: hexTerrain.value,
    });
}

function setTerrain(id) {
    hexTerrain.value = id;
    saveHex();
}

function doAddMarker(kind) {
    if (!hexStore.selectedHex) return;
    const { q, r } = hexStore.selectedHex;
    const newMarker = { id: crypto.randomUUID(), kind, label: "" };
    hexMarkers.value = [...hexMarkers.value, newMarker];
    hexStore.addMarker(q, r, kind);
}

function doRemoveMarker(markerId) {
    if (!hexStore.selectedHex) return;
    const { q, r } = hexStore.selectedHex;
    hexMarkers.value = hexMarkers.value.filter((m) => m.id !== markerId);
    hexStore.removeMarker(q, r, markerId);
}

let markerLabelTimer = null;
function debouncedUpdateMarker(marker) {
    clearTimeout(markerLabelTimer);
    markerLabelTimer = setTimeout(() => {
        if (!hexStore.selectedHex) return;
        const { q, r } = hexStore.selectedHex;
        hexStore.updateMarkerLabel(q, r, marker.id, marker.label);
    }, 500);
}

function doAddGmMarker(kind) {
    if (!hexStore.selectedHex) return;
    const { q, r } = hexStore.selectedHex;
    const newMarker = { id: crypto.randomUUID(), kind, label: "" };
    hexGmMarkers.value = [...hexGmMarkers.value, newMarker];
    hexStore.addGmMarker(q, r, kind);
}

function doRemoveGmMarker(markerId) {
    if (!hexStore.selectedHex) return;
    const { q, r } = hexStore.selectedHex;
    hexGmMarkers.value = hexGmMarkers.value.filter((m) => m.id !== markerId);
    hexStore.removeGmMarker(q, r, markerId);
}

let gmMarkerLabelTimer = null;
function debouncedUpdateGmMarker(marker) {
    clearTimeout(gmMarkerLabelTimer);
    gmMarkerLabelTimer = setTimeout(() => {
        if (!hexStore.selectedHex) return;
        const { q, r } = hexStore.selectedHex;
        hexStore.updateGmMarkerLabel(q, r, marker.id, marker.label);
    }, 500);
}

function clearHex() {
    if (!hexStore.selectedHex) return;
    confirm("Clear all data on this hex?", () => {
        hexStore.deleteHex(hexStore.selectedHex.q, hexStore.selectedHex.r);
    });
}

async function startAddDungeon() {
    addingDungeon.value = true;
    newDungeonName.value = "";
    await nextTick();
    dungeonNameEl.value?.focus();
}

function confirmNewDungeon() {
    if (!hexStore.selectedHex) return;
    const { q, r } = hexStore.selectedHex;
    const name = newDungeonName.value.trim() || "Unnamed Dungeon";
    addingDungeon.value = false;
    hexStore.createDungeon(q, r, name);
}

const childMapsForSelectedHex = computed(() => {
    const cellId = hexStore.selectedCell?.id;
    if (!cellId) return [];
    return mapStore.childMapsByHexId.get(cellId) ?? [];
});

async function startAddChildMap() {
    addingChildMap.value = true;
    newChildMapName.value = "";
    await nextTick();
    childMapNameEl.value?.focus();
}

async function confirmNewChildMap() {
    if (!hexStore.selectedHex) return;
    const { q, r } = hexStore.selectedHex;
    const name = newChildMapName.value.trim() || "Unnamed Map";
    addingChildMap.value = false;

    let cellId = hexStore.selectedCell?.id;
    if (!cellId) {
        cellId = await hexStore.ensureCellExists(q, r);
    }
    if (!cellId) return;

    await mapStore.createChildMap(cellId, name);
}

const renamingMapId = ref(null);
const renameMapDraft = ref("");
const renameMapInputEl = ref(null);

async function startRenameMap(map) {
    renamingMapId.value = map.id;
    renameMapDraft.value = map.name;
    await nextTick();
    renameMapInputEl.value?.focus();
}

async function confirmRenameMap(mapId) {
    const name = renameMapDraft.value.trim();
    renamingMapId.value = null;
    if (!name) return;
    await mapStore.renameMap(mapId, name);
}

function confirmDeleteMap(map) {
    confirm(`Delete the map "${map.name}"? This cannot be undone.`, () => {
        mapStore.deleteMap(map.id);
    });
}

onUnmounted(() => notesStore.cleanup());
</script>
