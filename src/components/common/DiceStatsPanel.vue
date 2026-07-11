<template>
    <div class="dstat-panel">
        <div class="dstat-toggle">
            <button class="ds-btn tiny" :class="{ ghost: range !== 'tonight' }" @click="range = 'tonight'">Tonight</button>
            <button class="ds-btn tiny" :class="{ ghost: range !== 'all' }" @click="range = 'all'">All-time</button>
        </div>

        <div class="dstat-block">
            <div class="dstat-title">Party skills</div>
            <div v-if="!skills.length" class="dstat-empty">no labeled rolls yet</div>
            <template v-else>
                <div class="dstat-line">
                    <span class="dstat-tag pos">best</span>
                    <span class="dstat-name">{{ skillName(best.label) }}</span>
                    <span class="dstat-z pos">{{ formatZ(best.avgZ) }}</span>
                </div>
                <div v-if="worst && worst !== best" class="dstat-line">
                    <span class="dstat-tag neg">worst</span>
                    <span class="dstat-name">{{ skillName(worst.label) }}</span>
                    <span class="dstat-z" :class="worst.avgZ >= 0 ? 'pos' : 'neg'">{{ formatZ(worst.avgZ) }}</span>
                </div>
            </template>
        </div>

        <div v-if="streaks.hot || streaks.cold" class="dstat-block">
            <div class="dstat-title">Longest streaks</div>
            <div v-if="streaks.hot" class="dstat-line">
                <span class="dstat-tag pos">hot</span>
                <span class="dstat-name">{{ gmName(streaks.hot.userId, streaks.hot.displayName) }}</span>
                <span class="dstat-z pos">×{{ streaks.hot.count }}</span>
            </div>
            <div v-if="streaks.cold" class="dstat-line">
                <span class="dstat-tag neg">cold</span>
                <span class="dstat-name">{{ gmName(streaks.cold.userId, streaks.cold.displayName) }}</span>
                <span class="dstat-z neg">×{{ streaks.cold.count }}</span>
            </div>
        </div>

        <div v-if="bestAt.length" class="dstat-block">
            <div class="dstat-title">Best at each skill</div>
            <div v-for="entry in bestAt" :key="entry.label ?? '_'" class="dstat-line">
                <span class="dstat-skill">{{ skillName(entry.label) }}</span>
                <span class="dstat-name" :style="{ color: playerColorFor(entry.userId) }">{{ entry.displayName }}</span>
                <span class="dstat-z" :class="entry.avgZ >= 0 ? 'pos' : 'neg'">{{ formatZ(entry.avgZ) }}</span>
            </div>
        </div>
    </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useDiceStatsStore } from '@/stores/diceStatsStore.js'
import { useGMLabel } from '@/composables/useGMLabel.js'
import { playerColorFor } from '@/composables/usePlayerColor.js'
import { formatZ } from '@/lib/diceStats.js'

const statsStore = useDiceStatsStore()
const { gmName } = useGMLabel()

const range = ref('tonight')

const skills = computed(() => range.value === 'tonight' ? statsStore.skillsTonight : statsStore.skillsAllTime)
const bestAt = computed(() => range.value === 'tonight' ? statsStore.bestAtTonight : statsStore.bestAtAllTime)
const streaks = computed(() => range.value === 'tonight' ? statsStore.streaksTonight : statsStore.streaksAllTime)

const best = computed(() => skills.value[0])
const worst = computed(() => skills.value[skills.value.length - 1])

function skillName(label) {
    return label ?? 'unlabeled'
}
</script>

<style scoped>
.dstat-panel {
    display: flex;
    flex-direction: column;
    gap: 14px;
}
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
.dstat-line {
    display: flex;
    align-items: baseline;
    gap: 8px;
    font-size: 12px;
}
.dstat-name {
    font-weight: 600;
    color: var(--ink);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
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
