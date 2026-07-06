<template>
    <div
        ref="containerEl"
        class="w-full h-full overflow-hidden select-none"
        data-testid="hex-grid"
        :class="
            middlePanning
                ? 'cursor-grabbing'
                : panMode
                  ? 'cursor-pan'
                  : moveMode !== 'none'
                    ? 'cursor-move'
                    : 'cursor-default'
        "
        style="position: relative"
    >
        <svg
            ref="svgEl"
            :width="svgWidth"
            :height="svgHeight"
            class="block"
            style="overflow: visible"
            @mousedown.left="onPanStart"
            @mousedown.middle.prevent="onMiddlePanStart"
            @mousemove="onMouseMove"
            @mouseup="onPanEnd"
            @mouseleave="onPanEnd"
            @wheel.prevent="onWheel"
        >
            <g :transform="`translate(${pan.x}, ${pan.y}) scale(${zoom})`">
                <g :transform="imageTransform">
                    <image
                        v-if="imageMode && mapImageUrl && imageNaturalWidth"
                        :href="mapImageUrl"
                        x="0"
                        y="0"
                        :width="imageNaturalWidth * mapImageScale"
                        :height="imageNaturalHeight * mapImageScale"
                        preserveAspectRatio="none"
                    />
                </g>

                <g :transform="gridTransform">
                    <HexCell
                        v-for="coord in visibleCoords"
                        :key="`${coord.q}:${coord.r}`"
                        :q="coord.q"
                        :r="coord.r"
                        :cell="
                            hexStore.hexCells.get(`${coord.q}:${coord.r}`) ??
                            null
                        "
                        :is-selected="
                            hexStore.selectedHex?.q === coord.q &&
                            hexStore.selectedHex?.r === coord.r
                        "
                        :is-party="
                            hexStore.partyHex?.q === coord.q &&
                            hexStore.partyHex?.r === coord.r
                        "
                        :has-child-map="
                            !!hexStore.hexCells.get(`${coord.q}:${coord.r}`)?.id &&
                            mapStore.childMapsByHexId.has(
                                hexStore.hexCells.get(`${coord.q}:${coord.r}`)?.id
                            )
                        "
                        :is-g-m="isGM"
                        :fog-mode="fogMode"
                        :image-mode="imageMode"
                        :settings-open="settingsOpen"
                        :map-fog-reveal-all="mapFogRevealAll"
                        :exploration-mode="explorationMode"
                        :size="hexSize"
                        :hex-h="hexHProp"
                        @click="
                            !panMode &&
                            !didPan &&
                            emit('hex-click', coord.q, coord.r)
                        "
                        @contextmenu.prevent="
                            !panMode && emit('hex-context', coord.q, coord.r)
                        "
                    />

                    <g
                        v-if="selectedGlowCenter"
                        :transform="`translate(${selectedGlowCenter.x}, ${selectedGlowCenter.y})`"
                        class="pointer-events-none"
                    >
                        <polygon :points="glowPoints" fill="none" stroke="rgba(200, 168, 107, 0.10)" :stroke-width="6 / (hexSize / 48)" />
                        <polygon :points="glowPoints" fill="none" stroke="rgba(200, 168, 107, 0.28)" :stroke-width="3 / (hexSize / 48)" />
                        <polygon :points="glowPoints" fill="none" stroke="rgba(200, 168, 107, 0.75)" :stroke-width="1.2 / (hexSize / 48)" />
                    </g>

                    <g
                        v-if="partyGlowCenter"
                        :transform="`translate(${partyGlowCenter.x}, ${partyGlowCenter.y})`"
                        class="pointer-events-none"
                    >
                        <polygon :points="glowPoints" fill="none" stroke="rgba(200, 55, 55, 0.10)" :stroke-width="6 / (hexSize / 48)" />
                        <polygon :points="glowPoints" fill="none" stroke="rgba(200, 55, 55, 0.28)" :stroke-width="3 / (hexSize / 48)" />
                        <polygon :points="glowPoints" fill="none" stroke="rgba(200, 55, 55, 0.75)" :stroke-width="1.2 / (hexSize / 48)" />
                    </g>
                </g>
            </g>
        </svg>

        <Transition name="hm-map-fade">
            <div v-if="imageLoading" class="hm-map-loading-overlay">
                <svg class="hm-map-spinner" width="52" height="52" viewBox="0 0 52 52" fill="none">
                    <polygon
                        points="26,3 47.7,15 47.7,37 26,49 4.3,37 4.3,15"
                        stroke="#d4a74b"
                        stroke-width="2"
                        stroke-linejoin="round"
                    />
                    <polygon
                        points="26,13 40.6,21 40.6,37 26,45 11.4,37 11.4,21"
                        stroke="#d4a74b"
                        stroke-width="1.2"
                        stroke-linejoin="round"
                        opacity="0.35"
                    />
                </svg>
                <span class="hm-map-loading-label">Loading map…</span>
            </div>
        </Transition>
    </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from "vue";
import { useHexStore } from "@/stores/hexStore.js";
import { useMapStore } from "@/stores/mapStore.js";
import {
    HEX_SIZE,
    DEFAULT_GRID_COLS,
    DEFAULT_GRID_ROWS,
    hexToPixel,
    hexCorners,
    cornersToPoints,
    hexHeight,
} from "@/composables/useHexGeometry.js";
import HexCell from "./HexCell.vue";

const props = defineProps({
    isGM: { type: Boolean, default: false },
    fogMode: { type: Boolean, default: false },
    imageMode: { type: Boolean, default: false },
    mapImageUrl: { type: String, default: null },
    mapHexWidth: { type: Number, default: HEX_SIZE * 2 },
    mapHexHeight: { type: Number, default: null },
    mapImageRotation: { type: Number, default: 0 },
    mapGridRotation: { type: Number, default: 0 },
    mapImageOffsetX: { type: Number, default: 0 },
    mapImageOffsetY: { type: Number, default: 0 },
    mapGridOffsetX: { type: Number, default: 0 },
    mapGridOffsetY: { type: Number, default: 0 },
    mapImageScale: { type: Number, default: 1 },
    mapGridCols: { type: Number, default: null },
    mapGridRows: { type: Number, default: null },
    moveMode: { type: String, default: "none" },
    panMode: { type: Boolean, default: false },
    mapFogRevealAll: { type: Boolean, default: false },
    explorationMode: { type: Boolean, default: false },
    settingsOpen: { type: Boolean, default: false },
});

const emit = defineEmits([
    "hex-click",
    "hex-context",
    "image-offset-change",
    "grid-offset-change",
    "grid-dims",
]);

const hexStore = useHexStore();
const mapStore = useMapStore();

const containerEl = ref(null);
const svgEl = ref(null);
const svgWidth = ref(800);
const svgHeight = ref(600);
const zoom = ref(1);
const pan = ref({ x: 0, y: 0 });
let panning = false;
let didPan = false;
let panStart = { x: 0, y: 0 };
let panOrigin = { x: 0, y: 0 };
const middlePanning = ref(false);
let middlePanStart = { x: 0, y: 0 };
let middlePanOrigin = { x: 0, y: 0 };

const imageNaturalWidth = ref(0);
const imageNaturalHeight = ref(0);

const localImageOffsetX = ref(0);
const localImageOffsetY = ref(0);
const localGridOffsetX = ref(0);
const localGridOffsetY = ref(0);

watch(
    () => props.mapImageOffsetX,
    (v) => {
        localImageOffsetX.value = v;
    },
    { immediate: true },
);
watch(
    () => props.mapImageOffsetY,
    (v) => {
        localImageOffsetY.value = v;
    },
    { immediate: true },
);
watch(
    () => props.mapGridOffsetX,
    (v) => {
        localGridOffsetX.value = v;
    },
    { immediate: true },
);
watch(
    () => props.mapGridOffsetY,
    (v) => {
        localGridOffsetY.value = v;
    },
    { immediate: true },
);

watch(
    () => props.mapImageUrl,
    (url) => {
        imageNaturalWidth.value = 0;
        imageNaturalHeight.value = 0;
        if (!url) return;
        const img = new Image();
        img.onload = () => {
            imageNaturalWidth.value = img.naturalWidth;
            imageNaturalHeight.value = img.naturalHeight;
        };
        img.src = url;
    },
    { immediate: true },
);

const imageLoading = computed(
    () => props.imageMode && !!props.mapImageUrl && imageNaturalWidth.value === 0,
);

const hexSize = computed(() =>
    props.imageMode ? props.mapHexWidth / 2 : HEX_SIZE,
);
const hexHProp = computed(() => (props.imageMode ? props.mapHexHeight : null));

const glowPoints = computed(() =>
    cornersToPoints(hexCorners(0, 0, hexSize.value, hexHProp.value))
);
const selectedGlowCenter = computed(() =>
    hexStore.selectedHex
        ? hexToPixel(hexStore.selectedHex.q, hexStore.selectedHex.r, hexSize.value, hexHProp.value)
        : null
);
const partyGlowCenter = computed(() =>
    hexStore.partyHex
        ? hexToPixel(hexStore.partyHex.q, hexStore.partyHex.r, hexSize.value, hexHProp.value)
        : null
);

const _pivot = computed(() => ({
    cx: (imageNaturalWidth.value * props.mapImageScale) / 2,
    cy: (imageNaturalHeight.value * props.mapImageScale) / 2,
}));

const imageTransform = computed(() => {
    const ox = localImageOffsetX.value;
    const oy = localImageOffsetY.value;
    const parts = [];
    if (ox !== 0 || oy !== 0) parts.push(`translate(${ox}, ${oy})`);
    if (props.imageMode && props.mapImageRotation) {
        const { cx, cy } = _pivot.value;
        parts.push(`rotate(${props.mapImageRotation}, ${cx}, ${cy})`);
    }
    return parts.join(" ");
});

const gridTransform = computed(() => {
    const ox = localGridOffsetX.value;
    const oy = localGridOffsetY.value;
    const parts = [];
    if (ox !== 0 || oy !== 0) parts.push(`translate(${ox}, ${oy})`);
    if (props.imageMode && props.mapGridRotation) {
        const { cx, cy } = _pivot.value;
        parts.push(`rotate(${props.mapGridRotation}, ${cx}, ${cy})`);
    }
    return parts.join(" ");
});

const IMAGE_GRID_MARGIN = 0.1;

const imageCoverCols = computed(() => {
    if (!(props.imageMode && imageNaturalWidth.value > 0 && hexSize.value > 0)) return 0;
    return Math.ceil((imageNaturalWidth.value * props.mapImageScale) / (hexSize.value * 1.5));
});

const imageCoverRows = computed(() => {
    const h = hexHProp.value ?? hexHeight(hexSize.value);
    if (!(props.imageMode && imageNaturalHeight.value > 0 && h > 0)) return 0;
    return Math.ceil((imageNaturalHeight.value * props.mapImageScale) / h);
});

const imageBufferCols = computed(() => Math.ceil(imageCoverCols.value * IMAGE_GRID_MARGIN));
const imageBufferRows = computed(() => Math.ceil(imageCoverRows.value * IMAGE_GRID_MARGIN));

const gridCols = computed(() => {
    if (imageCoverCols.value > 0) {
        if (props.mapGridCols != null) return Math.max(props.mapGridCols, imageCoverCols.value);
        return imageCoverCols.value + imageBufferCols.value * 2;
    }
    return props.mapGridCols ?? DEFAULT_GRID_COLS;
});

const gridRows = computed(() => {
    if (imageCoverRows.value > 0) {
        if (props.mapGridRows != null) return Math.max(props.mapGridRows, imageCoverRows.value);
        return imageCoverRows.value + imageBufferRows.value * 2;
    }
    return props.mapGridRows ?? DEFAULT_GRID_ROWS;
});

const visibleCoords = computed(() => {
    const cols = gridCols.value;
    const rows = gridRows.value;
    const coords = [];
    if (props.imageMode && imageCoverCols.value > 0) {
        const leftBuf = Math.floor((cols - imageCoverCols.value) / 2);
        const topBuf = Math.floor((rows - imageCoverRows.value) / 2);
        for (let q = -leftBuf; q < cols - leftBuf; q++) {
            const qOffset = Math.floor(q / 2);
            for (let r = -topBuf - qOffset; r < rows - topBuf - qOffset; r++) {
                coords.push({ q, r });
            }
        }
        return coords;
    }
    // qStart of -cols/3 keeps the default 90-col window at q in [-30, 60), the
    // exact extent maps rendered before grid size became adjustable.
    const qStart = -Math.floor(cols / 3);
    const rBuffer = Math.floor(rows / 2);
    for (let q = qStart; q < cols + qStart; q++) {
        const qOffset = Math.floor(q / 2);
        for (let r = -rBuffer - qOffset; r < rows - rBuffer - qOffset; r++) {
            coords.push({ q, r });
        }
    }
    return coords;
});

watch(
    [gridCols, gridRows],
    ([cols, rows]) => emit("grid-dims", { cols, rows }),
    { immediate: true },
);

function onPanStart(e) {
    const inMoveMode = props.moveMode !== "none";
    if (
        !inMoveMode &&
        !props.panMode &&
        e.target !== svgEl.value &&
        e.target.tagName !== "svg"
    )
        return;
    panning = true;
    didPan = false;
    panStart = { x: e.clientX, y: e.clientY };
    if (props.moveMode === "image") {
        panOrigin = { x: localImageOffsetX.value, y: localImageOffsetY.value };
    } else if (props.moveMode === "grid") {
        panOrigin = { x: localGridOffsetX.value, y: localGridOffsetY.value };
    } else {
        panOrigin = { x: pan.value.x, y: pan.value.y };
    }
}

function onMouseMove(e) {
    if (middlePanning.value) {
        pan.value = {
            x: middlePanOrigin.x + (e.clientX - middlePanStart.x),
            y: middlePanOrigin.y + (e.clientY - middlePanStart.y),
        };
    }
    if (!panning) return;
    const dx = e.clientX - panStart.x;
    const dy = e.clientY - panStart.y;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) didPan = true;
    if (props.moveMode === "image") {
        localImageOffsetX.value = panOrigin.x + dx;
        localImageOffsetY.value = panOrigin.y + dy;
    } else if (props.moveMode === "grid") {
        localGridOffsetX.value = panOrigin.x + dx;
        localGridOffsetY.value = panOrigin.y + dy;
    } else {
        pan.value = { x: panOrigin.x + dx, y: panOrigin.y + dy };
    }
}

function onPanEnd() {
    if (panning && didPan) {
        if (props.moveMode === "image") {
            emit(
                "image-offset-change",
                Math.round(localImageOffsetX.value),
                Math.round(localImageOffsetY.value),
            );
        } else if (props.moveMode === "grid") {
            emit(
                "grid-offset-change",
                Math.round(localGridOffsetX.value),
                Math.round(localGridOffsetY.value),
            );
        }
    }
    panning = false;
    didPan = false;
    middlePanning.value = false;
}

function onMiddlePanStart(e) {
    middlePanning.value = true;
    middlePanStart = { x: e.clientX, y: e.clientY };
    middlePanOrigin = { x: pan.value.x, y: pan.value.y };
}

function onWheel(e) {
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    zoom.value = Math.min(3, Math.max(0.3, zoom.value * factor));
}

function zoomIn() {
    zoom.value = Math.min(3, zoom.value * 1.2);
}
function zoomOut() {
    zoom.value = Math.max(0.3, zoom.value / 1.2);
}
function resetZoom() {
    zoom.value = 1;
}
function centerOnHex(q, r) {
    const { x: hx, y: hy } = hexToPixel(q, r, hexSize.value, hexHProp.value);
    pan.value = {
        x: svgWidth.value / 2 - (hx + localGridOffsetX.value) * zoom.value,
        y: svgHeight.value / 2 - (hy + localGridOffsetY.value) * zoom.value,
    };
}

defineExpose({ zoomIn, zoomOut, resetZoom, centerOnHex });

const resizeObserver = new ResizeObserver((entries) => {
    for (const entry of entries) {
        svgWidth.value = entry.contentRect.width;
        svgHeight.value = entry.contentRect.height;
    }
});

onMounted(() => {
    if (containerEl.value) {
        svgWidth.value = containerEl.value.clientWidth;
        svgHeight.value = containerEl.value.clientHeight;
        resizeObserver.observe(containerEl.value);
        pan.value = { x: svgWidth.value * 0.1, y: svgHeight.value * 0.1 };
    }
});

onUnmounted(() => {
    resizeObserver.disconnect();
});
</script>

<style scoped>
.hm-map-loading-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background: rgba(8, 12, 22, 0.72);
    backdrop-filter: blur(3px);
    z-index: 10;
    gap: 16px;
    pointer-events: none;
}

.hm-map-spinner {
    animation: hm-hex-spin 2.4s linear infinite;
    transform-origin: center;
}

@keyframes hm-hex-spin {
    from { transform: rotate(0deg); }
    to   { transform: rotate(360deg); }
}

.hm-map-loading-label {
    font-family: 'Cinzel', 'Cormorant Garamond', Georgia, serif;
    font-size: 11px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: rgba(212, 167, 75, 0.7);
}

.hm-map-fade-enter-active,
.hm-map-fade-leave-active {
    transition: opacity 0.3s ease;
}
.hm-map-fade-enter-from,
.hm-map-fade-leave-to {
    opacity: 0;
}
</style>
