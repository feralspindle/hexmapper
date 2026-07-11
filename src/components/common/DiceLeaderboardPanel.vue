<template>
    <div class="lb-panel">
        <div class="lb-toggle">
            <button class="ds-btn tiny" :class="{ ghost: range !== 'tonight' }" @click="range = 'tonight'">Tonight</button>
            <button class="ds-btn tiny" :class="{ ghost: range !== 'all' }" @click="range = 'all'">All-time</button>
        </div>

        <div v-if="!board.length" class="lb-empty">not enough rolls yet</div>

        <div
            v-for="(player, i) in board"
            :key="player.userId"
            class="lb-card"
            :style="{ '--player-color': playerColorFor(player.userId) }"
        >
            <div class="lb-head">
                <span class="lb-rank" :class="{ top: i === 0 }">{{ i + 1 }}</span>
                <span class="lb-name">{{ gmName(player.userId, player.displayName, player.characterId) }}</span>
                <div v-if="isOnline(player.userId)" class="ds-online-dot" title="Online" />
            </div>

            <div class="lb-chips">
                <div class="lb-luck-chip" :class="player.avgZ >= 0 ? 'pos' : 'neg'" :title="luckTitle(player)">
                    <div class="lb-luck-top">
                        <span class="lb-luck-lead">
                            <span class="lb-luck-pct">{{ ordinal(player.avgPercentile) }}</span>
                            <span class="lb-luck-unit">pct</span>
                        </span>
                        <span class="lb-luck-z">{{ formatZ(player.avgZ) }}</span>
                    </div>
                    <div class="lb-luck-bar">
                        <span :style="{ width: barWidth(player) }" />
                    </div>
                </div>
                <span class="lb-rolls-chip">
                    <span class="lb-rolls-num">{{ player.count }}</span>
                    <span class="lb-rolls-label">rolls</span>
                </span>
            </div>
        </div>
    </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useDiceStatsStore } from '@/stores/diceStatsStore.js'
import { useSessionStore } from '@/stores/sessionStore.js'
import { useGMLabel } from '@/composables/useGMLabel.js'
import { playerColorFor } from '@/composables/usePlayerColor.js'
import { formatZ, ordinal } from '@/lib/diceStats.js'

const statsStore = useDiceStatsStore()
const sessionStore = useSessionStore()
const { gmName } = useGMLabel()

const range = ref('tonight')

const board = computed(() => range.value === 'tonight' ? statsStore.leaderboardTonight : statsStore.leaderboardAllTime)

const onlineIds = computed(() => new Set(sessionStore.onlineUsers.map(u => u.user_id).filter(Boolean)))
function isOnline(userId) {
    return onlineIds.value.has(userId)
}

function barWidth(player) {
    return `${Math.max(2, Math.min(100, player.avgPercentile))}%`
}

function luckTitle(player) {
    return `averages to the ${ordinal(player.avgPercentile)} percentile (${formatZ(player.avgZ)} vs the expected roll)`
}
</script>

<style scoped>
.lb-panel {
    display: flex;
    flex-direction: column;
    gap: 8px;
}
.lb-toggle {
    display: flex;
    gap: 6px;
    margin-bottom: 2px;
}
.lb-empty {
    font-family: var(--font-body);
    font-style: italic;
    font-size: 13px;
    color: var(--ink-mute);
    text-align: center;
    padding: 16px 0;
}
.lb-card {
    position: relative;
    background: var(--paper);
    border: 1px solid var(--ink-2);
    border-left: 3px solid var(--player-color, var(--ink-mute));
    padding: 8px 10px 9px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
    overflow: hidden;
}
.lb-head {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
}
.lb-rank {
    font-family: var(--font-mono);
    font-size: 12px;
    font-weight: 700;
    color: var(--ink-soft);
    background: var(--paper-3);
    border: 1px solid var(--rule);
    border-radius: 3px;
    min-width: 20px;
    height: 20px;
    display: grid;
    place-items: center;
    flex: 0 0 auto;
}
.lb-rank.top {
    color: var(--ink);
    background: color-mix(in srgb, var(--gold, #c8a827) 30%, var(--paper));
    border-color: var(--gold, #c8a827);
}
.lb-name {
    font-family: var(--font-display);
    font-style: italic;
    font-size: 16px;
    color: var(--ink);
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.lb-chips {
    display: flex;
    align-items: stretch;
    gap: 6px;
}
.lb-luck-chip {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 5px;
    font-family: var(--font-mono);
    padding: 5px 8px 6px;
    border-radius: 3px;
    border: 1px solid;
}
.lb-luck-chip.pos {
    color: #8a6d12;
    background: color-mix(in srgb, var(--gold, #c8a827) 10%, transparent);
    border-color: color-mix(in srgb, var(--gold, #c8a827) 40%, transparent);
}
.lb-luck-chip.neg {
    color: #8a3b12;
    background: color-mix(in srgb, var(--accent-2, #b8541c) 10%, transparent);
    border-color: color-mix(in srgb, var(--accent-2, #b8541c) 35%, transparent);
}
.lb-luck-top {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 6px;
    line-height: 1;
}
.lb-luck-lead {
    display: flex;
    align-items: baseline;
    gap: 3px;
    min-width: 0;
}
.lb-luck-pct {
    font-size: 16px;
    font-weight: 700;
}
.lb-luck-unit {
    font-size: 9px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    opacity: 0.6;
}
.lb-luck-z {
    font-size: 11px;
    opacity: 0.7;
    flex: 0 0 auto;
}
.lb-luck-bar {
    height: 4px;
    background: rgba(0, 0, 0, 0.08);
    position: relative;
    overflow: hidden;
    border-radius: 2px;
}
.lb-luck-bar > span {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    display: block;
    background: currentColor;
    opacity: 0.75;
    transition: width 0.3s;
}
.lb-rolls-chip {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1px;
    font-family: var(--font-mono);
    color: var(--ink-soft);
    background: var(--paper-3);
    border: 1px solid var(--rule);
    padding: 4px 10px;
    border-radius: 3px;
    min-width: 44px;
    flex: 0 0 auto;
}
.lb-rolls-num {
    font-size: 18px;
    font-weight: 700;
    line-height: 1.1;
    color: var(--ink);
}
.lb-rolls-label {
    font-size: 8px;
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    opacity: 0.6;
    line-height: 1;
}
</style>
