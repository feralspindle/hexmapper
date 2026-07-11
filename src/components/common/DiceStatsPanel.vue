<template>
    <div class="ds-panel-section" :class="{ collapsed: !open }" style="flex: 0 0 auto">
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
                <path d="M4 20V10" />
                <path d="M10 20V4" />
                <path d="M16 20v-7" />
                <path d="M2 20h20" />
            </svg>
            <h3>Stats</h3>
            <span class="ds-meta">{{ rollCount }} rolls</span>
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

        <div class="ds-section-body">
            <div class="dstat-toggle">
                <button class="ds-btn tiny" :class="{ ghost: range !== 'tonight' }" @click="range = 'tonight'">Tonight</button>
                <button class="ds-btn tiny" :class="{ ghost: range !== 'all' }" @click="range = 'all'">All-time</button>
            </div>

            <div class="dstat-block">
                <div class="dstat-title">Leaderboard</div>
                <div v-if="!leaderboard.length" class="dstat-empty">not enough rolls yet</div>
                <div
                    v-for="(player, i) in leaderboard"
                    :key="player.userId"
                    class="dstat-row"
                >
                    <span class="dstat-rank">{{ i + 1 }}</span>
                    <span class="dstat-name" :style="{ color: playerColorFor(player.userId) }">
                        {{ gmName(player.userId, player.displayName, player.characterId) }}
                    </span>
                    <span class="dstat-z" :class="player.avgZ >= 0 ? 'pos' : 'neg'">{{ fmtZ(player.avgZ) }}</span>
                    <span class="dstat-sub">{{ ordinal(player.avgPercentile) }} · {{ player.count }}</span>
                </div>
            </div>

            <div class="dstat-block">
                <div class="dstat-title">Party skills</div>
                <div v-if="!skills.length" class="dstat-empty">no labeled rolls yet</div>
                <template v-else>
                    <div class="dstat-line">
                        <span class="dstat-tag pos">best</span>
                        <span class="dstat-name">{{ skillName(best.label) }}</span>
                        <span class="dstat-z pos">{{ fmtZ(best.avgZ) }}</span>
                    </div>
                    <div v-if="worst && worst !== best" class="dstat-line">
                        <span class="dstat-tag neg">worst</span>
                        <span class="dstat-name">{{ skillName(worst.label) }}</span>
                        <span class="dstat-z" :class="worst.avgZ >= 0 ? 'pos' : 'neg'">{{ fmtZ(worst.avgZ) }}</span>
                    </div>
                </template>
            </div>

            <div v-if="bestAt.length" class="dstat-block">
                <div class="dstat-title">Best at each skill</div>
                <div v-for="entry in bestAt" :key="entry.label ?? '_'" class="dstat-line">
                    <span class="dstat-skill">{{ skillName(entry.label) }}</span>
                    <span class="dstat-name" :style="{ color: playerColorFor(entry.userId) }">{{ entry.displayName }}</span>
                    <span class="dstat-z" :class="entry.avgZ >= 0 ? 'pos' : 'neg'">{{ fmtZ(entry.avgZ) }}</span>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useDiceStatsStore } from '@/stores/diceStatsStore.js'
import { useGMLabel } from '@/composables/useGMLabel.js'
import { playerColorFor } from '@/composables/usePlayerColor.js'

const statsStore = useDiceStatsStore()
const { gmName } = useGMLabel()

const open = ref(false)
const range = ref('tonight')

const rollCount = computed(() => statsStore.rolls.length)
const leaderboard = computed(() => range.value === 'tonight' ? statsStore.leaderboardTonight : statsStore.leaderboardAllTime)
const skills = computed(() => range.value === 'tonight' ? statsStore.skillsTonight : statsStore.skillsAllTime)
const bestAt = computed(() => range.value === 'tonight' ? statsStore.bestAtTonight : statsStore.bestAtAllTime)

const best = computed(() => skills.value[0])
const worst = computed(() => skills.value[skills.value.length - 1])

function fmtZ(z) {
    return `${z >= 0 ? '+' : '−'}${Math.abs(z).toFixed(2)}σ`
}

function ordinal(value) {
    const n = Math.round(value)
    const tens = n % 100
    if (tens >= 11 && tens <= 13) return `${n}th`
    return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`
}

function skillName(label) {
    return label ?? 'unlabeled'
}
</script>

<style scoped>
.dstat-toggle {
    display: flex;
    gap: 6px;
}
.dstat-block {
    display: flex;
    flex-direction: column;
    gap: 4px;
}
.dstat-title {
    font-family: var(--font-zine);
    font-size: 10px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--ink-mute);
}
.dstat-empty {
    font-family: var(--font-body);
    font-style: italic;
    font-size: 12px;
    color: var(--ink-mute);
}
.dstat-row,
.dstat-line {
    display: flex;
    align-items: baseline;
    gap: 8px;
    font-size: 12px;
}
.dstat-rank {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--ink-mute);
    min-width: 12px;
    text-align: right;
}
.dstat-name {
    font-weight: 600;
    color: var(--ink);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.dstat-row .dstat-name,
.dstat-line .dstat-name {
    flex: 1;
    min-width: 0;
}
.dstat-skill {
    font-family: var(--font-body);
    color: var(--ink-2, var(--ink));
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.dstat-z {
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: 700;
    flex: 0 0 auto;
}
.dstat-z.pos {
    color: var(--gold, #c8a827);
}
.dstat-z.neg {
    color: var(--accent-2, #b8541c);
}
.dstat-sub {
    font-family: var(--font-mono);
    font-size: 10px;
    color: var(--ink-mute);
    flex: 0 0 auto;
}
.dstat-tag {
    font-family: var(--font-zine);
    font-size: 9px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    flex: 0 0 auto;
    min-width: 34px;
}
.dstat-tag.pos {
    color: var(--gold, #c8a827);
}
.dstat-tag.neg {
    color: var(--accent-2, #b8541c);
}
</style>
