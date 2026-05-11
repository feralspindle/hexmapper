<template>
    <div
        v-if="partyVisible"
        class="ds-party-panel"
        :style="{ left: `${pos.x}px`, top: `${pos.y}px` }"
    >
        <div class="ds-party-head" @mousedown="startDrag">
            <div class="ds-grip">
                <span v-for="i in 6" :key="i" />
            </div>

            <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.6"
                stroke-linecap="round"
                stroke-linejoin="round"
                style="color: var(--paper-3); flex: 0 0 auto"
            >
                <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M22 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
            </svg>

            <h4>The Party</h4>
            <span class="ds-party-meta">{{ onlineCount }} online</span>

            <button
                class="ds-panel-action"
                :style="collapsed ? 'transform:rotate(-90deg)' : ''"
                @click.stop="collapsed = !collapsed"
            >
                <svg
                    width="10"
                    height="10"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2.5"
                    stroke-linecap="round"
                >
                    <path d="M6 9l6 6 6-6" />
                </svg>
            </button>

            <button class="ds-panel-action" @click.stop="closeParty()">
                <svg
                    width="10"
                    height="10"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2.5"
                    stroke-linecap="round"
                >
                    <path d="M18 6L6 18M6 6l12 12" />
                </svg>
            </button>
        </div>

        <div v-if="!collapsed" class="ds-party-body">
            <div v-if="hasInitiative" class="ds-initiative-bar">
                <span>Initiative order</span>
                <button
                    v-if="isGM"
                    class="ds-clear-initiative"
                    @click="characterStore.clearAllInitiative()"
                >
                    Clear Initiative
                </button>
            </div>
            <div
                v-if="!partyCards.length"
                style="
                    font-family: var(--font-body);
                    font-style: italic;
                    font-size: 13px;
                    color: var(--ink-mute);
                    text-align: center;
                    padding: 16px 0;
                "
            >
                No party members yet
            </div>
            <div class="ds-party-grid">
                <div
                    v-for="card in sortedPartyCards"
                    :key="card.userId"
                    class="ds-player-card"
                    :class="{ me: card.userId === authStore.user?.id }"
                    :style="{ '--player-color': charColor(card.userId) }"
                >
                    <div style="display: flex; align-items: center; gap: 6px">
                        <span
                            v-if="
                                hasInitiative &&
                                card.char?.data?.initiative != null
                            "
                            class="ds-initiative-score"
                            >{{ card.char.data.initiative }}</span
                        >
                        <div
                            v-if="isOnline(card.userId)"
                            class="ds-online-dot"
                            title="Online"
                        />
                        <span class="ds-pc-name">{{ card.displayName }}</span>
                        <div
                            style="
                                display: flex;
                                align-items: center;
                                gap: 4px;
                                margin-left: auto;
                            "
                        ></div>
                    </div>
                    <div v-if="card.char?.data?.name" class="ds-pc-role">
                        {{ card.char.data.name }}
                    </div>

                    <div v-if="cardRole(card)" class="ds-pc-role">
                        {{ cardRole(card) }}
                    </div>

                    <div v-if="card.char?.data?.maxHitPoints" class="ds-hp-row">
                        <span style="min-width: 30px"
                            >{{
                                card.char.data.currentHp ??
                                card.char.data.maxHitPoints
                            }}/{{ card.char.data.maxHitPoints }}</span
                        >
                        <div class="ds-hp-bar">
                            <span :style="{ width: hpPct(card.char) + '%' }" />
                        </div>
                        <span
                            v-if="card.char?.data?.armorClass"
                            style="min-width: 22px; text-align: right"
                            >AC {{ card.char.data.armorClass }}</span
                        >
                    </div>

                    <div
                        v-else
                        style="
                            font-family: var(--font-mono);
                            font-size: 11px;
                            letter-spacing: 0.1em;
                            text-transform: uppercase;
                            color: var(--ink-mute);
                        "
                    >
                        {{
                            card.isGM
                                ? "Game Master"
                                : card.char
                                  ? ""
                                  : "No character"
                        }}
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from "vue";
import { useCharacterStore } from "@/stores/characterStore.js";
import { useSessionStore } from "@/stores/sessionStore.js";
import { useAuthStore } from "@/stores/authStore.js";
import { playerColorFor } from "@/composables/usePlayerColor.js";
import { usePartyPanel } from "@/composables/usePartyPanel.js";

const characterStore = useCharacterStore();

const sessionStore = useSessionStore();
const authStore = useAuthStore();

const { visible: partyVisible, close: closeParty } = usePartyPanel();

const STORAGE_KEY = "dm.partyPanel.pos";
const DEFAULT_POS = { x: 80, y: 88 };

const pos = ref({ ...DEFAULT_POS });
const collapsed = ref(false);

onMounted(() => {
    try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
        if (saved?.x !== undefined) pos.value = saved;
    } catch {}
});

function persistPos() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pos.value));
}

let dragStart = null;

function startDrag(e) {
    dragStart = {
        mx: e.clientX,
        my: e.clientY,
        px: pos.value.x,
        py: pos.value.y,
    };
    window.addEventListener("mousemove", onDragMove);
    window.addEventListener("mouseup", onDragUp);
}
function onDragMove(e) {
    if (!dragStart) return;
    pos.value = {
        x: Math.max(0, dragStart.px + (e.clientX - dragStart.mx)),
        y: Math.max(0, dragStart.py + (e.clientY - dragStart.my)),
    };
}
function onDragUp() {
    dragStart = null;
    persistPos();
    window.removeEventListener("mousemove", onDragMove);
    window.removeEventListener("mouseup", onDragUp);
}
onUnmounted(() => {
    window.removeEventListener("mousemove", onDragMove);
    window.removeEventListener("mouseup", onDragUp);
});

const isGM = computed(() => authStore.user?.id === sessionStore.sessionOwnerId);

const hasInitiative = computed(() =>
    partyCards.value.some((c) => c.char?.data?.initiative != null),
);

const sortedPartyCards = computed(() => {
    if (!hasInitiative.value) return partyCards.value;
    return [...partyCards.value].sort((a, b) => {
        const ai = a.char?.data?.initiative ?? -Infinity;
        const bi = b.char?.data?.initiative ?? -Infinity;
        return bi - ai;
    });
});

const onlineUserIds = computed(
    () =>
        new Set(sessionStore.onlineUsers.map((u) => u.user_id).filter(Boolean)),
);
const onlineCount = computed(() => onlineUserIds.value.size);

const partyCards = computed(() => {
    const result = [];
    const seen = new Set();

    const gmId = sessionStore.sessionOwnerId;
    if (gmId) {
        const gmMember = characterStore.memberSelections.find(
            (m) => m.user_id === gmId,
        );
        const gmPresence = sessionStore.onlineUsers.find(
            (u) => u.user_id === gmId,
        );
        result.push({
            userId: gmId,
            isGM: true,
            displayName:
                gmPresence?.display_name ?? gmMember?.display_name ?? null,
            char: null,
        });
        seen.add(gmId);
    }

    for (const member of characterStore.memberSelections) {
        if (seen.has(member.user_id)) continue;
        seen.add(member.user_id);

        const char = member.active_character_id
            ? (characterStore.characters.find(
                  (c) => c.id === member.active_character_id,
              ) ?? null)
            : null;

        const presence = sessionStore.onlineUsers.find(
            (u) => u.user_id === member.user_id,
        );

        result.push({
            userId: member.user_id,
            isGM: false,
            displayName: presence?.display_name ?? member.display_name ?? null,
            char,
        });
    }

    for (const user of sessionStore.onlineUsers) {
        if (!user.user_id || seen.has(user.user_id)) continue;
        seen.add(user.user_id);
        result.push({
            userId: user.user_id,
            isGM: false,
            displayName: user.display_name ?? null,
            char: null,
        });
    }

    return result;
});

function isOnline(userId) {
    return userId && onlineUserIds.value.has(userId);
}

function charColor(userId) {
    if (!userId) return "var(--ink-mute)";
    return playerColorFor(userId);
}

function cardRole(card) {
    if (card.isGM) return "";
    const d = card.char?.data;
    if (!d) return "";
    const parts = [d.ancestry, d.class ?? d.characterClass].filter(Boolean);
    if (d.level) parts.push(`Lvl ${d.level}`);
    return parts.join(" · ");
}

function hpPct(char) {
    const max = char?.data?.maxHitPoints ?? 0;
    if (!max) return 0;
    return Math.round(
        Math.min(100, Math.max(0, ((char.data?.currentHp ?? max) / max) * 100)),
    );
}
</script>
