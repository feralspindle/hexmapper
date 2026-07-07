<template>
    <div class="cs-root" data-testid="char-sheet">
        <template v-if="!characterStore.character">
            <div class="cs-empty-state">
                <svg
                    width="28"
                    height="28"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.4"
                    stroke-linecap="round"
                    style="color: var(--ink-mute)"
                >
                    <path
                        d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"
                    />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                    <polyline points="10 9 9 9 8 9" />
                </svg>
                <p>No character selected.</p>
                <p style="font-size: 12px; color: var(--ink-mute)">
                    Use the character menu in the toolbar to import or select
                    one.
                </p>
            </div>
        </template>

        <template v-else>
            <div v-if="!canEdit" class="cs-readonly-bar">
                <svg
                    width="11"
                    height="11"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                >
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                </svg>
                Viewing — read only
            </div>

            <div class="cs-identity">
                <template v-if="!editingIdentity">
                    <div
                        style="
                            display: flex;
                            align-items: flex-start;
                            justify-content: space-between;
                            gap: 4px;
                        "
                    >
                        <div style="min-width: 0">
                            <div class="cs-char-name" data-testid="char-name">{{ char.name }}</div>
                            <div class="cs-char-role">
                                {{ char.ancestry }} {{ char.class }} · Lvl
                                {{ char.level
                                }}<template v-if="char.title">
                                    · {{ char.title }}</template
                                >
                            </div>
                        </div>
                        <button
                            v-if="canEdit"
                            class="cs-icon-btn"
                            title="Edit identity"
                            @click="startIdentityEdit"
                        >
                            <svg
                                width="11"
                                height="11"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="2"
                                stroke-linecap="round"
                            >
                                <path
                                    d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"
                                />
                                <path
                                    d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"
                                />
                            </svg>
                        </button>
                    </div>
                </template>
                <template v-else>
                    <div class="cs-form-stack">
                        <input
                            v-model="identityDraft.name"
                            placeholder="Name"
                            class="cs-input"
                        />
                        <div style="display: flex; gap: 6px">
                            <input
                                v-model="identityDraft.ancestry"
                                placeholder="Ancestry"
                                class="cs-input"
                                style="flex: 1"
                            />
                            <input
                                v-model="identityDraft.class"
                                placeholder="Class"
                                class="cs-input"
                                style="flex: 1"
                            />
                        </div>
                        <div style="display: flex; gap: 6px">
                            <input
                                v-model.number="identityDraft.level"
                                type="number"
                                min="1"
                                max="20"
                                placeholder="Lvl"
                                class="cs-input"
                                style="width: 56px"
                            />
                            <input
                                v-model="identityDraft.title"
                                placeholder="Title"
                                class="cs-input"
                                style="flex: 1"
                            />
                        </div>
                        <div class="cs-form-actions">
                            <button
                                class="cs-btn primary"
                                @click="saveIdentityEdit"
                            >
                                Save
                            </button>
                            <button
                                class="cs-btn ghost"
                                @click="editingIdentity = false"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </template>
            </div>

            <div class="cs-tab-bar">
                <button
                    v-for="t in subTabs"
                    :key="t.id"
                    class="cs-tab"
                    :class="{ active: subTab === t.id }"
                    :data-testid="`char-tab-${t.id}`"
                    @click="subTab = t.id"
                >
                    {{ t.label }}
                </button>
            </div>

            <div v-if="subTab === 'stats'" class="cs-scroll-body">
                <div style="display: flex; gap: 6px">
                    <div class="cs-big-stat">
                        <span class="cs-section-label">HP</span>
                        <div
                            style="display: flex; align-items: center; gap: 6px"
                        >
                            <button
                                v-if="canEdit"
                                class="cs-adj-btn"
                                title="−1 HP"
                                data-testid="hp-minus"
                                @click="characterStore.adjustHp(-1)"
                            >
                                −
                            </button>
                            <span class="cs-big-val" data-testid="hp-value">{{ char.currentHp }}</span>
                            <button
                                v-if="canEdit"
                                class="cs-adj-btn"
                                title="+1 HP"
                                data-testid="hp-plus"
                                @click="characterStore.adjustHp(1)"
                            >
                                +
                            </button>
                        </div>
                        <template v-if="editingMaxHp && canEdit">
                            <input
                                ref="maxHpInputRef"
                                v-model.number="maxHpDraft"
                                type="number"
                                min="1"
                                class="cs-input"
                                style="width: 56px; text-align: center"
                                @keyup.enter="saveMaxHp"
                                @keyup.escape="editingMaxHp = false"
                                @blur="saveMaxHp"
                            />
                        </template>
                        <button
                            v-else-if="canEdit"
                            class="cs-sub-val"
                            @click="startEditMaxHp"
                        >
                            / {{ char.maxHitPoints
                            }}<span class="cs-tip">Click to edit</span>
                        </button>
                        <span v-else class="cs-sub-val"
                            >/ {{ char.maxHitPoints }}</span
                        >

                        <div class="cs-hp-bar" style="margin-top: 4px">
                            <span
                                class="cs-hp-bar-fill"
                                :style="{ width: hpPct() + '%' }"
                            />
                        </div>

                        <div
                            v-if="canEdit || (char.tempHp ?? 0) > 0"
                            class="cs-temp-hp"
                        >
                            <span class="cs-temp-hp-label">Temp</span>
                            <button
                                v-if="canEdit"
                                class="cs-adj-btn cs-adj-btn-sm"
                                title="−1 Temp HP"
                                data-testid="temp-hp-minus"
                                @click="characterStore.adjustTempHp(-1)"
                            >
                                −
                            </button>
                            <input
                                v-if="editingTempHp && canEdit"
                                ref="tempHpInputRef"
                                v-model.number="tempHpDraft"
                                type="number"
                                min="0"
                                class="cs-input cs-temp-hp-input"
                                @keyup.enter="saveTempHp"
                                @keyup.escape="editingTempHp = false"
                                @blur="saveTempHp"
                            />
                            <button
                                v-else-if="canEdit"
                                class="cs-temp-hp-val"
                                data-testid="temp-hp-value"
                                @click="startEditTempHp"
                            >
                                {{ char.tempHp ?? 0 }}
                            </button>
                            <span v-else class="cs-temp-hp-val cs-temp-hp-static" data-testid="temp-hp-value">{{
                                char.tempHp ?? 0
                            }}</span>
                            <button
                                v-if="canEdit"
                                class="cs-adj-btn cs-adj-btn-sm"
                                title="+1 Temp HP"
                                data-testid="temp-hp-plus"
                                @click="characterStore.adjustTempHp(1)"
                            >
                                +
                            </button>
                        </div>
                    </div>

                    <div class="cs-big-stat">
                        <span class="cs-section-label">AC</span>
                        <template v-if="editingAC && canEdit">
                            <input
                                ref="acInputRef"
                                v-model.number="acDraft"
                                type="number"
                                min="0"
                                class="cs-input"
                                style="
                                    width: 52px;
                                    text-align: center;
                                    font-size: 20px;
                                    font-family: var(--font-mono);
                                    font-weight: 700;
                                "
                                @keyup.enter="saveAC"
                                @keyup.escape="editingAC = false"
                                @blur="saveAC"
                            />
                        </template>
                        <button
                            v-else-if="canEdit"
                            class="cs-big-val cs-clickable"
                            @click="startEditAC"
                        >
                            {{ char.armorClass
                            }}<span class="cs-tip">Click to edit</span>
                        </button>
                        <span v-else class="cs-big-val">{{
                            char.armorClass
                        }}</span>
                    </div>

                    <div class="cs-big-stat">
                        <span class="cs-section-label">XP</span>
                        <template v-if="editingXP && canEdit">
                            <input
                                ref="xpInputRef"
                                v-model.number="xpDraft"
                                type="number"
                                min="0"
                                class="cs-input"
                                style="
                                    width: 52px;
                                    text-align: center;
                                    font-size: 20px;
                                    font-family: var(--font-mono);
                                    font-weight: 700;
                                "
                                @keyup.enter="saveXP"
                                @keyup.escape="editingXP = false"
                                @blur="saveXP"
                            />
                        </template>
                        <button
                            v-else-if="canEdit"
                            class="cs-big-val cs-clickable"
                            @click="startEditXP"
                        >
                            {{ char.XP ?? 0
                            }}<span class="cs-tip">Click to edit</span>
                        </button>
                        <span v-else class="cs-big-val">{{
                            char.XP ?? 0
                        }}</span>
                    </div>
                </div>

                <div v-if="!isGmCharacter" class="cs-initiative-block">
                    <div class="cs-initiative-row">
                        <span class="cs-section-label">Initiative</span>
                        <template v-if="editingInitiative && canEdit">
                            <input
                                ref="initiativeInputRef"
                                v-model.number="initiativeDraft"
                                type="number"
                                class="cs-input"
                                style="
                                    width: 52px;
                                    text-align: center;
                                    font-family: var(--font-mono);
                                    font-size: 15px;
                                    font-weight: 700;
                                "
                                @keyup.enter="saveInitiative"
                                @keyup.escape="editingInitiative = false"
                                @blur="saveInitiative"
                            />
                        </template>
                        <template v-else-if="canEdit">
                            <button
                                v-if="char.initiative == null"
                                class="cs-icon-btn"
                                v-tooltip="'Enter manually'"
                                @click="startEditInitiative"
                            >
                                <svg
                                    width="11"
                                    height="11"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    stroke-width="2"
                                    stroke-linecap="round"
                                >
                                    <path
                                        d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"
                                    />
                                    <path
                                        d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"
                                    />
                                </svg>
                            </button>
                            <span
                                v-else
                                class="cs-initiative-val"
                                style="cursor: pointer"
                                v-tooltip="'Click to edit'"
                                @click="startEditInitiative"
                                >{{ char.initiative }}</span
                            >
                        </template>
                        <span v-else class="cs-initiative-val">{{
                            char.initiative ?? "—"
                        }}</span>
                        <div
                            v-if="canEdit && !editingInitiative"
                            class="cs-initiative-actions"
                        >
                            <button
                                v-if="char.initiative != null"
                                class="cs-btn"
                                style="font-size: 11px; padding: 3px 8px"
                                @click="
                                    characterStore.updateField(
                                        'initiative',
                                        null,
                                    )
                                "
                            >
                                Clear
                            </button>
                            <button
                                class="cs-btn primary"
                                style="font-size: 11px; padding: 3px 8px"
                                @click="rollInitiative"
                            >
                                Roll Initiative (d20{{ dexMod >= 0 ? "+" : ""
                                }}{{ dexMod }})
                            </button>
                        </div>
                    </div>

                </div>

                <div v-if="!isGmCharacter" class="cs-luck-block">
                    <div class="cs-luck-header">
                        <span class="cs-section-label">Luck</span>
                        <span class="cs-luck-count">{{ luckCurrent }}</span>
                    </div>
                    <div class="cs-luck-gems">
                        <span
                            v-for="i in luckGemCount"
                            :key="i"
                            class="cs-luck-gem"
                            :class="{ filled: i <= luckCurrent }"
                            aria-hidden="true"
                        >
                            <svg viewBox="0 0 24 24" width="20" height="20">
                                <path
                                    d="M12 2 L14.5 9.5 L22 12 L14.5 14.5 L12 22 L9.5 14.5 L2 12 L9.5 9.5 Z"
                                    :fill="
                                        i <= luckCurrent
                                            ? 'currentColor'
                                            : 'none'
                                    "
                                    :stroke="
                                        i > luckCurrent
                                            ? 'currentColor'
                                            : 'none'
                                    "
                                    stroke-width="1.5"
                                />
                            </svg>
                        </span>
                    </div>
                    <template v-if="canEdit">
                        <button
                            v-if="luckCurrent > 0"
                            class="cs-luck-spend-btn"
                            style="margin-top: 8px"
                            @click="handleSpendLuck"
                        >
                            Spend Luck Token
                        </button>
                        <button
                            class="cs-add-btn"
                            style="margin-top: 6px"
                            @click="characterStore.adjustLuck(1)"
                        >
                            + Add Token
                        </button>
                    </template>
                </div>

                <div v-if="!isGmCharacter" class="cs-renown-block">
                    <div class="cs-renown-header">
                        <span class="cs-section-label">Renown</span>
                        <input
                            v-if="editingRenown && canEdit"
                            ref="renownInputRef"
                            v-model.number="renownDraft"
                            type="number"
                            class="cs-input cs-renown-input"
                            @keyup.enter="saveRenown"
                            @keyup.escape="editingRenown = false"
                            @blur="saveRenown"
                        />
                        <button
                            v-else-if="canEdit"
                            class="cs-renown-value"
                            title="Set renown"
                            data-testid="renown-value"
                            @click="startEditRenown"
                        >
                            {{ renownValue }}
                        </button>
                        <span v-else class="cs-renown-value cs-renown-static" data-testid="renown-value">{{
                            renownValue
                        }}</span>
                    </div>

                    <div v-if="canEdit" class="cs-renown-controls">
                        <button
                            class="cs-adj-btn cs-adj-btn-sm"
                            title="−1 Renown"
                            data-testid="renown-minus"
                            @click="bumpRenown(-1)"
                        >
                            −
                        </button>
                        <input
                            v-model="renownReason"
                            type="text"
                            class="cs-input cs-renown-reason"
                            placeholder="reason (optional)"
                            maxlength="120"
                            @keyup.enter="bumpRenown(1)"
                        />
                        <button
                            class="cs-adj-btn cs-adj-btn-sm"
                            title="+1 Renown"
                            data-testid="renown-plus"
                            @click="bumpRenown(1)"
                        >
                            +
                        </button>
                    </div>

                    <button
                        v-if="renownLogCount"
                        class="cs-renown-log-toggle"
                        @click="showRenownLog = !showRenownLog"
                    >
                        {{ showRenownLog ? "Hide" : "Show" }} history ({{
                            renownLogCount
                        }})
                    </button>

                    <ul
                        v-if="showRenownLog && renownLogCount"
                        class="cs-renown-log"
                    >
                        <li
                            v-for="entry in renownLog"
                            :key="entry.id"
                            class="cs-renown-log-row"
                        >
                            <span
                                class="cs-renown-delta"
                                :class="
                                    entry.delta > 0
                                        ? 'cs-renown-gain'
                                        : 'cs-renown-loss'
                                "
                            >
                                {{ entry.delta > 0 ? "+" : "" }}{{ entry.delta }}
                            </span>
                            <span class="cs-renown-reason-text">{{
                                entry.reason || "—"
                            }}</span>
                            <span class="cs-renown-when">{{
                                timeAgo(entry.at)
                            }}</span>
                            <button
                                v-if="canEdit"
                                class="cs-renown-del"
                                title="Remove entry"
                                @click="characterStore.deleteRenownEntry(entry.id)"
                            >
                                ×
                            </button>
                        </li>
                    </ul>
                </div>

                <div>
                    <div
                        style="
                            display: flex;
                            align-items: center;
                            justify-content: space-between;
                            margin-bottom: 6px;
                        "
                    >
                        <span class="cs-section-label">Ability Scores</span>
                        <button
                            v-if="canEdit"
                            class="cs-icon-btn"
                            :title="editingStats ? 'Done' : 'Edit scores'"
                            :style="editingStats ? 'color:var(--accent-2)' : ''"
                            @click="editingStats = !editingStats"
                        >
                            <svg
                                width="11"
                                height="11"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="2"
                                stroke-linecap="round"
                            >
                                <path
                                    d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"
                                />
                                <path
                                    d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"
                                />
                            </svg>
                        </button>
                    </div>
                    <div class="cs-stats-grid">
                        <div
                            v-for="stat in stats"
                            :key="stat.key"
                            class="cs-stat-cell"
                        >
                            <span class="cs-stat-lbl">{{ stat.key }}</span>
                            <div
                                v-if="canEdit && editingStats"
                                style="
                                    display: flex;
                                    align-items: center;
                                    gap: 3px;
                                "
                            >
                                <button
                                    class="cs-adj-btn"
                                    style="
                                        width: 18px;
                                        height: 18px;
                                        font-size: 11px;
                                    "
                                    @click="
                                        characterStore.adjustStat(stat.key, -1)
                                    "
                                >
                                    −
                                </button>
                                <span class="cs-stat-val">{{
                                    stat.value
                                }}</span>
                                <button
                                    class="cs-adj-btn"
                                    style="
                                        width: 18px;
                                        height: 18px;
                                        font-size: 11px;
                                    "
                                    @click="
                                        characterStore.adjustStat(stat.key, 1)
                                    "
                                >
                                    +
                                </button>
                            </div>
                            <button
                                v-else-if="canEdit"
                                class="cs-stat-val cs-clickable"
                                :title="`Roll ${stat.key} check`"
                                @click="rollStat(stat)"
                            >
                                {{ stat.value }}
                            </button>
                            <span v-else class="cs-stat-val">{{
                                stat.value
                            }}</span>
                            <span
                                class="cs-stat-mod"
                                :class="stat.mod >= 0 ? 'positive' : 'negative'"
                                >{{ stat.mod >= 0 ? "+" : ""
                                }}{{ stat.mod }}</span
                            >
                        </div>
                    </div>
                </div>

                <div class="cs-info-block">
                    <template v-if="!editingInfo">
                        <div
                            style="
                                display: flex;
                                align-items: flex-start;
                                justify-content: space-between;
                                gap: 4px;
                            "
                        >
                            <div class="cs-info-rows">
                                <div>
                                    <span class="cs-info-lbl">Alignment</span>
                                    {{ char.alignment }}
                                </div>
                                <div>
                                    <span class="cs-info-lbl">Background</span>
                                    {{ char.background }}
                                </div>
                                <div v-if="char.deity">
                                    <span class="cs-info-lbl">Deity</span>
                                    {{ char.deity }}
                                </div>
                                <div>
                                    <span class="cs-info-lbl">Languages</span>
                                    {{ char.languages }}
                                </div>
                            </div>
                            <button
                                v-if="canEdit"
                                class="cs-icon-btn"
                                title="Edit lore"
                                @click="startInfoEdit"
                            >
                                <svg
                                    width="11"
                                    height="11"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    stroke-width="2"
                                    stroke-linecap="round"
                                >
                                    <path
                                        d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"
                                    />
                                    <path
                                        d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"
                                    />
                                </svg>
                            </button>
                        </div>
                    </template>
                    <template v-else>
                        <div class="cs-form-stack">
                            <label class="cs-form-label"
                                >Alignment<input
                                    v-model="infoDraft.alignment"
                                    class="cs-input"
                            /></label>
                            <label class="cs-form-label"
                                >Background<input
                                    v-model="infoDraft.background"
                                    class="cs-input"
                            /></label>
                            <label class="cs-form-label"
                                >Deity<input
                                    v-model="infoDraft.deity"
                                    placeholder="(optional)"
                                    class="cs-input"
                            /></label>
                            <label class="cs-form-label"
                                >Languages<input
                                    v-model="infoDraft.languages"
                                    class="cs-input"
                            /></label>
                            <div class="cs-form-actions">
                                <button
                                    class="cs-btn primary"
                                    @click="saveInfoEdit"
                                >
                                    Save
                                </button>
                                <button
                                    class="cs-btn ghost"
                                    @click="editingInfo = false"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </template>
                </div>
            </div>

            <div v-else-if="subTab === 'combat'" class="cs-scroll-body">
                <div>
                    <span class="cs-section-label">Attacks</span>
                    <div class="cs-list" style="margin-top: 6px">
                        <div
                            v-for="atk in parsedAttacks"
                            :key="atk.idx"
                            class="cs-list-item"
                            :class="{ disabled: atk.disabled }"
                        >
                            <template v-if="editingAtkIdx !== atk.idx">
                                <div
                                    style="display: flex; align-items: stretch"
                                >
                                    <button
                                        class="cs-list-main"
                                        :disabled="atk.disabled || !canEdit"
                                        @click="rollAttack(atk)"
                                    >
                                        <div
                                            class="cs-list-title"
                                            :class="{
                                                strikethrough: atk.disabled,
                                            }"
                                        >
                                            {{ atk.label }}
                                        </div>
                                        <div class="cs-list-sub">
                                            <span v-if="atk.statKey" class="cs-atk-stat-badge">{{ atk.statKey }} {{ atkEffectiveBonus(atk) >= 0 ? '+' : '' }}{{ atkEffectiveBonus(atk) }}</span>
                                            <span v-else>{{ atk.raw.split(":").slice(1).join(":").trim() }}</span>
                                        </div>
                                    </button>
                                    <button
                                        v-if="
                                            atk.damageDie &&
                                            !atk.disabled &&
                                            canEdit
                                        "
                                        class="cs-list-action-col"
                                        style="
                                            border-left: 1px solid var(--rule);
                                        "
                                        :title="`Roll damage (${atk.damageDie})`"
                                        @click="rollDamage(atk)"
                                    >
                                        <svg
                                            width="12"
                                            height="12"
                                            viewBox="0 0 24 24"
                                            fill="currentColor"
                                            style="color: #8a1c1c"
                                        >
                                            <path
                                                d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
                                            />
                                        </svg>
                                        <span
                                            style="
                                                font-family: var(--font-mono);
                                                font-size: 9px;
                                                color: #8a1c1c;
                                            "
                                            >{{ atk.damageDie }}</span
                                        >
                                    </button>
                                    <div
                                        v-if="canEdit"
                                        class="cs-list-controls"
                                    >
                                        <button
                                            class="cs-icon-btn"
                                            :title="
                                                atk.disabled
                                                    ? 'Enable'
                                                    : 'Disable'
                                            "
                                            @click="
                                                characterStore.updateAttack(
                                                    atk.idx,
                                                    { disabled: !atk.disabled },
                                                )
                                            "
                                        >
                                            <svg
                                                width="10"
                                                height="10"
                                                viewBox="0 0 24 24"
                                                fill="none"
                                                stroke="currentColor"
                                                stroke-width="2"
                                                stroke-linecap="round"
                                            >
                                                <path
                                                    v-if="atk.disabled"
                                                    d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"
                                                />
                                                <circle
                                                    v-if="atk.disabled"
                                                    cx="12"
                                                    cy="12"
                                                    r="3"
                                                />
                                                <path
                                                    v-if="!atk.disabled"
                                                    d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"
                                                />
                                                <line
                                                    v-if="!atk.disabled"
                                                    x1="1"
                                                    y1="1"
                                                    x2="23"
                                                    y2="23"
                                                />
                                            </svg>
                                        </button>
                                        <button
                                            class="cs-icon-btn"
                                            title="Edit"
                                            @click="startAtkEdit(atk)"
                                        >
                                            <svg
                                                width="10"
                                                height="10"
                                                viewBox="0 0 24 24"
                                                fill="none"
                                                stroke="currentColor"
                                                stroke-width="2"
                                                stroke-linecap="round"
                                            >
                                                <path
                                                    d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"
                                                />
                                                <path
                                                    d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"
                                                />
                                            </svg>
                                        </button>
                                        <button
                                            class="cs-icon-btn danger"
                                            title="Delete"
                                            @click="
                                                confirm(
                                                    'Delete this attack?',
                                                    () =>
                                                        characterStore.deleteAttack(
                                                            atk.idx,
                                                        ),
                                                )
                                            "
                                        >
                                            <svg
                                                width="10"
                                                height="10"
                                                viewBox="0 0 24 24"
                                                fill="none"
                                                stroke="currentColor"
                                                stroke-width="2"
                                                stroke-linecap="round"
                                            >
                                                <polyline
                                                    points="3 6 5 6 21 6"
                                                />
                                                <path
                                                    d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"
                                                />
                                                <path d="M10 11v6M14 11v6" />
                                                <path
                                                    d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"
                                                />
                                            </svg>
                                        </button>
                                    </div>
                                </div>
                            </template>
                            <template v-else>
                                <div class="cs-form-stack" style="padding: 8px">
                                    <input
                                        v-model="editAtkDraft.raw"
                                        class="cs-input"
                                        placeholder="Name: description…"
                                        @keyup.enter="saveAtkEdit(atk.idx)"
                                        @keyup.escape="editingAtkIdx = null"
                                    />
                                    <select v-model="editAtkDraft.statKey" class="cs-input">
                                        <option value="">No stat linked (use bonus in description)</option>
                                        <option v-for="k in ['STR','DEX','CON','INT','WIS','CHA']" :key="k" :value="k">{{ STAT_NAMES[k] }} ({{ k }})</option>
                                    </select>
                                    <input
                                        v-model="editAtkDraft.damageDie"
                                        class="cs-input"
                                        placeholder="Damage die, e.g. 1d8+2 (optional)"
                                        @keyup.enter="saveAtkEdit(atk.idx)"
                                        @keyup.escape="editingAtkIdx = null"
                                    />
                                    <div class="cs-form-actions">
                                        <button
                                            class="cs-btn primary"
                                            @click="saveAtkEdit(atk.idx)"
                                        >
                                            Save
                                        </button>
                                        <button
                                            class="cs-btn ghost"
                                            @click="editingAtkIdx = null"
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                            </template>
                        </div>
                    </div>
                    <div
                        v-if="showAddAtk && canEdit"
                        class="cs-list-item"
                        style="margin-top: 4px"
                    >
                        <div class="cs-form-stack" style="padding: 8px">
                            <input
                                ref="newAtkInputRef"
                                v-model="newAtkDraft.raw"
                                class="cs-input"
                                placeholder="Name: description…"
                                @keyup.enter="submitAddAtk"
                                @keyup.escape="showAddAtk = false"
                            />
                            <select v-model="newAtkDraft.statKey" class="cs-input">
                                <option value="">No stat linked (use bonus in description)</option>
                                <option v-for="k in ['STR','DEX','CON','INT','WIS','CHA']" :key="k" :value="k">{{ STAT_NAMES[k] }} ({{ k }})</option>
                            </select>
                            <input
                                v-model="newAtkDraft.damageDie"
                                class="cs-input"
                                placeholder="Damage die, e.g. 1d8+2 (optional)"
                                @keyup.enter="submitAddAtk"
                                @keyup.escape="showAddAtk = false"
                            />
                            <div class="cs-form-actions">
                                <button
                                    class="cs-btn primary"
                                    @click="submitAddAtk"
                                >
                                    Add
                                </button>
                                <button
                                    class="cs-btn ghost"
                                    @click="showAddAtk = false"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                    <button
                        v-if="canEdit && !showAddAtk"
                        class="cs-add-btn"
                        style="margin-top: 6px"
                        @click="
                            showAddAtk = true;
                            nextTick(() => newAtkInputRef?.focus());
                        "
                    >
                        + Add Attack
                    </button>
                </div>

                <div>
                    <span class="cs-section-label">Talents</span>
                    <div
                        v-if="char.bonuses?.length"
                        class="cs-list"
                        style="margin-top: 6px"
                    >
                        <div
                            v-for="(b, i) in char.bonuses"
                            :key="i"
                            class="cs-list-item"
                        >
                            <div
                                style="
                                    display: flex;
                                    align-items: flex-start;
                                    justify-content: space-between;
                                    gap: 6px;
                                    padding: 6px 8px;
                                "
                            >
                                <div>
                                    <span class="cs-list-title">{{
                                        b.bonusName
                                    }}</span>
                                    <span
                                        style="
                                            color: var(--ink-mute);
                                            font-size: 11px;
                                            margin-left: 4px;
                                        "
                                        >· {{ b.sourceCategory }}</span
                                    >
                                </div>
                                <button
                                    v-if="canEdit"
                                    class="cs-icon-btn danger"
                                    title="Remove"
                                    @click="
                                        confirm('Remove this talent?', () =>
                                            removeTalent(i),
                                        )
                                    "
                                >
                                    <svg
                                        width="10"
                                        height="10"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        stroke-width="2"
                                        stroke-linecap="round"
                                    >
                                        <polyline points="3 6 5 6 21 6" />
                                        <path
                                            d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"
                                        />
                                    </svg>
                                </button>
                            </div>
                        </div>
                    </div>
                    <div
                        v-if="showAddTalent && canEdit"
                        class="cs-list-item"
                        style="margin-top: 6px"
                    >
                        <div class="cs-form-stack" style="padding: 8px">
                            <input
                                v-model="newTalentDraft"
                                placeholder="Talent name"
                                class="cs-input"
                                @keyup.enter="submitAddTalent"
                                @keyup.escape="showAddTalent = false"
                            />
                            <div class="cs-form-actions">
                                <button
                                    class="cs-btn primary"
                                    @click="submitAddTalent"
                                >
                                    Add
                                </button>
                                <button
                                    class="cs-btn ghost"
                                    @click="showAddTalent = false"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                    <button
                        v-if="canEdit && !showAddTalent"
                        class="cs-add-btn"
                        style="margin-top: 6px"
                        @click="showAddTalent = true"
                    >
                        + Add Talent
                    </button>
                </div>

                <div>
                    <span class="cs-section-label">Spells</span>
                    <template v-if="editingSpells && canEdit">
                        <div class="cs-form-stack" style="margin-top: 6px">
                            <textarea
                                v-model="spellsDraft"
                                rows="4"
                                placeholder="Spells known…"
                                class="cs-input cs-textarea"
                            />
                            <div class="cs-form-actions">
                                <button
                                    class="cs-btn primary"
                                    @click="saveSpells"
                                >
                                    Save
                                </button>
                                <button
                                    class="cs-btn ghost"
                                    @click="editingSpells = false"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </template>
                    <template v-else>
                        <div
                            class="cs-info-block"
                            style="
                                margin-top: 6px;
                                display: flex;
                                align-items: flex-start;
                                justify-content: space-between;
                                gap: 6px;
                            "
                        >
                            <span
                                style="
                                    font-family: var(--font-body);
                                    font-size: 13px;
                                    color: var(--ink-2);
                                    flex: 1;
                                "
                                >{{
                                    char.spellsKnown &&
                                    char.spellsKnown !== "None"
                                        ? char.spellsKnown
                                        : "—"
                                }}</span
                            >
                            <button
                                v-if="canEdit"
                                class="cs-icon-btn"
                                title="Edit spells"
                                @click="startEditSpells"
                            >
                                <svg
                                    width="11"
                                    height="11"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    stroke-width="2"
                                    stroke-linecap="round"
                                >
                                    <path
                                        d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"
                                    />
                                    <path
                                        d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"
                                    />
                                </svg>
                            </button>
                        </div>
                    </template>
                </div>
            </div>

            <div v-else-if="subTab === 'gear'" class="cs-scroll-body cs-scroll-gear">
                <div class="cs-gear-header">
                    <span class="cs-section-label">Gear Slots</span>
                    <div class="cs-gear-slot-count">
                        <button v-if="canEdit" class="cs-adj-btn" style="width:18px;height:18px;font-size:11px" @click="characterStore.updateField('gearSlotsTotal', Math.max(0, (char.gearSlotsTotal ?? 0) - 1))">−</button>
                        <span class="cs-gear-slot-num" :style="{ color: slotRatio > 0.9 ? '#8a1c1c' : slotRatio > 0.7 ? '#b8541c' : 'var(--ink)' }">{{ effectiveGearSlotsUsed }}</span>
                        <span class="cs-gear-slot-sep">/ {{ char.gearSlotsTotal }}</span>
                        <button v-if="canEdit" class="cs-adj-btn" style="width:18px;height:18px;font-size:11px" @click="characterStore.updateField('gearSlotsTotal', (char.gearSlotsTotal ?? 0) + 1)">+</button>
                    </div>
                    <div class="cs-slot-bar">
                        <div class="cs-slot-bar-fill" :style="{ width: `${Math.min(100, slotRatio * 100)}%`, background: slotRatio > 0.9 ? '#8a1c1c' : slotRatio > 0.7 ? '#b8541c' : 'var(--accent-3, #5a6b3a)' }" />
                    </div>
                </div>

                <div class="cs-list">
                    <div class="cs-tracked-row">
                        <div style="flex: 1; padding: 5px 8px; min-width: 0">
                            <div class="cs-tracked-title">Rations</div>
                            <div style="margin-top: 5px">
                                <span class="cs-mini-coin-amt">{{ char.rations ?? 0 }}</span> <span class="cs-tracked-sub">🍫 · 3 per slot</span>
                            </div>
                        </div>
                        <div v-if="canEdit" class="cs-tracked-controls">
                            <button class="cs-adj-btn" @click="characterStore.updateField('rations', Math.max(0, (char.rations ?? 0) - 1))">−</button>
                            <button class="cs-adj-btn" @click="characterStore.updateField('rations', (char.rations ?? 0) + 1)">+</button>
                            <button class="cs-adj-btn" title="Add 3-pack" @click="characterStore.updateField('rations', (char.rations ?? 0) + 3)">+3</button>
                        </div>
                        <span class="cs-tracked-badge">{{ rationSlots > 0 ? `${rationSlots} slot${rationSlots !== 1 ? 's' : ''}` : 'free' }}</span>
                    </div>
                    <div v-if="char" class="cs-tracked-row">
                        <div style="flex: 1; padding: 5px 8px; min-width: 0">
                            <div class="cs-tracked-title">Coins</div>
                            <div class="cs-coins-mini-grid">
                                <div v-for="c in coins" :key="c.key" class="cs-coins-mini-item">
                                    <div class="cs-mini-coin-icon" :style="{ background: c.bg, color: c.fg }">{{ c.symbol }}</div>
                                    <span class="cs-mini-coin-amt">{{ char?.[c.key] ?? 0 }}</span>
                                </div>
                                <div class="cs-coins-mini-total">
                                    <span class="cs-coins-mini-total-num">{{ (char?.gold ?? 0) + (char?.silver ?? 0) + (char?.copper ?? 0) }}</span>
                                    <span class="cs-tracked-sub">total · 100/slot · first 100 free</span>
                                </div>
                            </div>
                        </div>
                        <span class="cs-tracked-badge">{{ coinGearSlots > 0 ? `${coinGearSlots} slot${coinGearSlots !== 1 ? 's' : ''}` : 'free' }}</span>
                    </div>
                    <TransitionGroup
                        name="gear-move"
                        tag="div"
                        class="cs-list-inner"
                    >
                        <div
                            v-for="(item, gearIdx) in sortedGear"
                            :key="item.instanceId"
                            class="cs-list-item"
                            :class="{ disabled: item.disabled }"
                            data-testid="gear-item"
                        >
                            <template v-if="editingGearId !== item.instanceId">
                                <div
                                    style="display: flex; align-items: stretch"
                                    class="cs-list-group"
                                >
                                    <div
                                        v-if="canEdit"
                                        class="cs-gear-move-col"
                                    >
                                        <button
                                            class="cs-gear-move-btn"
                                            title="Move up"
                                            :disabled="gearIdx === 0"
                                            @click="
                                                characterStore.moveGearItem(
                                                    item.instanceId,
                                                    -1,
                                                )
                                            "
                                        >
                                            <svg
                                                width="10"
                                                height="10"
                                                viewBox="0 0 24 24"
                                                fill="none"
                                                stroke="currentColor"
                                                stroke-width="2.5"
                                                stroke-linecap="round"
                                                stroke-linejoin="round"
                                            >
                                                <path d="M18 15l-6-6-6 6" />
                                            </svg>
                                        </button>
                                        <button
                                            class="cs-gear-move-btn"
                                            title="Move down"
                                            :disabled="
                                                gearIdx ===
                                                sortedGear.length - 1
                                            "
                                            @click="
                                                characterStore.moveGearItem(
                                                    item.instanceId,
                                                    1,
                                                )
                                            "
                                        >
                                            <svg
                                                width="10"
                                                height="10"
                                                viewBox="0 0 24 24"
                                                fill="none"
                                                stroke="currentColor"
                                                stroke-width="2.5"
                                                stroke-linecap="round"
                                                stroke-linejoin="round"
                                            >
                                                <path d="M6 9l6 6 6-6" />
                                            </svg>
                                        </button>
                                    </div>
                                    <div
                                        style="
                                            flex: 1;
                                            display: flex;
                                            align-items: flex-start;
                                            gap: 8px;
                                            padding: 6px 8px;
                                        "
                                    >
                                        <div style="flex: 1; min-width: 0">
                                            <div
                                                class="cs-list-title"
                                                :class="{
                                                    strikethrough:
                                                        item.disabled,
                                                }"
                                            >
                                                {{ item.name }}
                                            </div>
                                            <div class="cs-list-sub">
                                                <template v-if="isGemItem(item)">
                                                    {{ calcGearItemSlots(item) }} slot{{ calcGearItemSlots(item) !== 1 ? 's' : '' }} total · ×{{ item.quantity }} (10/slot)
                                                </template>
                                                <template v-else>
                                                    {{ item.slots }} slot{{
                                                        item.slots !== 1 ? "s" : ""
                                                    }}<span
                                                        v-if="item.quantity > 1"
                                                    >
                                                        · ×{{ item.quantity }}</span
                                                    >
                                                </template>
                                            </div>
                                        </div>
                                        <span
                                            class="cs-gear-badge"
                                            :class="item.type"
                                            >{{ item.type }}</span
                                        >
                                        <div
                                            v-if="canEdit"
                                            class="cs-list-controls"
                                            style="opacity: 0"
                                        >
                                            <button
                                                class="cs-icon-btn"
                                                :title="
                                                    item.disabled
                                                        ? 'Enable'
                                                        : 'Disable'
                                                "
                                                @click="
                                                    characterStore.updateGearItem(
                                                        item.instanceId,
                                                        {
                                                            disabled:
                                                                !item.disabled,
                                                        },
                                                    )
                                                "
                                            >
                                                <svg
                                                    width="10"
                                                    height="10"
                                                    viewBox="0 0 24 24"
                                                    fill="none"
                                                    stroke="currentColor"
                                                    stroke-width="2"
                                                    stroke-linecap="round"
                                                >
                                                    <path
                                                        d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"
                                                    />
                                                    <circle
                                                        cx="12"
                                                        cy="12"
                                                        r="3"
                                                    />
                                                </svg>
                                            </button>
                                            <button
                                                class="cs-icon-btn"
                                                title="Edit"
                                                @click="startGearEdit(item)"
                                            >
                                                <svg
                                                    width="10"
                                                    height="10"
                                                    viewBox="0 0 24 24"
                                                    fill="none"
                                                    stroke="currentColor"
                                                    stroke-width="2"
                                                    stroke-linecap="round"
                                                >
                                                    <path
                                                        d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"
                                                    />
                                                    <path
                                                        d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"
                                                    />
                                                </svg>
                                            </button>
                                            <button
                                                class="cs-icon-btn danger"
                                                title="Delete"
                                                @click="
                                                    confirm(
                                                        'Delete this item?',
                                                        () =>
                                                            characterStore.deleteGearItem(
                                                                item.instanceId,
                                                            ),
                                                    )
                                                "
                                            >
                                                <svg
                                                    width="10"
                                                    height="10"
                                                    viewBox="0 0 24 24"
                                                    fill="none"
                                                    stroke="currentColor"
                                                    stroke-width="2"
                                                    stroke-linecap="round"
                                                >
                                                    <polyline
                                                        points="3 6 5 6 21 6"
                                                    />
                                                    <path
                                                        d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"
                                                    />
                                                </svg>
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </template>
                            <template v-else>
                                <div class="cs-form-stack" style="padding: 8px">
                                    <input
                                        v-model="editGearDraft.name"
                                        placeholder="Item name"
                                        class="cs-input"
                                    />
                                    <div style="display: flex; gap: 6px">
                                        <label
                                            class="cs-form-label"
                                            style="flex: 1"
                                            >Slots<input
                                                v-model.number="
                                                    editGearDraft.slots
                                                "
                                                type="number"
                                                min="0"
                                                step="1"
                                                class="cs-input"
                                        /></label>
                                        <label
                                            class="cs-form-label"
                                            style="flex: 1"
                                            >Qty<input
                                                v-model.number="
                                                    editGearDraft.quantity
                                                "
                                                type="number"
                                                min="1"
                                                class="cs-input"
                                        /></label>
                                        <label
                                            class="cs-form-label"
                                            style="flex: 1"
                                            >Type
                                            <select
                                                v-model="editGearDraft.type"
                                                class="cs-input"
                                            >
                                                <option value="weapon">
                                                    Weapon
                                                </option>
                                                <option value="armor">
                                                    Armor
                                                </option>
                                                <option value="sundry">
                                                    Sundry
                                                </option>
                                            </select>
                                        </label>
                                    </div>
                                    <div class="cs-form-actions">
                                        <button
                                            class="cs-btn primary"
                                            @click="
                                                saveGearEdit(item.instanceId)
                                            "
                                        >
                                            Save
                                        </button>
                                        <button
                                            class="cs-btn ghost"
                                            @click="editingGearId = null"
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                            </template>
                        </div>
                    </TransitionGroup>

                    <button
                        v-if="canEdit"
                        class="cs-add-btn"
                        style="margin-top: 8px"
                        data-testid="gear-add"
                        @click="showAddGear = !showAddGear"
                    >
                        + Add Gear
                    </button>
                    <div v-if="showAddGear && canEdit" class="cs-info-block" style="margin-top: 8px">
                        <div class="cs-form-stack">
                            <input
                                v-model="newGearDraft.name"
                                placeholder="Item name"
                                class="cs-input"
                                data-testid="gear-name-input"
                                @keyup.enter="submitAddGear"
                            />
                            <div style="display: flex; gap: 6px">
                                <label class="cs-form-label" style="flex: 1">Slots
                                    <div style="display: flex; align-items: center; gap: 4px; margin-top: 4px">
                                        <button
                                            class="cs-adj-btn"
                                            @click="newGearDraft.slots = Math.max(0, newGearDraft.slots - 1)"
                                        >−</button>
                                        <span style="min-width: 20px; text-align: center">{{ newGearDraft.slots }}</span>
                                        <button
                                            class="cs-adj-btn"
                                            @click="newGearDraft.slots++"
                                        >+</button>
                                    </div>
                                </label>
                                <label class="cs-form-label" style="flex: 1"
                                    >Qty<input
                                        v-model.number="newGearDraft.quantity"
                                        type="number"
                                        min="1"
                                        class="cs-input"
                                /></label>
                                <label class="cs-form-label" style="flex: 1"
                                    >Type
                                    <select
                                        v-model="newGearDraft.type"
                                        class="cs-input"
                                    >
                                        <option value="weapon">Weapon</option>
                                        <option value="armor">Armor</option>
                                        <option value="sundry">Sundry</option>
                                    </select>
                                </label>
                            </div>
                            <label
                                v-if="newGearDraft.type === 'weapon'"
                                class="cs-form-label"
                                >Damage die<input
                                    v-model="newGearDraft.damageDie"
                                    placeholder="e.g. 1d8+2"
                                    class="cs-input"
                            /></label>
                            <div style="display: flex; gap: 6px">
                                <label class="cs-form-label" style="flex: 1"
                                    >Cost (GP)<input
                                        v-model.number="newGearDraft.costGold"
                                        type="number"
                                        min="0"
                                        class="cs-input"
                                /></label>
                                <label class="cs-form-label" style="flex: 1"
                                    >SP<input
                                        v-model.number="newGearDraft.costSilver"
                                        type="number"
                                        min="0"
                                        class="cs-input"
                                /></label>
                                <label class="cs-form-label" style="flex: 1"
                                    >CP<input
                                        v-model.number="newGearDraft.costCopper"
                                        type="number"
                                        min="0"
                                        class="cs-input"
                                /></label>
                            </div>
                            <div class="cs-form-actions">
                                <button
                                    class="cs-btn primary"
                                    data-testid="gear-submit"
                                    @click="submitAddGear"
                                >
                                    Add
                                </button>
                                <button
                                    class="cs-btn ghost"
                                    @click="showAddGear = false"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <div v-if="char.treasures?.length || canEdit">
                    <span class="cs-section-label">Treasures</span>
                    <div class="cs-list" style="margin-top: 6px">
                        <div
                            v-for="(t, i) in char.treasures ?? []"
                            :key="i"
                            class="cs-list-item"
                            style="
                                display: flex;
                                align-items: center;
                                justify-content: space-between;
                                padding: 6px 8px;
                            "
                        >
                            <span class="cs-list-title">{{ t }}</span>
                            <button
                                v-if="canEdit"
                                class="cs-icon-btn danger"
                                @click="
                                    confirm('Remove this treasure?', () =>
                                        removeTreasure(i),
                                    )
                                "
                            >
                                <svg
                                    width="10"
                                    height="10"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    stroke-width="2"
                                    stroke-linecap="round"
                                >
                                    <polyline points="3 6 5 6 21 6" />
                                    <path
                                        d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"
                                    />
                                </svg>
                            </button>
                        </div>
                    </div>
                    <div
                        v-if="showAddTreasure && canEdit"
                        style="display: flex; gap: 6px; margin-top: 5px"
                    >
                        <input
                            v-model="newTreasureDraft"
                            placeholder="Description"
                            class="cs-input"
                            style="flex: 1"
                            @keyup.enter="submitAddTreasure"
                            @keyup.escape="showAddTreasure = false"
                        />
                        <button
                            class="cs-btn primary"
                            @click="submitAddTreasure"
                        >
                            Add
                        </button>
                        <button
                            class="cs-btn ghost"
                            @click="showAddTreasure = false"
                        >
                            ✕
                        </button>
                    </div>
                    <button
                        v-if="canEdit && !showAddTreasure"
                        class="cs-add-btn"
                        style="margin-top: 6px"
                        @click="showAddTreasure = true"
                    >
                        + Add Treasure
                    </button>
                </div>

                <div v-if="char.magicItems?.length || canEdit">
                    <span class="cs-section-label">Magic Items</span>
                    <div class="cs-list" style="margin-top: 6px">
                        <div
                            v-for="(m, i) in char.magicItems ?? []"
                            :key="i"
                            class="cs-list-item"
                            style="
                                display: flex;
                                align-items: center;
                                justify-content: space-between;
                                padding: 6px 8px;
                            "
                        >
                            <span class="cs-list-title">{{ m }}</span>
                            <button
                                v-if="canEdit"
                                class="cs-icon-btn danger"
                                @click="
                                    confirm('Remove this magic item?', () =>
                                        removeMagicItem(i),
                                    )
                                "
                            >
                                <svg
                                    width="10"
                                    height="10"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    stroke-width="2"
                                    stroke-linecap="round"
                                >
                                    <polyline points="3 6 5 6 21 6" />
                                    <path
                                        d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"
                                    />
                                </svg>
                            </button>
                        </div>
                    </div>
                    <div
                        v-if="showAddMagicItem && canEdit"
                        style="display: flex; gap: 6px; margin-top: 5px"
                    >
                        <input
                            v-model="newMagicItemDraft"
                            placeholder="Item name"
                            class="cs-input"
                            style="flex: 1"
                            @keyup.enter="submitAddMagicItem"
                            @keyup.escape="showAddMagicItem = false"
                        />
                        <button
                            class="cs-btn primary"
                            @click="submitAddMagicItem"
                        >
                            Add
                        </button>
                        <button
                            class="cs-btn ghost"
                            @click="showAddMagicItem = false"
                        >
                            ✕
                        </button>
                    </div>
                    <button
                        v-if="canEdit && !showAddMagicItem"
                        class="cs-add-btn"
                        style="margin-top: 6px"
                        @click="showAddMagicItem = true"
                    >
                        + Add Magic Item
                    </button>
                </div>
            </div>
            <div v-else-if="subTab === 'money'" class="cs-scroll-body">
                <div class="cs-list">
                    <div
                        v-for="coin in coins"
                        :key="coin.key"
                        class="cs-list-item"
                    >
                        <div
                            style="
                                display: flex;
                                align-items: center;
                                gap: 10px;
                                padding: 8px;
                            "
                        >
                            <div
                                class="cs-coin-icon"
                                :style="{ background: coin.bg, color: coin.fg }"
                            >
                                {{ coin.symbol }}
                            </div>
                            <div style="flex: 1">
                                <div class="cs-section-label">
                                    {{ coin.label }}
                                </div>
                                <template v-if="editingCoin === coin.key && canEdit">
                                    <input
                                        ref="coinInputRef"
                                        v-model.number="coinDraft"
                                        type="number"
                                        min="0"
                                        class="cs-input"
                                        style="
                                            width: 70px;
                                            text-align: center;
                                            font-size: 20px;
                                            font-family: var(--font-mono);
                                            font-weight: 700;
                                        "
                                        @keyup.enter="saveCoin"
                                        @keyup.escape="editingCoin = null"
                                        @blur="saveCoin"
                                    />
                                </template>
                                <button
                                    v-else-if="canEdit"
                                    class="cs-big-val cs-clickable"
                                    style="font-size: 20px"
                                    v-tooltip.bottom="'Click to edit'"
                                    :data-testid="`coin-${coin.key}`"
                                    @click="startEditCoin(coin.key)"
                                >
                                    {{ char[coin.key] ?? 0 }}
                                    <span class="cs-tip">Click to edit</span>
                                </button>
                                <div
                                    v-else
                                    v-tooltip.bottom="coin.label + ': ' + (char[coin.key] ?? 0)"
                                    style="
                                        font-family: var(--font-mono);
                                        font-size: 20px;
                                        font-weight: 700;
                                        color: var(--ink);
                                        line-height: 1.2;
                                    "
                                    :data-testid="`coin-${coin.key}`"
                                >
                                    {{ char[coin.key] ?? 0 }}
                                </div>
                            </div>
                            <div v-if="canEdit" style="display: flex; gap: 4px; align-items: center">
                                <button
                                    class="cs-adj-btn"
                                    :title="`Spend 1 ${coin.label.toLowerCase()}`"
                                    @click="
                                        characterStore.adjustMoney(coin.key, -1)
                                    "
                                >
                                    −
                                </button>
                                <button
                                    class="cs-adj-btn"
                                    :title="`Gain 1 ${coin.label.toLowerCase()}`"
                                    @click="
                                        characterStore.adjustMoney(coin.key, 1)
                                    "
                                >
                                    +
                                </button>
                                <button
                                    class="cs-adj-btn"
                                    title="Add custom amount"
                                    @click="startAddCoin(coin.key)"
                                >
                                    ⊕
                                </button>
                                <button
                                    v-if="vaultStore.ledger !== undefined"
                                    class="cs-adj-btn"
                                    :title="`Deposit ${coin.label.toLowerCase()} to party bank`"
                                    @click="startDepositCoin(coin.key)"
                                >
                                    →
                                </button>
                            </div>
                        </div>
                        <div
                            v-if="canEdit && depositingCoin === coin.key"
                            style="display:flex;align-items:center;gap:6px;padding:0 8px 8px"
                        >
                            <input
                                ref="coinDepositInputRef"
                                v-model.number="coinDepositDraft"
                                type="number"
                                class="cs-input"
                                placeholder="Amount"
                                style="flex:1;text-align:center"
                                @keyup.enter="submitDepositCoin"
                                @keyup.escape="depositingCoin = null"
                            />
                            <button
                                class="cs-btn primary"
                                style="padding:4px 10px;font-size:12px"
                                @click="submitDepositCoin"
                            >→ Bank</button>
                            <button
                                class="cs-btn ghost"
                                style="padding:4px 8px;font-size:12px"
                                @click="depositingCoin = null"
                            >×</button>
                        </div>
                        <div
                            v-if="canEdit && addingCoin === coin.key"
                            style="
                                display: flex;
                                align-items: center;
                                gap: 6px;
                                padding: 0 8px 8px;
                            "
                        >
                            <input
                                ref="coinAddInputRef"
                                v-model.number="coinAddDraft"
                                type="number"
                                class="cs-input"
                                placeholder="Amount"
                                style="flex: 1; text-align: center"
                                @keyup.enter="submitAddCoin"
                                @keyup.escape="addingCoin = null"
                            />
                            <button
                                class="cs-btn primary"
                                style="padding: 4px 10px; font-size: 12px"
                                @click="submitAddCoin"
                            >
                                Add
                            </button>
                            <button
                                class="cs-btn ghost"
                                style="padding: 4px 8px; font-size: 12px"
                                @click="addingCoin = null"
                            >
                                ×
                            </button>
                        </div>
                    </div>
                </div>

                <div v-if="canEdit" style="margin-top: 10px; padding: 0 2px">
                    <span class="cs-section-label">Convert</span>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-top: 6px">
                        <button
                            class="cs-btn ghost"
                            :disabled="(char.gold ?? 0) < 1"
                            @click="convertMoney('gold', 1, 'silver', 10)"
                        >1 GP → 10 SP</button>
                        <button
                            class="cs-btn ghost"
                            :disabled="(char.silver ?? 0) < 10"
                            @click="convertMoney('silver', 10, 'gold', 1)"
                        >10 SP → 1 GP</button>
                        <button
                            class="cs-btn ghost"
                            :disabled="(char.silver ?? 0) < 1"
                            @click="convertMoney('silver', 1, 'copper', 10)"
                        >1 SP → 10 CP</button>
                        <button
                            class="cs-btn ghost"
                            :disabled="(char.copper ?? 0) < 10"
                            @click="convertMoney('copper', 10, 'silver', 1)"
                        >10 CP → 1 SP</button>
                    </div>
                </div>

                <div v-if="char.ledger?.length" style="margin-top: 12px">
                    <span class="cs-section-label">Ledger</span>
                    <div class="cs-list" style="margin-top: 6px">
                        <div
                            v-for="(entry, i) in [...(char.ledger ?? [])].reverse()"
                            :key="i"
                            class="cs-list-item"
                            style="
                                display: flex;
                                align-items: center;
                                gap: 8px;
                                padding: 5px 8px;
                            "
                        >
                            <span
                                style="
                                    flex: 1;
                                    font-family: var(--font-body);
                                    font-size: 12px;
                                    color: var(--ink-soft);
                                    min-width: 0;
                                "
                                class="truncate"
                                >{{ entry.desc }}</span
                            >
                            <span
                                v-if="entry.goldChange"
                                :style="{
                                    color:
                                        entry.goldChange > 0
                                            ? '#b89c2a'
                                            : '#8a1c1c',
                                }"
                                style="
                                    font-family: var(--font-mono);
                                    font-size: 11px;
                                "
                                >{{ entry.goldChange > 0 ? "+" : ""
                                }}{{ entry.goldChange }}gp</span
                            >
                            <span
                                v-if="entry.silverChange"
                                :style="{
                                    color:
                                        entry.silverChange > 0
                                            ? '#6b7e8a'
                                            : '#8a1c1c',
                                }"
                                style="
                                    font-family: var(--font-mono);
                                    font-size: 11px;
                                "
                                >{{ entry.silverChange > 0 ? "+" : ""
                                }}{{ entry.silverChange }}sp</span
                            >
                            <span
                                v-if="entry.copperChange"
                                :style="{
                                    color:
                                        entry.copperChange > 0
                                            ? '#8a5a2a'
                                            : '#8a1c1c',
                                }"
                                style="
                                    font-family: var(--font-mono);
                                    font-size: 11px;
                                "
                                >{{ entry.copperChange > 0 ? "+" : ""
                                }}{{ entry.copperChange }}cp</span
                            >
                        </div>
                    </div>
                </div>
            </div>
        </template>
    </div>
</template>

<script setup>
import { ref, computed, nextTick } from "vue";
import {
    useCharacterStore,
    statMod,
    parseAttack,
    parseDamageDie,
} from "@/stores/characterStore.js";
import { useDiceStore } from "@/stores/diceStore.js";
import { useSessionStore } from "@/stores/sessionStore.js";
import { useAuthStore } from "@/stores/authStore.js";
import { useVaultStore } from "@/stores/vaultStore.js";
import { useConfirmDialog } from "@/composables/useConfirmDialog.js";
import { useTimeAgo } from "@/composables/useTimeAgo.js";
import { isGemItem, calcGearItemSlots } from "@/lib/gearSlots.js";

const characterStore = useCharacterStore();
const diceStore = useDiceStore();
const sessionStore = useSessionStore();
const authStore    = useAuthStore();
const vaultStore   = useVaultStore();

const { confirm } = useConfirmDialog();

const canEdit = computed(() => characterStore.canEditActiveCharacter);
const char = computed(() => characterStore.character);

const isGM = computed(() => sessionStore.isGM);
const isGmCharacter = computed(() => {
    const authId = characterStore.activeCharacter?.user_id;
    return isGM.value && authId === authStore.user?.id;
});

const subTab = ref("stats");
const subTabs = [
    { id: "stats", label: "Stats" },
    { id: "combat", label: "Combat" },
    { id: "gear", label: "Gear" },
    { id: "money", label: "Money" },
];

const coins = [
    {
        key: "gold",
        label: "Gold Pieces",
        symbol: "GP",
        bg: "#b89c2a",
        fg: "#fff5e8",
    },
    {
        key: "silver",
        label: "Silver Pieces",
        symbol: "SP",
        bg: "#6b7e8a",
        fg: "#fff5e8",
    },
    {
        key: "copper",
        label: "Copper Pieces",
        symbol: "CP",
        bg: "#8a5a2a",
        fg: "#fff5e8",
    },
];

const stats = computed(() => {
    if (!char.value?.stats) return [];
    return ["STR", "DEX", "CON", "INT", "WIS", "CHA"].map((key) => ({
        key,
        value: char.value.stats[key],
        mod: statMod(char.value.stats[key]),
    }));
});

const parsedAttacks = computed(() => {
    if (!char.value?.attacks) return [];
    return char.value.attacks.map((a, idx) => {
        const raw = typeof a === "string" ? a : (a.raw ?? "");
        const disabled = typeof a === "object" ? (a.disabled ?? false) : false;
        const damageDie = typeof a === "object" ? (a.damageDie ?? null) : null;
        const statKey = typeof a === "object" ? (a.statKey ?? null) : null;
        return { ...parseAttack(raw), idx, disabled, damageDie, statKey };
    });
});

function atkEffectiveBonus(atk) {
    if (atk.statKey && char.value?.stats?.[atk.statKey] !== undefined) {
        return statMod(char.value.stats[atk.statKey]);
    }
    return atk.bonus;
}

const rationSlots = computed(() => {
    const count = char.value?.rations ?? 0;
    return count > 0 ? Math.ceil(count / 3) : 0;
});

const coinGearSlots = computed(() => {
    if (!char.value) return 0
    const total = (char.value.gold ?? 0) + (char.value.silver ?? 0) + (char.value.copper ?? 0)
    return Math.max(0, Math.ceil((total - 100) / 100))
})

const effectiveGearSlotsUsed = computed(() => {
    const gearSlots = !char.value?.gear
        ? (char.value?.gearSlotsUsed ?? 0)
        : char.value.gear
              .filter((item) => !item.disabled)
              .reduce((sum, item) => sum + calcGearItemSlots(item), 0)
    return gearSlots + rationSlots.value + coinGearSlots.value
});

const sortedGear = computed(() => char.value?.gear ?? []);

const slotRatio = computed(() => {
    if (!char.value) return 0;
    return effectiveGearSlotsUsed.value / (char.value.gearSlotsTotal || 1);
});

function hpPct() {
    const max = char.value?.maxHitPoints ?? 0;
    if (!max) return 0;
    return Math.round(
        Math.min(100, Math.max(0, ((char.value?.currentHp ?? 0) / max) * 100)),
    );
}

const editingStats = ref(false);

const editingIdentity = ref(false);
const identityDraft = ref({});
function startIdentityEdit() {
    identityDraft.value = {
        name: char.value.name ?? "",
        ancestry: char.value.ancestry ?? "",
        class: char.value.class ?? "",
        level: char.value.level ?? 1,
        title: char.value.title ?? "",
    };
    editingIdentity.value = true;
}
function saveIdentityEdit() {
    for (const [field, val] of Object.entries(identityDraft.value))
        characterStore.updateField(field, val);
    editingIdentity.value = false;
}

const editingInfo = ref(false);
const infoDraft = ref({});
function startInfoEdit() {
    infoDraft.value = {
        alignment: char.value.alignment ?? "",
        background: char.value.background ?? "",
        deity: char.value.deity ?? "",
        languages: char.value.languages ?? "",
    };
    editingInfo.value = true;
}
function saveInfoEdit() {
    for (const [field, val] of Object.entries(infoDraft.value))
        characterStore.updateField(field, val);
    editingInfo.value = false;
}

const editingMaxHp = ref(false);
const maxHpDraft = ref(0);
const maxHpInputRef = ref(null);
const editingAC = ref(false);
const acDraft = ref(0);
const acInputRef = ref(null);
const editingXP = ref(false);
const xpDraft = ref(0);
const xpInputRef = ref(null);

const editingTempHp = ref(false);
const tempHpDraft = ref(0);
const tempHpInputRef = ref(null);

function startEditTempHp() {
    tempHpDraft.value = char.value.tempHp ?? 0;
    editingTempHp.value = true;
    nextTick(() => tempHpInputRef.value?.focus());
}
function saveTempHp() {
    if (!editingTempHp.value) return;
    characterStore.setTempHp(tempHpDraft.value);
    editingTempHp.value = false;
}

function startEditMaxHp() {
    maxHpDraft.value = char.value.maxHitPoints ?? 0;
    editingMaxHp.value = true;
    nextTick(() => maxHpInputRef.value?.focus());
}
function saveMaxHp() {
    const v = Number(maxHpDraft.value) || 1;
    characterStore.updateField("maxHitPoints", v);
    if ((char.value.currentHp ?? 0) > v)
        characterStore.updateField("currentHp", v);
    editingMaxHp.value = false;
}
function startEditAC() {
    acDraft.value = char.value.armorClass ?? 0;
    editingAC.value = true;
    nextTick(() => acInputRef.value?.focus());
}
function saveAC() {
    characterStore.updateField("armorClass", Number(acDraft.value) || 0);
    editingAC.value = false;
}
function startEditXP() {
    xpDraft.value = char.value.XP ?? 0;
    editingXP.value = true;
    nextTick(() => xpInputRef.value?.focus());
}
function saveXP() {
    characterStore.updateField("XP", Number(xpDraft.value) || 0);
    editingXP.value = false;
}

const editingCoin = ref(null);
const coinDraft = ref(0);
const coinInputRef = ref(null);
const addingCoin = ref(null);
const coinAddDraft = ref(null);
const coinAddInputRef = ref(null);
const depositingCoin = ref(null);
const coinDepositDraft = ref(null);
const coinDepositInputRef = ref(null);

function startDepositCoin(key) {
    depositingCoin.value = key;
    coinDepositDraft.value = null;
    nextTick(() => coinDepositInputRef.value?.focus());
}
async function submitDepositCoin() {
    const key = depositingCoin.value;
    const amount = Number(coinDepositDraft.value);
    if (!key || !amount || amount <= 0) { depositingCoin.value = null; return; }
    const available = char.value?.[key] ?? 0;
    const actual = Math.min(amount, available);
    if (actual <= 0) { depositingCoin.value = null; return; }
    characterStore.adjustMoney(key, -actual);
    const label = key.charAt(0).toUpperCase() + key.slice(1) + ' Coins';
    await vaultStore.addToBank(label, actual, '', key);
    depositingCoin.value = null;
}

function startEditCoin(key) {
    coinDraft.value = char.value[key] ?? 0;
    editingCoin.value = key;
    nextTick(() => coinInputRef.value?.[0]?.focus());
}
function saveCoin() {
    if (!editingCoin.value) return;
    characterStore.updateField(editingCoin.value, Math.max(0, Number(coinDraft.value) || 0));
    editingCoin.value = null;
}
function startAddCoin(key) {
    coinAddDraft.value = null;
    addingCoin.value = key;
    nextTick(() => coinAddInputRef.value?.focus());
}
function submitAddCoin() {
    if (!addingCoin.value) return;
    const delta = Number(coinAddDraft.value);
    if (delta) characterStore.adjustMoney(addingCoin.value, delta);
    addingCoin.value = null;
}

const luckCurrent = computed(() => char.value?.luckTokens?.current ?? 1);
// tokens are uncapped, show at least the old baseline of 3 gems and keep
// one empty outline past the filled ones as a hint that more can be added
const luckGemCount = computed(() =>
    Math.max(char.value?.luckTokens?.max ?? 3, luckCurrent.value + 1),
);

function handleSpendLuck() {
    characterStore.spendLuckToken();
}

const editingAtkIdx = ref(null);
const editAtkDraft = ref({ raw: "", damageDie: "", statKey: "" });
function startAtkEdit(atk) {
    editingAtkIdx.value = atk.idx;
    editAtkDraft.value = { raw: atk.raw, damageDie: atk.damageDie ?? "", statKey: atk.statKey ?? "" };
}
function saveAtkEdit(idx) {
    characterStore.updateAttack(idx, {
        raw: editAtkDraft.value.raw.trim(),
        damageDie: editAtkDraft.value.damageDie.trim() || null,
        statKey: editAtkDraft.value.statKey || null,
    });
    editingAtkIdx.value = null;
}

const showAddAtk = ref(false);
const newAtkDraft = ref({ raw: "", damageDie: "", statKey: "" });
const newAtkInputRef = ref(null);
function submitAddAtk() {
    if (!newAtkDraft.value.raw.trim()) return;
    characterStore.addAttack(
        newAtkDraft.value.raw.trim(),
        newAtkDraft.value.damageDie.trim() || null,
        newAtkDraft.value.statKey || null,
    );
    newAtkDraft.value = { raw: "", damageDie: "", statKey: "" };
    showAddAtk.value = false;
}

const showAddTalent = ref(false);
const newTalentDraft = ref("");
function submitAddTalent() {
    const name = newTalentDraft.value.trim();
    if (!name) return;
    characterStore.updateField("bonuses", [
        ...(char.value.bonuses ?? []),
        {
            bonusName: name,
            sourceName: "Manual",
            sourceCategory: "Manual",
            gainedAtLevel: char.value.level ?? 1,
        },
    ]);
    newTalentDraft.value = "";
    showAddTalent.value = false;
}
function removeTalent(idx) {
    characterStore.updateField(
        "bonuses",
        (char.value.bonuses ?? []).filter((_, i) => i !== idx),
    );
}

const editingSpells = ref(false);
const spellsDraft = ref("");
function startEditSpells() {
    spellsDraft.value = char.value.spellsKnown ?? "";
    editingSpells.value = true;
}
function saveSpells() {
    characterStore.updateField(
        "spellsKnown",
        spellsDraft.value.trim() || "None",
    );
    editingSpells.value = false;
}

function convertMoney(fromKey, fromAmt, toKey, toAmt) {
    if ((char.value?.[fromKey] ?? 0) < fromAmt) return;
    const symbols = { gold: "GP", silver: "SP", copper: "CP" };
    characterStore.adjustMoney(fromKey, -fromAmt);
    characterStore.adjustMoney(toKey, toAmt);
    characterStore.updateField("ledger", [
        ...(char.value?.ledger ?? []),
        {
            desc: `${fromAmt} ${symbols[fromKey]} → ${toAmt} ${symbols[toKey]}`,
            [fromKey + "Change"]: -fromAmt,
            [toKey + "Change"]: toAmt,
        },
    ]);
}

const showAddGear = ref(false);
const newGearDraft = ref({
    name: "",
    slots: 1,
    quantity: 1,
    type: "sundry",
    damageDie: "",
    costGold: 0,
    costSilver: 0,
    costCopper: 0,
});
function submitAddGear() {
    if (!newGearDraft.value.name.trim()) return;
    const costG = Math.max(0, newGearDraft.value.costGold || 0);
    const costS = Math.max(0, newGearDraft.value.costSilver || 0);
    const costC = Math.max(0, newGearDraft.value.costCopper || 0);
    if (costG > 0) characterStore.adjustMoney("gold", -costG);
    if (costS > 0) characterStore.adjustMoney("silver", -costS);
    if (costC > 0) characterStore.adjustMoney("copper", -costC);
    if (costG > 0 || costS > 0 || costC > 0) {
        const ledgerEntry = {
            desc: `Purchased ${newGearDraft.value.name.trim()}`,
            ...(costG ? { goldChange: -costG } : {}),
            ...(costS ? { silverChange: -costS } : {}),
            ...(costC ? { copperChange: -costC } : {}),
        };
        characterStore.updateField("ledger", [
            ...(char.value?.ledger ?? []),
            ledgerEntry,
        ]);
    }
    characterStore.addGearItem(newGearDraft.value);
    newGearDraft.value = {
        name: "",
        slots: 1,
        quantity: 1,
        type: "sundry",
        damageDie: "",
        costGold: 0,
        costSilver: 0,
        costCopper: 0,
    };
    showAddGear.value = false;
}
const editingGearId = ref(null);
const editGearDraft = ref({});
function startGearEdit(item) {
    editingGearId.value = item.instanceId;
    editGearDraft.value = {
        name: item.name,
        slots: item.slots,
        quantity: item.quantity,
        type: item.type,
    };
}
function saveGearEdit(instanceId) {
    const patch = {
        ...editGearDraft.value,
        slots: Math.round(Math.max(0, Number(editGearDraft.value.slots) || 0)),
        quantity: Number(editGearDraft.value.quantity) || 1,
    };
    const name = (patch.name ?? "").trim();
    if (name) patch.name = name;
    else delete patch.name;
    characterStore.updateGearItem(instanceId, patch);
    editingGearId.value = null;
}

const showAddTreasure = ref(false);
const newTreasureDraft = ref("");
function submitAddTreasure() {
    const t = newTreasureDraft.value.trim();
    if (!t) return;
    characterStore.updateField("treasures", [
        ...(char.value.treasures ?? []),
        t,
    ]);
    newTreasureDraft.value = "";
    showAddTreasure.value = false;
}
function removeTreasure(idx) {
    characterStore.updateField(
        "treasures",
        (char.value.treasures ?? []).filter((_, i) => i !== idx),
    );
}

const showAddMagicItem = ref(false);
const newMagicItemDraft = ref("");
function submitAddMagicItem() {
    const t = newMagicItemDraft.value.trim();
    if (!t) return;
    characterStore.updateField("magicItems", [
        ...(char.value.magicItems ?? []),
        t,
    ]);
    newMagicItemDraft.value = "";
    showAddMagicItem.value = false;
}
function removeMagicItem(idx) {
    characterStore.updateField(
        "magicItems",
        (char.value.magicItems ?? []).filter((_, i) => i !== idx),
    );
}

const dexMod = computed(() => {
    const dex = char.value?.stats?.DEX;
    return dex !== undefined ? statMod(dex) : 0;
});

const { timeAgo } = useTimeAgo();

const renownValue = computed(() => characterStore.renownValue());
const renownLogCount = computed(() => char.value?.renownLog?.length ?? 0);
const showRenownLog = ref(false);
const renownLog = computed(() =>
    showRenownLog.value ? [...(char.value?.renownLog ?? [])].reverse() : [],
);

const renownReason = ref("");
const editingRenown = ref(false);
const renownDraft = ref(0);
const renownInputRef = ref(null);

function bumpRenown(delta) {
    characterStore.adjustRenown(delta, renownReason.value);
    renownReason.value = "";
}
function startEditRenown() {
    renownDraft.value = renownValue.value;
    editingRenown.value = true;
    nextTick(() => renownInputRef.value?.focus());
}
function saveRenown() {
    if (!editingRenown.value) return;
    editingRenown.value = false;
    if (typeof renownDraft.value !== "number") return;
    characterStore.setRenown(renownDraft.value);
}

const editingInitiative = ref(false);
const initiativeDraft = ref(0);
const initiativeInputRef = ref(null);

function startEditInitiative() {
    initiativeDraft.value = char.value?.initiative ?? 0;
    editingInitiative.value = true;
    nextTick(() => initiativeInputRef.value?.focus());
}
function saveInitiative() {
    characterStore.updateField("initiative", Number(initiativeDraft.value));
    editingInitiative.value = false;
}
async function rollInitiative() {
    const result = await diceStore.rollDice(
        { d20: 1 },
        dexMod.value,
        "Initiative",
        characterStore.activeId,
    );
    if (result?.total != null) {
        characterStore.updateField("initiative", result.total);
    }
}

const STAT_NAMES = {
    STR: "Strength",
    DEX: "Dexterity",
    CON: "Constitution",
    INT: "Intelligence",
    WIS: "Wisdom",
    CHA: "Charisma",
};
function rollStat(stat) {
    diceStore.rollDice(
        { d20: 1 },
        stat.mod,
        `${STAT_NAMES[stat.key] ?? stat.key} check`,
        characterStore.activeId,
    );
}
function rollAttack(atk) {
    diceStore.rollDice(
        { d20: 1 },
        atkEffectiveBonus(atk),
        atk.label,
        characterStore.activeId,
    );
}
function rollDamage(atk) {
    const parsed = parseDamageDie(atk.damageDie);
    if (!parsed) return;
    diceStore.rollDice(
        { [`d${parsed.sides}`]: parsed.count },
        parsed.modifier,
        `${atk.label} damage`,
        characterStore.activeId,
    );
}
</script>

<style scoped>
.cs-root {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--paper, #ede1c7);
    color: var(--ink, #1a1410);
    font-family: var(--font-body, serif);
}

.cs-empty-state {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 24px 16px;
    text-align: center;
    font-family: var(--font-body, serif);
    font-style: italic;
    font-size: 13px;
    color: var(--ink-soft, #6b5e4e);
}

.cs-readonly-bar {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 5px 10px;
    background: var(--paper-2, #e4d8c0);
    border-bottom: 1px solid var(--rule, #d4c4a8);
    font-family: var(--font-zine, "Special Elite", serif);
    font-size: 9.5px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--ink-mute, #9e8e7e);
}

.cs-identity {
    padding: 10px 12px;
    border-bottom: 1px solid var(--rule-strong, #c8baa0);
    background: var(--paper, #ede1c7);
}
.cs-char-name {
    font-family: var(--font-display, "IM Fell English", serif);
    font-style: italic;
    font-size: 16px;
    color: var(--ink, #1a1410);
    line-height: 1.2;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
.cs-char-role {
    font-family: var(--font-zine, "Special Elite", serif);
    font-size: 10px;
    letter-spacing: 0.06em;
    color: var(--ink-soft, #6b5e4e);
    text-transform: uppercase;
    margin-top: 2px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.cs-tab-bar {
    display: flex;
    border-bottom: 1px solid var(--rule-strong, #c8baa0);
    background: var(--paper-2, #e4d8c0);
    flex-shrink: 0;
}
.cs-tab {
    flex: 1;
    padding: 7px 0;
    font-family: var(--font-zine, "Special Elite", serif);
    font-size: 9.5px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--ink-mute, #9e8e7e);
    background: transparent;
    border: none;
    border-bottom: 2px solid transparent;
    margin-bottom: -1px;
    cursor: pointer;
    transition: color 0.12s;
}
.cs-tab:hover {
    color: var(--ink-2, #3a2e22);
}
.cs-tab.active {
    color: var(--ink, #1a1410);
    border-bottom-color: var(--accent-2, #b8541c);
}

.cs-scroll-body {
    flex: 1;
    overflow-y: auto;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 14px;
}

.cs-section-label {
    display: block;
    font-family: var(--font-zine, "Special Elite", serif);
    font-size: 9.5px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--ink-mute, #9e8e7e);
}

.cs-big-stat {
    flex: 1;
    background: var(--paper-2, #e4d8c0);
    border: 1px solid var(--rule, #d4c4a8);
    padding: 8px 6px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
}
.cs-big-val {
    font-family: var(--font-mono, "JetBrains Mono", monospace);
    font-size: 22px;
    font-weight: 700;
    color: var(--ink, #1a1410);
    line-height: 1;
}
button.cs-big-val {
    background: transparent;
    border: none;
    cursor: pointer;
}
.cs-sub-val {
    font-family: var(--font-mono, "JetBrains Mono", monospace);
    font-size: 11px;
    color: var(--ink-mute, #9e8e7e);
}
button.cs-sub-val {
    background: transparent;
    border: none;
    cursor: pointer;
    position: relative;
}
button.cs-sub-val:hover {
    color: var(--accent-2, #b8541c);
}
button.cs-big-val {
    position: relative;
}

.cs-tip {
    position: absolute;
    top: calc(100% + 6px);
    left: 50%;
    transform: translateX(-50%);
    background: var(--ink, #1a1410);
    color: var(--paper, #ede1c7);
    font-family: var(--font-ui, sans-serif);
    font-size: 11px;
    font-weight: 500;
    padding: 4px 9px;
    white-space: nowrap;
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.12s;
    z-index: 100;
    border: 1px solid rgba(237, 225, 199, 0.22);
    box-shadow: 0 3px 12px rgba(0, 0, 0, 0.4);
}
.cs-tip::before {
    content: "";
    position: absolute;
    bottom: 100%;
    left: 50%;
    transform: translateX(-50%);
    border: 4px solid transparent;
    border-bottom-color: var(--ink, #1a1410);
}
button.cs-sub-val:hover .cs-tip,
button.cs-big-val:hover .cs-tip {
    opacity: 1;
    transition: opacity 0s;
}

.cs-hp-bar {
    width: 100%;
    height: 5px;
    background: var(--paper-3, #d8ccb4);
    position: relative;
    overflow: hidden;
}
.cs-hp-bar-fill {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    background: linear-gradient(90deg, #6b3a2a, var(--accent, #c8a86b));
    display: block;
    transition: width 0.3s ease;
}

.cs-temp-hp {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-top: 5px;
}
.cs-temp-hp-label {
    font-family: var(--font-zine, "Special Elite", serif);
    font-size: 9px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: #3f6b8a;
}
.cs-adj-btn-sm {
    width: 18px;
    height: 18px;
    font-size: 11px;
}
.cs-temp-hp-val {
    font-family: var(--font-mono, "JetBrains Mono", monospace);
    font-size: 13px;
    font-weight: 700;
    color: #3f6b8a;
    min-width: 14px;
    text-align: center;
}
button.cs-temp-hp-val {
    background: transparent;
    border: none;
    cursor: pointer;
}
button.cs-temp-hp-val:hover {
    color: var(--accent-2, #b8541c);
}
.cs-temp-hp-input {
    width: 44px;
    text-align: center;
    padding: 2px 4px;
    font-family: var(--font-mono, "JetBrains Mono", monospace);
    font-weight: 700;
}

.cs-renown-block {
    background: var(--paper-2, #e4d8c0);
    border: 1px solid var(--rule, #d4c4a8);
    padding: 8px 10px;
}
.cs-renown-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
}
.cs-renown-value {
    font-family: var(--font-mono, "JetBrains Mono", monospace);
    font-size: 18px;
    font-weight: 700;
    color: #6b4e8a;
    min-width: 20px;
    text-align: right;
}
button.cs-renown-value {
    background: transparent;
    border: none;
    cursor: pointer;
}
button.cs-renown-value:hover {
    color: var(--accent-2, #b8541c);
}
.cs-renown-input {
    width: 56px;
    text-align: center;
    padding: 2px 4px;
    font-family: var(--font-mono, "JetBrains Mono", monospace);
    font-weight: 700;
}
.cs-renown-controls {
    display: flex;
    align-items: center;
    gap: 5px;
    margin-top: 8px;
}
.cs-renown-reason {
    flex: 1 1 auto;
    min-width: 0;
    padding: 3px 6px;
    font-size: 11px;
}
.cs-renown-log-toggle {
    margin-top: 8px;
    background: transparent;
    border: none;
    padding: 0;
    cursor: pointer;
    font-family: var(--font-zine, "Special Elite", serif);
    font-size: 9.5px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--ink-mute, #9e8e7e);
}
.cs-renown-log-toggle:hover {
    color: var(--accent-2, #b8541c);
}
.cs-renown-log {
    list-style: none;
    margin: 6px 0 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
    max-height: 160px;
    overflow-y: auto;
}
.cs-renown-log-row {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    padding: 2px 0;
    border-top: 1px dotted var(--rule, #d4c4a8);
}
.cs-renown-delta {
    flex: 0 0 auto;
    font-family: var(--font-mono, "JetBrains Mono", monospace);
    font-weight: 700;
    min-width: 22px;
    text-align: center;
}
.cs-renown-gain {
    color: #3f7a4f;
}
.cs-renown-loss {
    color: #a33d3d;
}
.cs-renown-reason-text {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--ink, #1a1410);
}
.cs-renown-when {
    flex: 0 0 auto;
    font-size: 10px;
    color: var(--ink-mute, #9e8e7e);
}
.cs-renown-del {
    flex: 0 0 auto;
    background: transparent;
    border: none;
    cursor: pointer;
    color: var(--ink-mute, #9e8e7e);
    font-size: 14px;
    line-height: 1;
    padding: 0 2px;
}
.cs-renown-del:hover {
    color: #a33d3d;
}

.cs-stats-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 5px;
}
.cs-stat-cell {
    background: var(--paper-2, #e4d8c0);
    border: 1px solid var(--rule, #d4c4a8);
    padding: 6px 4px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
}
.cs-stat-lbl {
    font-family: var(--font-zine, "Special Elite", serif);
    font-size: 9px;
    letter-spacing: 0.08em;
    color: var(--ink-mute, #9e8e7e);
    text-transform: uppercase;
}
.cs-stat-val {
    font-family: var(--font-mono, "JetBrains Mono", monospace);
    font-size: 15px;
    font-weight: 700;
    color: var(--ink, #1a1410);
    line-height: 1.1;
}
button.cs-stat-val {
    background: transparent;
    border: none;
    cursor: pointer;
}
button.cs-stat-val:hover {
    color: var(--accent-2, #b8541c);
}
.cs-stat-mod {
    font-family: var(--font-mono, "JetBrains Mono", monospace);
    font-size: 10px;
}
.cs-stat-mod.positive {
    color: var(--accent-3, #5a6b3a);
}
.cs-stat-mod.negative {
    color: #8a1c1c;
}

.cs-info-block {
    background: var(--paper-2, #e4d8c0);
    border: 1px solid var(--rule, #d4c4a8);
    padding: 8px 10px;
}
.cs-info-rows {
    display: flex;
    flex-direction: column;
    gap: 3px;
    font-size: 12.5px;
    color: var(--ink-2, #3a2e22);
}
.cs-info-lbl {
    color: var(--ink-mute, #9e8e7e);
    margin-right: 4px;
}

.cs-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
}
.cs-list-inner {
    display: flex;
    flex-direction: column;
    gap: 4px;
}
.cs-list-item {
    background: var(--paper-2, #e4d8c0);
    border: 1px solid var(--rule, #d4c4a8);
    overflow: hidden;
    transition:
        opacity 0.12s,
        transform 0.18s ease;
}
.cs-gear-header {
    display: flex;
    flex-direction: column;
    gap: 6px;
}
.cs-gear-slot-count {
    display: flex;
    align-items: center;
    gap: 5px;
}
.cs-gear-slot-num {
    font-family: var(--font-mono, monospace);
    font-size: 22px;
    font-weight: 700;
    line-height: 1;
}
.cs-gear-slot-sep {
    font-family: var(--font-mono, monospace);
    font-size: 15px;
    color: var(--ink-soft, #6b5e4e);
    flex: 1;
}

.cs-tracked-row {
    display: flex;
    align-items: center;
    background: var(--paper-3, #d8ccb4);
    border: 1px solid var(--rule, #d4c4a8);
    overflow: hidden;
}
.cs-tracked-title {
    font-family: var(--font-body, serif);
    font-size: 15px;
    color: var(--ink, #1a1410);
    font-weight: 600;
}
.cs-tracked-sub {
    font-family: var(--font-body, serif);
    font-size: 14px;
    color: var(--ink-soft, #6b5e4e);
    margin-top: 1px;
}
.cs-tracked-controls {
    display: flex;
    gap: 3px;
    padding: 0 6px;
    align-items: center;
    border-left: 1px solid var(--rule, #d4c4a8);
    flex-shrink: 0;
}
.cs-tracked-badge {
    font-family: var(--font-zine, "Special Elite", serif);
    font-size: 11px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    padding: 2px 8px;
    border-left: 1px solid var(--rule, #d4c4a8);
    color: var(--ink-soft, #6b5e4e);
    align-self: stretch;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 72px;
    flex: 0 0 72px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.cs-scroll-gear .cs-section-label { font-size: 11px; }
.cs-scroll-gear .cs-list-title    { font-size: 15px; }
.cs-scroll-gear .cs-list-sub      { font-size: 14px; }
.cs-scroll-gear .cs-gear-badge    { font-size: 11px; }

.cs-coins-mini-grid {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-top: 5px;
}
.cs-coins-mini-item {
    display: flex;
    align-items: center;
    gap: 7px;
}
.cs-mini-coin-icon {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--font-mono, monospace);
    font-size: 8px;
    font-weight: 700;
    flex-shrink: 0;
}
.cs-mini-coin-amt {
    font-family: var(--font-mono, monospace);
    font-size: 15px;
    font-weight: 700;
    color: var(--ink, #1a1410);
}
.cs-coins-mini-total {
    display: flex;
    align-items: baseline;
    gap: 6px;
    padding-top: 3px;
    border-top: 1px solid var(--rule, #d4c4a8);
    margin-top: 2px;
}
.cs-coins-mini-total-num {
    font-family: var(--font-mono, monospace);
    font-size: 15px;
    font-weight: 700;
    color: var(--ink, #1a1410);
}
.cs-list-item.disabled {
    opacity: 0.45;
}
.cs-list-group:hover .cs-list-controls {
    opacity: 1 !important;
}
.cs-list-main {
    flex: 1;
    text-align: left;
    padding: 6px 8px;
    background: transparent;
    border: none;
    cursor: pointer;
    transition: background 0.1s;
}
.cs-list-main:hover:not(:disabled) {
    background: rgba(26, 20, 16, 0.05);
}
.cs-list-main:disabled {
    cursor: default;
}
.cs-list-title {
    font-family: var(--font-body, serif);
    font-size: 13px;
    color: var(--ink, #1a1410);
    font-weight: 600;
}
.cs-list-title.strikethrough {
    text-decoration: line-through;
    color: var(--ink-mute, #9e8e7e);
}
.cs-list-sub {
    font-family: var(--font-body, serif);
    font-size: 12px;
    color: var(--ink-soft, #6b5e4e);
    margin-top: 1px;
}
.cs-atk-stat-badge {
    font-family: var(--font-mono, monospace);
    font-size: 11px;
    color: var(--accent, #8a1c1c);
    font-weight: 600;
    letter-spacing: 0.03em;
}
.cs-list-action-col {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 0 8px;
    gap: 2px;
    background: transparent;
    border: none;
    cursor: pointer;
    flex-shrink: 0;
}
.cs-list-action-col:hover {
    background: rgba(26, 20, 16, 0.05);
}
.cs-list-controls {
    display: flex;
    flex-direction: column;
    gap: 3px;
    justify-content: center;
    padding: 0 6px;
    border-left: 1px solid var(--rule, #d4c4a8);
    flex-shrink: 0;
    transition: opacity 0.12s;
}

.cs-gear-badge {
    font-family: var(--font-zine, "Special Elite", serif);
    font-size: 9px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    padding: 2px 6px;
    border: 1px solid;
    align-self: flex-start;
    flex-shrink: 0;
}
.cs-gear-badge.weapon {
    background: rgba(138, 28, 28, 0.1);
    color: #8a1c1c;
    border-color: rgba(138, 28, 28, 0.3);
}
.cs-gear-badge.armor {
    background: rgba(44, 82, 102, 0.1);
    color: #2c5266;
    border-color: rgba(44, 82, 102, 0.3);
}
.cs-gear-badge.sundry {
    background: var(--paper-3, #d8ccb4);
    color: var(--ink-mute, #9e8e7e);
    border-color: var(--rule, #d4c4a8);
}

.cs-coin-icon {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--font-mono, "JetBrains Mono", monospace);
    font-size: 10px;
    font-weight: 700;
    flex-shrink: 0;
}

.cs-slot-bar {
    height: 5px;
    background: var(--paper-3, #d8ccb4);
    overflow: hidden;
}
.cs-slot-bar-fill {
    height: 100%;
    transition: width 0.3s ease;
}

.cs-icon-btn {
    background: transparent;
    border: none;
    color: var(--ink-mute, #9e8e7e);
    display: flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    cursor: pointer;
    border-radius: 2px;
    transition:
        color 0.12s,
        background 0.12s;
    flex-shrink: 0;
}
.cs-icon-btn:hover {
    color: var(--ink, #1a1410);
    background: rgba(26, 20, 16, 0.07);
}
.cs-icon-btn.danger:hover {
    color: #8a1c1c;
    background: rgba(138, 28, 28, 0.08);
}

.cs-adj-btn {
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--paper-3, #d8ccb4);
    border: 1px solid var(--rule-strong, #c8baa0);
    color: var(--ink, #1a1410);
    font-size: 14px;
    cursor: pointer;
    border-radius: 1px;
    flex-shrink: 0;
    transition: background 0.1s;
}
.cs-adj-btn:hover {
    background: var(--ink, #1a1410);
    color: var(--paper, #ede1c7);
}

.cs-add-btn {
    width: 100%;
    padding: 6px;
    background: transparent;
    border: 1px dashed var(--rule-strong, #c8baa0);
    color: var(--ink-mute, #9e8e7e);
    font-family: var(--font-zine, "Special Elite", serif);
    font-size: 9.5px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    cursor: pointer;
    transition:
        color 0.12s,
        border-color 0.12s;
}
.cs-add-btn:hover {
    color: var(--ink, #1a1410);
    border-color: var(--ink-soft, #6b5e4e);
}

.cs-btn {
    font-family: var(--font-zine, "Special Elite", serif);
    font-size: 9.5px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    padding: 4px 12px;
    cursor: pointer;
    border-radius: 2px;
    transition:
        background 0.1s,
        color 0.1s;
}
.cs-btn.primary {
    background: var(--ink, #1a1410);
    color: var(--paper, #ede1c7);
    border: 1px solid var(--ink, #1a1410);
}
.cs-btn.primary:hover {
    background: var(--ink-2, #3a2e22);
}
.cs-btn.ghost {
    background: transparent;
    color: var(--ink-soft, #6b5e4e);
    border: 1px solid var(--rule-strong, #c8baa0);
}
.cs-btn.ghost:hover {
    color: var(--ink, #1a1410);
}
.cs-btn:disabled {
    opacity: 0.35;
    cursor: not-allowed;
}

.cs-form-stack {
    display: flex;
    flex-direction: column;
    gap: 6px;
}
.cs-form-label {
    display: flex;
    flex-direction: column;
    gap: 3px;
    font-family: var(--font-zine, "Special Elite", serif);
    font-size: 9px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--ink-mute, #9e8e7e);
}
.cs-form-actions {
    display: flex;
    gap: 6px;
    justify-content: flex-end;
    margin-top: 2px;
}

.cs-input {
    background: var(--paper-3, #d8ccb4);
    border: 1px solid var(--rule-strong, #c8baa0);
    color: var(--ink, #1a1410);
    font-family: var(--font-body, serif);
    font-size: 13px;
    padding: 5px 8px;
    outline: none;
    width: 100%;
    box-sizing: border-box;
    transition: border-color 0.12s;
}
.cs-input:focus {
    border-color: var(--accent-2, #b8541c);
}

.cs-textarea {
    resize: vertical;
}

select.cs-input {
    cursor: pointer;
}

button.cs-clickable {
    background: transparent;
    border: none;
    cursor: pointer;
    transition: color 0.12s;
}
button.cs-clickable:hover {
    color: var(--accent-2, #b8541c);
}

.cs-luck-block {
    background: var(--paper-2, #e4d8c0);
    border: 1px solid var(--rule, #d4c4a8);
    padding: 8px 10px;
}

.cs-luck-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
}

.cs-luck-count {
    font-family: var(--font-mono, "JetBrains Mono", monospace);
    font-size: 11px;
    color: var(--ink-mute, #9e8e7e);
}

.cs-luck-gems {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    align-items: center;
}

.cs-luck-gem {
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--ink-mute, #9e8e7e);
    opacity: 0.35;
    transition:
        color 0.2s ease-out,
        opacity 0.2s ease-out;
}

.cs-luck-gem.filled {
    color: #c8a86b;
    opacity: 1;
}

.cs-luck-spend-btn {
    width: 100%;
    padding: 7px;
    background: var(--paper-3, #d8ccb4);
    border: 1px solid var(--rule-strong, #c8baa0);
    color: var(--ink, #1a1410);
    font-family: var(--font-zine, "Special Elite", serif);
    font-size: 9.5px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    cursor: pointer;
    transition:
        background 0.12s,
        color 0.12s,
        transform 0.1s ease-out;
}
.cs-luck-spend-btn:hover {
    background: var(--ink, #1a1410);
    color: var(--paper, #ede1c7);
}
.cs-luck-spend-btn:active {
    transform: scale(0.97);
}

.cs-gear-move-col {
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
    border-right: 1px solid var(--rule, #d4c4a8);
}

.cs-gear-move-btn {
    flex: 1;
    width: 22px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    color: var(--ink-mute, #9e8e7e);
    cursor: pointer;
    transition:
        color 0.1s,
        background 0.1s;
}
.cs-gear-move-btn:hover:not(:disabled) {
    color: var(--ink, #1a1410);
    background: rgba(26, 20, 16, 0.07);
}
.cs-gear-move-btn:disabled {
    color: var(--rule-strong, #c8baa0);
    cursor: default;
}

.cs-initiative-block {
    padding: 8px 0 4px;
    border-bottom: 1px solid var(--rule, #d4c4a8);
    margin-bottom: 4px;
}
.cs-initiative-row {
    display: flex;
    align-items: center;
    gap: 8px;
}
.cs-initiative-val {
    font-family: var(--font-mono, monospace);
    font-size: 20px;
    font-weight: 700;
    color: var(--ink, #1a1410);
    min-width: 28px;
}
.cs-initiative-actions {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-left: auto;
}
</style>
