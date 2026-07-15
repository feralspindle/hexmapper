<template>
    <div class="hm-mode-picker">
        <div class="hm-mode-picker-head">
            <h1>Begin dungeon</h1>
            <p>
                Pick how the party will map this dungeon.
                <b>You can switch at any time</b> — the drawing tools work in
                both modes.
            </p>
        </div>

        <div class="hm-mode-picker-grid">
            <div class="hm-mode-card">
                <div class="hm-mode-icon">
                    <svg
                        width="32"
                        height="32"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="1.6"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                    >
                        <path d="M20 17.58A5 5 0 0018 8h-1.26A8 8 0 104 15.25" />
                        <path d="M8 16h.01M12 19h.01M16 16h.01" />
                    </svg>
                </div>
                <h2>Fog of War</h2>
                <p class="hm-mode-tagline">GM has the map.</p>
                <ul class="hm-mode-bullets">
                    <li>Upload a dungeon map, or draw one</li>
                    <li>Everything starts hidden under fog</li>
                    <li>Reveal cells as the party explores</li>
                    <li>Rooms, corridors &amp; doors still drawable</li>
                </ul>

                <template v-if="!bgUrl">
                    <button
                        class="ds-btn"
                        data-testid="dungeon-mode-fow-upload"
                        style="
                            width: 100%;
                            justify-content: center;
                            padding: 10px 14px;
                            display: flex;
                            align-items: center;
                            gap: 8px;
                        "
                        @click="fileRef?.click()"
                    >
                        <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                        >
                            <path d="M12 3v14M6 9l6-6 6 6" />
                            <path d="M3 21h18" />
                        </svg>
                        Upload dungeon map
                    </button>
                    <input
                        ref="fileRef"
                        type="file"
                        accept="image/*"
                        style="display: none"
                        @change="handleFile"
                    />
                    <button
                        class="ds-btn ghost"
                        data-testid="dungeon-mode-fow-nomap"
                        style="
                            width: 100%;
                            justify-content: center;
                            margin-top: 6px;
                        "
                        @click="$emit('pick-fow', null)"
                    >
                        Or begin without a map
                    </button>
                </template>

                <template v-else>
                    <div class="hm-mode-preview">
                        <img :src="bgUrl" alt="" />
                    </div>
                    <button
                        class="ds-btn"
                        data-testid="dungeon-mode-fow-begin"
                        style="
                            width: 100%;
                            justify-content: center;
                            padding: 10px 14px;
                            background: var(--accent);
                            border-color: var(--accent);
                        "
                        @click="$emit('pick-fow', pendingFile)"
                    >
                        Begin with this map →
                    </button>
                    <button
                        class="ds-btn ghost"
                        style="
                            width: 100%;
                            justify-content: center;
                            margin-top: 6px;
                        "
                        @click="
                            bgUrl = null;
                            pendingFile = null;
                        "
                    >
                        Choose different
                    </button>
                </template>
            </div>

            <div class="hm-mode-card">
                <div class="hm-mode-icon">
                    <svg
                        width="32"
                        height="32"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="1.6"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                    >
                        <rect x="3" y="5" width="18" height="14" />
                    </svg>
                </div>
                <h2>Blank Slate</h2>
                <p class="hm-mode-tagline">No fog. The party sees it all.</p>
                <ul class="hm-mode-bullets">
                    <li>Empty grid to start</li>
                    <li>Draw rooms, corridors &amp; doors</li>
                    <li>Everyone sees everything drawn</li>
                    <li>Drop tokens &amp; annotate rooms</li>
                </ul>
                <div style="flex: 1" />
                <p
                    v-if="hasMapImage"
                    class="hm-mode-tagline"
                    style="color: var(--accent); margin-bottom: 6px"
                >
                    Removes the uploaded map image.
                </p>
                <button
                    class="ds-btn"
                    data-testid="dungeon-mode-blank"
                    style="
                        width: 100%;
                        justify-content: center;
                        padding: 10px 14px;
                        background: var(--accent-3);
                        border-color: var(--accent-3);
                    "
                    @click="$emit('pick-blank')"
                >
                    Begin with empty grid →
                </button>
            </div>
        </div>
    </div>
</template>

<script setup>
import { ref } from "vue";

defineProps({
    hasMapImage: { type: Boolean, default: false },
});

defineEmits(["pick-fow", "pick-blank"]);

const fileRef = ref(null);
const bgUrl = ref(null);
const pendingFile = ref(null);

function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    pendingFile.value = file;
    const reader = new FileReader();
    reader.onload = (ev) => {
        bgUrl.value = ev.target.result;
    };
    reader.readAsDataURL(file);
}
</script>
