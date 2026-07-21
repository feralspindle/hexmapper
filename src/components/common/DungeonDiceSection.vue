<template>
    <div
        class="ds-panel-section"
        :class="{ collapsed: !open }"
        style="flex: 0 0 auto"
    >
        <div class="ds-section-head" @click="open = !open">
            <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.6"
                stroke-linecap="round"
                style="flex: 0 0 auto"
            >
                <rect x="2" y="2" width="9" height="9" rx="1" />
                <rect x="13" y="2" width="9" height="9" rx="1" />
                <rect x="13" y="13" width="9" height="9" rx="1" />
                <rect x="2" y="13" width="9" height="9" rx="1" />
            </svg>
            <h3>Dice</h3>
            <span class="ds-meta">{{ historyRolls.length }} rolls</span>
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

        <div class="ds-section-body" style="padding-bottom: 0">
            <div
                style="
                    display: flex;
                    gap: 4px;
                    flex-wrap: wrap;
                    margin-bottom: 4px;
                "
            >
                <button
                    v-for="die in DICE"
                    :key="die"
                    class="ds-die-btn"
                    :class="{ active: pending[die] > 0 }"
                    :title="`Left-click add ${die}, right-click remove`"
                    data-testid="dice-die"
                    :data-die="die"
                    @click="addDie(die)"
                    @contextmenu.prevent="removeDie(die)"
                >
                    <component :is="DIE_ICONS[die]" :size="16" />
                    <span
                        style="
                            font-family: var(--font-mono);
                            font-size: 10px;
                            line-height: 1;
                        "
                        >{{ die === "d100" ? "d%" : die }}</span
                    >
                    <span
                        v-if="pending[die] > 0"
                        style="
                            position: absolute;
                            top: -5px;
                            right: -5px;
                            min-width: 15px;
                            height: 15px;
                            border-radius: 50%;
                            background: var(--gold);
                            color: var(--ink);
                            font-family: var(--font-mono);
                            font-size: 8px;
                            font-weight: bold;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            padding: 0 2px;
                            line-height: 1;
                        "
                        >{{ pending[die] }}</span
                    >
                </button>
            </div>

            <div style="position: relative; margin-bottom: 6px">
                <div
                    style="
                        font-family: var(--font-mono);
                        font-size: 14px;
                        padding: 4px 20px 4px 0;
                        border-bottom: 1px solid;
                        white-space: nowrap;
                        overflow: hidden;
                        text-overflow: ellipsis;
                        transition:
                            color 0.15s,
                            border-color 0.15s;
                    "
                    :style="
                        hasDice
                            ? 'color:var(--ink);border-color:color-mix(in srgb, var(--gold) 45%, transparent)'
                            : 'color:var(--ink-mute);border-color:var(--rule);font-style:italic'
                    "
                >
                    {{ formula || "tap dice to add…" }}
                </div>
                <button
                    v-if="hasAnything"
                    title="Clear"
                    style="
                        position: absolute;
                        right: 0;
                        top: 50%;
                        transform: translateY(-50%);
                        background: none;
                        border: none;
                        padding: 0 4px;
                        font-size: 11px;
                        line-height: 1;
                        color: var(--ink-mute);
                        cursor: pointer;
                        transition: color 0.15s;
                    "
                    @mouseenter="(e) => (e.target.style.color = 'var(--ink)')"
                    @mouseleave="
                        (e) => (e.target.style.color = 'var(--ink-mute)')
                    "
                    @click="clear"
                >
                    <i class="fa-solid fa-trash-can" />
                </button>
            </div>

            <div
                style="
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    margin-bottom: 4px;
                "
            >
                <button class="ds-btn tiny ghost" @click="modifier--">−</button>
                <span
                    style="
                        font-family: var(--font-mono);
                        font-size: 13px;
                        min-width: 24px;
                        text-align: center;
                    "
                    :style="
                        modifier !== 0
                            ? 'color:var(--ink-2)'
                            : 'color:var(--ink-mute)'
                    "
                    >{{ modifier >= 0 ? "+" + modifier : modifier }}</span
                >
                <button class="ds-btn tiny ghost" @click="modifier++">+</button>
                <span
                    style="
                        font-family: var(--font-zine);
                        font-size: 9px;
                        letter-spacing: 0.12em;
                        text-transform: uppercase;
                        color: var(--ink-mute);
                        opacity: 0.6;
                    "
                    >mod</span
                >
                <div style="flex: 1" />
                <button
                    v-if="hasDice && !savingMacro"
                    class="ds-btn tiny ghost"
                    @click="startSaveMacro"
                    style="padding-left: 6px; padding-right: 6px"
                    v-tooltip.top="'Save as macro'"
                >
                    <i class="fa-solid fa-floppy-disk" />
                </button>
                <button
                    class="ds-btn tiny"
                    :disabled="!hasDice"
                    data-testid="dice-roll"
                    @click="roll"
                >
                    Roll!
                </button>
            </div>

            <div
                v-if="macroStore.macros.length || savingMacro"
                style="margin-bottom: 4px"
            >
                <div
                    v-if="savingMacro"
                    style="
                        display: flex;
                        align-items: center;
                        gap: 4px;
                        margin-bottom: 4px;
                    "
                >
                    <input
                        ref="macroLabelInput"
                        v-model="macroLabel"
                        type="text"
                        placeholder="Macro label…"
                        maxlength="40"
                        style="
                            flex: 1;
                            min-width: 0;
                            background: var(--surface-2);
                            border: 1px solid var(--rule);
                            border-radius: 3px;
                            padding: 2px 6px;
                            font-size: 12px;
                            color: var(--ink);
                            outline: none;
                        "
                        @keydown.enter.prevent="confirmSaveMacro"
                        @keydown.escape="cancelSaveMacro"
                    />
                    <button class="ds-btn tiny" @click="confirmSaveMacro">
                        ✓
                    </button>
                    <button
                        class="ds-btn tiny ghost"
                        @click="cancelSaveMacro"
                        style="font-size: 14px; line-height: 1"
                    >
                        &times;
                    </button>
                </div>
                <div
                    v-for="macro in macroStore.macros"
                    :key="macro.id"
                    style="
                        display: flex;
                        align-items: center;
                        gap: 4px;
                        margin-bottom: 2px;
                    "
                    class="ds-macro-row"
                >
                    <button
                        class="ds-btn tiny ghost ds-macro-btn"
                        style="
                            flex: 1;
                            min-width: 0;
                            display: flex;
                            align-items: baseline;
                            gap: 6px;
                            text-align: left;
                            overflow: hidden;
                        "
                        :disabled="!!diceStore.pendingRoll"
                        @click="fireMacro(macro)"
                    >
                        <span
                            style="
                                font-family: var(--font-zine);
                                font-size: 11px;
                                color: var(--ink);
                                overflow: hidden;
                                text-overflow: ellipsis;
                                white-space: nowrap;
                            "
                            >{{ macro.label }}</span
                        >
                        <span
                            style="
                                font-family: var(--font-mono);
                                font-size: 10px;
                                color: var(--ink-mute);
                                flex-shrink: 0;
                                margin-left: auto;
                            "
                            >{{ formatMacroExpr(macro) }}</span
                        >
                    </button>
                    <button
                        class="ds-macro-delete"
                        @click="macroStore.deleteMacro(macro.id)"
                    >
                        <i class="fa-solid fa-trash-can" />
                    </button>
                </div>
            </div>
        </div>

        <button v-if="hasUnseen" class="ds-new-rolls-bar" @click="scrollToTop">
            ↑ New rolls
        </button>

        <div
            ref="scrollEl"
            class="ds-section-body"
            data-split-target
            style="
                height: var(--dice-history-h, auto);
                max-height: var(--dice-history-h, 220px);
                border-top: 1px solid var(--rule);
                padding-top: 8px;
            "
            @scroll="onScroll"
        >
            <div
                v-if="!historyRolls.length"
                style="
                    font-family: var(--font-body);
                    font-style: italic;
                    font-size: 13px;
                    color: var(--ink-mute);
                    text-align: center;
                    padding: 12px 0;
                "
            >
                No rolls yet
            </div>

            <div
                v-for="entry in historyRolls"
                :key="entry.id"
                class="ds-roll-row"
                :class="{
                    crit: isCrit(entry),
                    fumble: isFumble(entry),
                    'hot-streak': entry.streak?.kind === 'hot',
                    'cold-streak': entry.streak?.kind === 'cold',
                }"
                :style="{ '--roll-color': rollColor(entry.user_id) }"
                data-testid="dice-roll-row"
            >
                <div class="ds-roll-dot" />
                <div>
                    <div class="ds-roll-who-row">
                        <span class="ds-roll-who" :style="{ color: rollColor(entry.user_id) }">{{ gmName(entry.user_id, entry.display_name, entry.character_id) }}</span>
                        <span v-if="entry.label" class="ds-roll-label">{{ entry.label }}</span>
                        <span
                            v-if="entry.streak"
                            class="ds-roll-streak"
                            :class="`ds-roll-streak--${entry.streak.kind}`"
                            :title="streakTitle(entry)"
                        >
                            <i :class="entry.streak.kind === 'hot' ? 'fa-solid fa-arrow-trend-up' : 'fa-solid fa-arrow-trend-down'" />
                            <span>{{ streakLabel(entry) }}</span>
                        </span>
                    </div>
                    <div class="ds-roll-expr">{{ formatExpr(entry) }}</div>
                    <div v-if="entry.results?.length" class="ds-roll-breakdown">
                        [<template v-for="(r, i) in entry.results" :key="i"
                            ><span
                                :class="
                                    r.value === 20 && r.die === 'd20'
                                        ? 'result-crit'
                                        : r.value === 1 && r.die === 'd20'
                                          ? 'result-fumble'
                                          : ''
                                "
                                >{{ r.value }}</span
                            ><span
                                v-if="i < entry.results.length - 1"
                                class="result-sep"
                                >,
                            </span></template
                        >]
                    </div>
                    <div class="ds-roll-when">
                        {{ timeAgo(entry.created_at) }}
                        <button
                            v-if="annotatingId !== entry.id"
                            class="ds-roll-note-add"
                            title="Add note"
                            @click="startAnnotating(entry.id)"
                        ><i class="fa-solid fa-pencil" /></button>
                        <button
                            class="ds-roll-note-add"
                            title="Pin to journal"
                            data-testid="dice-pin"
                            @click="pinRoll(entry)"
                        ><i class="fa-solid fa-thumbtack" /></button>
                    </div>

                    <div
                        v-if="diceStore.annotations[entry.id]?.length || annotatingId === entry.id"
                        class="ds-roll-notes"
                    >
                        <div
                            v-for="ann in diceStore.annotations[entry.id] ?? []"
                            :key="ann.id"
                            class="ds-roll-note"
                            :class="{ pending: String(ann.id).startsWith('pending-') }"
                        >
                            <span class="ds-roll-note-arrow">↳</span>
                            <span class="ds-roll-note-who" :style="{ color: rollColor(ann.user_id) }">{{ gmName(ann.user_id, ann.display_name) }}</span>
                            <span class="ds-roll-note-sep">·</span>
                            <span class="ds-roll-note-body">{{ ann.body }}</span>
                        </div>

                        <div v-if="annotatingId === entry.id" class="ds-roll-note-edit">
                            <span class="ds-roll-note-arrow">↳</span>
                            <input
                                :ref="el => { if (el) el.focus() }"
                                v-model="annotationDraft"
                                type="text"
                                placeholder="Add note… (Enter)"
                                maxlength="200"
                                class="ds-roll-note-input"
                                @keydown.enter.prevent="submitAnnotation(entry.id)"
                                @keydown.escape="cancelAnnotation"
                            />
                            <button class="ds-roll-note-btn confirm" title="Save note" @click="submitAnnotation(entry.id)"><i class="fa-solid fa-check" /></button>
                            <button class="ds-roll-note-btn cancel" title="Cancel" @click="cancelAnnotation">&times;</button>
                        </div>
                    </div>
                </div>
                <div class="ds-roll-total">{{ entry.total }}</div>
            </div>
        </div>
    </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, nextTick } from "vue";
import { DIE_ICONS } from "@/composables/useDiceIcons.js";
import { useJournalStore } from "@/stores/journalStore.js";
import { useDiceStore } from "@/stores/diceStore.js";
import { useMacroStore } from "@/stores/macroStore.js";
import { useGMLabel } from "@/composables/useGMLabel.js";
import { playerColorFor } from "@/composables/usePlayerColor.js";
import { useTimeAgo } from "@/composables/useTimeAgo.js";

const diceStore = useDiceStore();
const macroStore = useMacroStore();
const { gmName } = useGMLabel();
const { timeAgo } = useTimeAgo();
const historyRolls = computed(() => diceStore.rollsWithStreaks);

onMounted(() => macroStore.init());

const open = ref(true);

defineExpose({
    openSection: () => {
        open.value = true;
    },
});

const DICE = ["d4", "d6", "d8", "d10", "d12", "d20", "d100"];
const ALL_DICE = ["d1", ...DICE];
const pending = ref(Object.fromEntries(DICE.map((d) => [d, 0])));
const modifier = ref(0);

const hasDice = computed(() => DICE.some((d) => pending.value[d] > 0));
const hasAnything = computed(() => hasDice.value || modifier.value !== 0);
const formula = computed(() => {
    const parts = DICE.filter((d) => pending.value[d] > 0).map(
        (d) => `${pending.value[d]}${d}`,
    );
    const joined = parts.join("+");
    if (modifier.value > 0)
        return joined ? `${joined}+${modifier.value}` : `+${modifier.value}`;
    if (modifier.value < 0)
        return joined
            ? `${joined}−${Math.abs(modifier.value)}`
            : `${modifier.value}`;
    return joined;
});

function addDie(die) {
    pending.value[die]++;
}
function removeDie(die) {
    if (pending.value[die] > 0) pending.value[die]--;
}
function clear() {
    DICE.forEach((d) => {
        pending.value[d] = 0;
    });
    modifier.value = 0;
}
function roll() {
    if (!hasDice.value) return;
    diceStore.rollDice({ ...pending.value }, modifier.value);
    clear();
}

const savingMacro = ref(false);
const macroLabel = ref("");
const macroLabelInput = ref(null);

function startSaveMacro() {
    savingMacro.value = true;
    macroLabel.value = "";
    nextTick(() => macroLabelInput.value?.focus());
}

function cancelSaveMacro() {
    savingMacro.value = false;
    macroLabel.value = "";
}

async function confirmSaveMacro() {
    const label = macroLabel.value.trim();
    cancelSaveMacro();
    if (label)
        await macroStore.saveMacro(label, { ...pending.value }, modifier.value);
}

function fireMacro(macro) {
    diceStore.rollDice({ ...macro.pending }, macro.modifier, macro.label);
}

function formatMacroExpr(macro) {
    const parts = DICE.filter((d) => (macro.pending[d] ?? 0) > 0).map(
        (d) => `${macro.pending[d]}${d}`,
    );
    const joined = parts.join("+");
    if (macro.modifier > 0)
        return joined ? `${joined}+${macro.modifier}` : `+${macro.modifier}`;
    if (macro.modifier < 0)
        return joined
            ? `${joined}−${Math.abs(macro.modifier)}`
            : `${macro.modifier}`;
    return joined || "?";
}

function formatExpr(entry) {
    const parts = ALL_DICE.filter((d) => (entry.pending?.[d] ?? 0) > 0).map(
        (d) => `${entry.pending[d]}${d}`,
    );
    const joined = parts.join("+");
    if (entry.modifier > 0)
        return joined ? `${joined}+${entry.modifier}` : `+${entry.modifier}`;
    if (entry.modifier < 0)
        return joined
            ? `${joined}−${Math.abs(entry.modifier)}`
            : `${entry.modifier}`;
    return joined || "?";
}

function isSingleD20(e) {
    return (
        (e.pending?.d20 ?? 0) === 1 &&
        DICE.filter((d) => d !== "d20").every(
            (d) => (e.pending?.[d] ?? 0) === 0,
        )
    );
}
function isCrit(e) {
    return (
        isSingleD20(e) &&
        e.results?.some((r) => r.die === "d20" && r.value === 20)
    );
}
function isFumble(e) {
    return (
        isSingleD20(e) &&
        e.results?.some((r) => r.die === "d20" && r.value === 1)
    );
}

function formatAverage(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return null;
    return Number.isInteger(number) ? String(number) : number.toFixed(1);
}

function streakLabel(entry) {
    return `${entry.streak.kind === "hot" ? "Hot" : "Cold"} x${entry.streak.count}`;
}

function streakTitle(entry) {
    const direction = entry.streak.kind === "hot" ? "above" : "below";
    let title = `${entry.streak.count} ${direction}-average rolls in a row`;
    const mean = Number(entry.stats?.mean);
    if (Number.isFinite(mean)) {
        const delta = Math.abs(entry.total - mean);
        title += ` (avg ${formatAverage(mean)}, rolled ${entry.total}`;
        if (delta > 0) title += `, ${formatAverage(delta)} ${direction}`;
        title += ")";
    }
    return title;
}

function rollColor(userId) {
    return playerColorFor(userId);
}

const annotatingId = ref(null);
const annotationDraft = ref("");

function pinRoll(entry) {
    useJournalStore().pin({
        source: "dice",
        label: entry.label || formatExpr(entry),
        text: `${gmName(entry.user_id, entry.display_name, entry.character_id)} rolled ${formatExpr(entry)} = ${entry.total}`,
    });
}

function startAnnotating(rollId) {
    annotatingId.value = rollId;
    annotationDraft.value = "";
}

function cancelAnnotation() {
    annotatingId.value = null;
    annotationDraft.value = "";
}

async function submitAnnotation(rollId) {
    const body = annotationDraft.value.trim();
    cancelAnnotation();
    if (body) await diceStore.addAnnotation(rollId, body);
}

const scrollEl = ref(null);
const isAtTop = ref(true);
const hasUnseen = ref(false);

function onScroll() {
    isAtTop.value = scrollEl.value?.scrollTop < 80;
    if (isAtTop.value) hasUnseen.value = false;
}
function scrollToTop() {
    scrollEl.value?.scrollTo({ top: 0, behavior: "smooth" });
    hasUnseen.value = false;
}

watch(
    () => historyRolls.value[0]?.id,
    (id) => {
        if (!id) return;
        if (!isAtTop.value) hasUnseen.value = true;
    },
);
</script>

<style scoped>
.ds-macro-btn:hover {
    background: var(--gold) !important;
    border-color: var(--gold) !important;
    color: var(--ink) !important;
}
.ds-macro-delete {
    background: none;
    border: none;
    padding: 0 5px;
    font-size: 12px;
    line-height: 1;
    color: var(--ink-mute);
    cursor: pointer;
    flex-shrink: 0;
    transition:
        color 0.15s,
        opacity 0.15s;
}
.ds-macro-delete:hover {
    color: var(--accent, #8a1c1c);
}
.ds-roll-breakdown {
    font-family: var(--font-mono, "JetBrains Mono", monospace);
    font-size: 10px;
    color: var(--ink-soft, #5a4a3a);
    margin-top: 2px;
    line-height: 1.4;
}
.result-crit {
    color: var(--gold, #c8a827);
    font-weight: 700;
}
.result-fumble {
    color: var(--accent, #8a1c1c);
    font-weight: 700;
}
.result-sep {
    color: var(--ink-mute, #8a7a68);
}

.ds-roll-streak {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    padding: 1px 5px;
    border: 1px solid currentColor;
    border-radius: 3px;
    font-family: var(--font-mono, "JetBrains Mono", monospace);
    font-size: 9px;
    font-weight: 700;
    line-height: 1.2;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    white-space: nowrap;
}
.ds-roll-streak i {
    font-size: 8px;
}
.ds-roll-streak--hot {
    color: #b3221c;
    background: color-mix(in srgb, #b3221c 20%, transparent);
}
.ds-roll-streak--cold {
    color: #1f5c99;
    background: color-mix(in srgb, #1f5c99 20%, transparent);
}

.ds-roll-note-add {
    background: none;
    border: none;
    cursor: pointer;
    color: var(--ink-soft, #5a4a3a);
    padding: 0 4px;
    margin-left: 4px;
    font-size: 9px;
    opacity: 0;
    transition: opacity 0.15s, color 0.15s;
}
.ds-roll-row:hover .ds-roll-note-add {
    opacity: 0.7;
}
.ds-roll-note-add:hover {
    color: var(--gold, #c8a827);
    opacity: 1;
}
.ds-roll-notes {
    margin-top: 4px;
    display: flex;
    flex-direction: column;
    gap: 2px;
}
.ds-roll-note,
.ds-roll-note-edit {
    display: flex;
    align-items: baseline;
    gap: 5px;
    font-family: var(--font-body, serif);
    font-size: 12px;
    line-height: 1.35;
}
.ds-roll-note.pending {
    opacity: 0.5;
}
.ds-roll-note-arrow,
.ds-roll-note-sep {
    color: var(--ink-soft, #5a4a3a);
    flex-shrink: 0;
}
.ds-roll-note-who {
    font-weight: 600;
    flex-shrink: 0;
}
.ds-roll-note-body {
    color: var(--ink-mute, #8a7a68);
    word-break: break-word;
    min-width: 0;
}
.ds-roll-note-edit {
    align-items: center;
}
.ds-roll-note-input {
    flex: 1;
    min-width: 0;
    background: var(--surface-2);
    border: 1px solid var(--rule);
    border-radius: 3px;
    padding: 2px 6px;
    font-family: var(--font-body, serif);
    font-size: 12px;
    color: var(--ink);
    outline: none;
}
.ds-roll-note-input:focus {
    border-color: var(--gold, #c8a827);
}
.ds-roll-note-btn {
    background: none;
    border: none;
    cursor: pointer;
    padding: 0 3px;
    font-size: 12px;
    line-height: 1;
    flex-shrink: 0;
}
.ds-roll-note-btn.confirm {
    color: var(--gold, #c8a827);
}
.ds-roll-note-btn.cancel {
    color: var(--ink-mute, #8a7a68);
}
</style>
