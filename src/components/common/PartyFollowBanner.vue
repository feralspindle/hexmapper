<template>
    <Transition name="party-follow">
        <div v-if="invite" class="ds-party-follow" data-testid="party-follow-banner">
            <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                style="color: var(--accent); flex: 0 0 auto"
            >
                <path d="M3 21v-8l9-9 9 9v8h-6v-6h-6v6z" />
            </svg>
            <span class="ds-pf-body"
                >The party has entered
                <span class="ds-pf-name">{{
                    invite.name ?? "a dungeon"
                }}</span></span
            >
            <button
                class="ds-pf-join"
                data-testid="party-follow-join"
                @click="join"
            >
                Join
            </button>
            <button
                class="ds-pf-close"
                data-testid="party-follow-dismiss"
                @click="dismiss"
            >
                ×
            </button>
        </div>
    </Transition>
</template>

<script setup>
import { usePartyFollow } from "@/composables/usePartyFollow.js";
import { useHexStore } from "@/stores/hexStore.js";

const { invite, dismiss } = usePartyFollow();
const hexStore = useHexStore();

function join() {
    const dungeonId = invite.value?.dungeonId;
    dismiss();
    if (dungeonId) hexStore.navigateToDungeon(dungeonId);
}
</script>

<style scoped>
.ds-party-follow {
    position: absolute;
    top: 12px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 30;
    display: flex;
    align-items: center;
    gap: 10px;
    background: var(--paper-2, #e3d4b3);
    border: 1px solid var(--rule-strong, rgba(26, 20, 16, 0.42));
    padding: 9px 12px;
    box-shadow:
        1px 0 0 rgba(255, 255, 255, 0.4) inset,
        0 4px 12px rgba(0, 0, 0, 0.25);
    user-select: none;
}

.ds-pf-body {
    font-family: var(--font-body, serif);
    font-size: 13px;
    color: var(--ink-2, #3a2e22);
    white-space: nowrap;
}

.ds-pf-name {
    font-family: var(--font-display, "IM Fell English", serif);
    font-style: italic;
    color: var(--accent, #8a1c1c);
}

.ds-pf-join {
    background: var(--accent, #8a1c1c);
    border: 0;
    color: var(--paper, #f2e8d5);
    font-family: var(--font-body, serif);
    font-size: 12px;
    letter-spacing: 0.04em;
    padding: 4px 12px;
    cursor: pointer;
    transition: filter 0.12s;
}
.ds-pf-join:hover {
    filter: brightness(1.15);
}

.ds-pf-close {
    background: transparent;
    border: 0;
    color: var(--ink-mute, #8a7a68);
    font-size: 16px;
    line-height: 1;
    cursor: pointer;
    padding: 0 0 0 2px;
    flex: 0 0 auto;
    transition: color 0.12s;
}
.ds-pf-close:hover {
    color: var(--accent, #8a1c1c);
}

.party-follow-enter-active {
    transition: all 0.15s ease-out;
}
.party-follow-leave-active {
    transition: all 0.2s ease-in;
}
.party-follow-enter-from,
.party-follow-leave-to {
    opacity: 0;
    transform: translateX(-50%) translateY(-8px);
}
</style>
