<template>
    <div class="cs-root">
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
                            <div class="cs-char-name">{{ char.name }}</div>
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
                                @click="characterStore.adjustHp(-1)"
                            >
                                −
                            </button>
                            <span class="cs-big-val">{{ char.currentHp }}</span>
                            <button
                                v-if="canEdit"
                                class="cs-adj-btn"
                                title="+1 HP"
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

                <div class="cs-luck-block">
                    <div class="cs-luck-header">
                        <span class="cs-section-label">Luck</span>
                        <span class="cs-luck-count"
                            >{{ luckCurrent }}&thinsp;/&thinsp;{{
                                luckMax
                            }}</span
                        >
                    </div>
                    <div class="cs-luck-gems">
                        <span
                            v-for="i in luckMax"
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
                            v-if="luckCurrent < luckMax"
                            class="cs-add-btn"
                            style="margin-top: 6px"
                            @click="characterStore.adjustLuck(1)"
                        >
                            + Restore Token
                        </button>
                    </template>
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
                                            {{
                                                atk.raw
                                                    .split(":")
                                                    .slice(1)
                                                    .join(":")
                                                    .trim()
                                            }}
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
                                        placeholder="Name: +bonus to hit…"
                                        @keyup.enter="saveAtkEdit(atk.idx)"
                                        @keyup.escape="editingAtkIdx = null"
                                    />
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
                                placeholder="Name: +bonus to hit…"
                                @keyup.enter="submitAddAtk"
                                @keyup.escape="showAddAtk = false"
                            />
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

            <div v-else-if="subTab === 'gear'" class="cs-scroll-body">
                <div>
                    <div
                        style="
                            display: flex;
                            justify-content: space-between;
                            align-items: center;
                            margin-bottom: 5px;
                        "
                    >
                        <span class="cs-section-label" style="color: var(--ink)"
                            >Gear Slots</span
                        >
                        <div
                            style="
                                display: flex;
                                align-items: center;
                                gap: 5px;
                                font-family: var(--font-mono);
                                font-size: 11px;
                                color: var(--ink-2);
                            "
                        >
                            <button
                                v-if="canEdit"
                                class="cs-adj-btn"
                                style="
                                    width: 18px;
                                    height: 18px;
                                    font-size: 11px;
                                "
                                @click="
                                    characterStore.updateField(
                                        'gearSlotsTotal',
                                        Math.max(
                                            0,
                                            (char.gearSlotsTotal ?? 0) - 1,
                                        ),
                                    )
                                "
                            >
                                −
                            </button>
                            <span
                                >{{ effectiveGearSlotsUsed }} /
                                {{ char.gearSlotsTotal }}</span
                            >
                            <button
                                v-if="canEdit"
                                class="cs-adj-btn"
                                style="
                                    width: 18px;
                                    height: 18px;
                                    font-size: 11px;
                                "
                                @click="
                                    characterStore.updateField(
                                        'gearSlotsTotal',
                                        (char.gearSlotsTotal ?? 0) + 1,
                                    )
                                "
                            >
                                +
                            </button>
                        </div>
                    </div>
                    <div class="cs-slot-bar">
                        <div
                            class="cs-slot-bar-fill"
                            :style="{
                                width: `${Math.min(100, slotRatio * 100)}%`,
                                background:
                                    slotRatio > 0.9
                                        ? '#8a1c1c'
                                        : slotRatio > 0.7
                                          ? '#b8541c'
                                          : 'var(--accent-3, #5a6b3a)',
                            }"
                        />
                    </div>
                </div>

                <div
                    style="padding-top: 10px; border-top: 1px solid var(--rule)"
                >
                    <div
                        style="
                            font-family: var(
                                --font-zine,
                                &quot;Special Elite&quot;,
                                serif
                            );
                            font-size: 11px;
                            letter-spacing: 0.08em;
                            text-transform: uppercase;
                            color: var(--ink);
                            margin-bottom: 8px;
                        "
                    >
                        Rations<template v-if="rationSlots">
                            — {{ rationSlots }} slot{{
                                rationSlots !== 1 ? "s" : ""
                            }}</template
                        >
                    </div>
                    <div
                        style="
                            display: flex;

                            gap: 6px;
                        "
                    >
                        <button
                            v-if="canEdit"
                            class="cs-adj-btn"
                            @click="
                                characterStore.updateField(
                                    'rations',
                                    Math.max(0, (char.rations ?? 0) - 1),
                                )
                            "
                        >
                            −
                        </button>
                        <span
                            style="
                                font-family: var(--font-mono);
                                font-size: 13px;
                                min-width: 20px;
                                text-align: center;
                            "
                            >{{ char.rations ?? 0 }} 🍫</span
                        >
                        <button
                            v-if="canEdit"
                            class="cs-adj-btn"
                            @click="
                                characterStore.updateField(
                                    'rations',
                                    (char.rations ?? 0) + 1,
                                )
                            "
                        >
                            +
                        </button>
                        <span
                            style="
                                font-family: var(--font-mono);
                                font-size: 10px;
                                font-style: italic;
                                color: var(--ink-mute);
                                margin-left: 4px;
                            "
                            >(3 per slot)</span
                        >
                    </div>
                    <button
                        v-if="canEdit"
                        class="cs-add-btn"
                        style="margin-top: 6px font-size: 12px;"
                        @click="
                            characterStore.updateField(
                                'rations',
                                (char.rations ?? 0) + 3,
                            )
                        "
                    >
                        + Add 3-pack of rations
                    </button>
                </div>

                <div v-if="showAddGear && canEdit" class="cs-info-block">
                    <div class="cs-form-stack">
                        <input
                            v-model="newGearDraft.name"
                            placeholder="Item name"
                            class="cs-input"
                            @keyup.enter="submitAddGear"
                        />
                        <div style="display: flex; gap: 6px">
                            <label class="cs-form-label" style="flex: 1"
                                >Slots<input
                                    v-model.number="newGearDraft.slots"
                                    type="number"
                                    min="0"
                                    step="1"
                                    class="cs-input"
                            /></label>
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
                        <div class="cs-form-actions">
                            <button
                                class="cs-btn primary"
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

                <div class="cs-list">
                    <div
                        v-for="(item, gearIdx) in sortedGear"
                        :key="item.instanceId"
                        class="cs-list-item"
                        :class="{ disabled: item.disabled }"
                    >
                        <template v-if="editingGearId !== item.instanceId">
                            <div
                                style="display: flex; align-items: stretch"
                                class="cs-list-group"
                            >
                                <div v-if="canEdit" class="cs-gear-move-col">
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
                                            gearIdx === sortedGear.length - 1
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
                                                strikethrough: item.disabled,
                                            }"
                                        >
                                            {{ item.name }}
                                        </div>
                                        <div class="cs-list-sub">
                                            {{ item.slots }} slot{{
                                                item.slots !== 1 ? "s" : ""
                                            }}<span v-if="item.quantity > 1">
                                                · ×{{ item.quantity }}</span
                                            >
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
                                                <circle cx="12" cy="12" r="3" />
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
                                    <label class="cs-form-label" style="flex: 1"
                                        >Slots<input
                                            v-model.number="editGearDraft.slots"
                                            type="number"
                                            min="0"
                                            step="1"
                                            class="cs-input"
                                    /></label>
                                    <label class="cs-form-label" style="flex: 1"
                                        >Qty<input
                                            v-model.number="
                                                editGearDraft.quantity
                                            "
                                            type="number"
                                            min="1"
                                            class="cs-input"
                                    /></label>
                                    <label class="cs-form-label" style="flex: 1"
                                        >Type
                                        <select
                                            v-model="editGearDraft.type"
                                            class="cs-input"
                                        >
                                            <option value="weapon">
                                                Weapon
                                            </option>
                                            <option value="armor">Armor</option>
                                            <option value="sundry">
                                                Sundry
                                            </option>
                                        </select>
                                    </label>
                                </div>
                                <div class="cs-form-actions">
                                    <button
                                        class="cs-btn primary"
                                        @click="saveGearEdit(item.instanceId)"
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
                    <button
                        v-if="canEdit"
                        class="cs-add-btn"
                        style="margin-top: 8px"
                        @click="showAddGear = !showAddGear"
                    >
                        + Add Gear
                    </button>
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
                                <div
                                    style="
                                        font-family: var(--font-mono);
                                        font-size: 20px;
                                        font-weight: 700;
                                        color: var(--ink);
                                        line-height: 1.2;
                                    "
                                >
                                    {{ char[coin.key] ?? 0 }}
                                </div>
                            </div>
                            <div v-if="canEdit" style="display: flex; gap: 4px">
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
                            </div>
                        </div>
                    </div>
                </div>

                <div v-if="char.ledger?.length" style="margin-top: 12px">
                    <span class="cs-section-label">Ledger</span>
                    <div class="cs-list" style="margin-top: 6px">
                        <div
                            v-for="(entry, i) in char.ledger"
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
import { useConfirmDialog } from "@/composables/useConfirmDialog.js";

const characterStore = useCharacterStore();
const diceStore = useDiceStore();
const { confirm } = useConfirmDialog();

const canEdit = computed(() => characterStore.canEditActiveCharacter);
const char = computed(() => characterStore.character);

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
        return { ...parseAttack(raw), idx, disabled, damageDie };
    });
});

const rationSlots = computed(() => {
    const count = char.value?.rations ?? 0;
    return count > 0 ? Math.ceil(count / 3) : 0;
});

const effectiveGearSlotsUsed = computed(() => {
    const gearSlots = !char.value?.gear
        ? (char.value?.gearSlotsUsed ?? 0)
        : char.value.gear
              .filter((item) => !item.disabled)
              .reduce(
                  (sum, item) => sum + (item.slots ?? 0) * (item.quantity ?? 1),
                  0,
              );
    return gearSlots + rationSlots.value;
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

const luckCurrent = computed(() => char.value?.luckTokens?.current ?? 1);
const luckMax = computed(() => char.value?.luckTokens?.max ?? 3);

function handleSpendLuck() {
    characterStore.spendLuckToken();
}

const editingAtkIdx = ref(null);
const editAtkDraft = ref({ raw: "", damageDie: "" });
function startAtkEdit(atk) {
    editingAtkIdx.value = atk.idx;
    editAtkDraft.value = { raw: atk.raw, damageDie: atk.damageDie ?? "" };
}
function saveAtkEdit(idx) {
    characterStore.updateAttack(idx, {
        raw: editAtkDraft.value.raw.trim(),
        damageDie: editAtkDraft.value.damageDie.trim() || null,
    });
    editingAtkIdx.value = null;
}

const showAddAtk = ref(false);
const newAtkDraft = ref({ raw: "", damageDie: "" });
const newAtkInputRef = ref(null);
function submitAddAtk() {
    if (!newAtkDraft.value.raw.trim()) return;
    characterStore.addAttack(
        newAtkDraft.value.raw.trim(),
        newAtkDraft.value.damageDie.trim() || null,
    );
    newAtkDraft.value = { raw: "", damageDie: "" };
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

const showAddGear = ref(false);
const newGearDraft = ref({
    name: "",
    slots: 1,
    quantity: 1,
    type: "sundry",
    damageDie: "",
});
function submitAddGear() {
    if (!newGearDraft.value.name.trim()) return;
    characterStore.addGearItem(newGearDraft.value);
    newGearDraft.value = {
        name: "",
        slots: 1,
        quantity: 1,
        type: "sundry",
        damageDie: "",
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
    characterStore.updateGearItem(instanceId, {
        ...editGearDraft.value,
        slots: Math.round(Math.max(0, Number(editGearDraft.value.slots) || 0)),
        quantity: Number(editGearDraft.value.quantity) || 1,
    });
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
        atk.bonus,
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
.cs-list-item {
    background: var(--paper-2, #e4d8c0);
    border: 1px solid var(--rule, #d4c4a8);
    overflow: hidden;
    transition: opacity 0.12s;
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
</style>
