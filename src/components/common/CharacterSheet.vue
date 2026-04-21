<template>
  <div class="flex flex-col h-full overflow-hidden text-stone-300">

    <template v-if="!characterStore.character">
      <div class="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center">
        <i class="fa-solid fa-scroll text-3xl text-stone-500" />
        <p class="text-sm text-stone-400">No character selected.</p>
        <p class="text-sm text-stone-500">Use the <i class="fa-solid fa-chevron-down" /> menu next to the Character button to import or select a character.</p>
      </div>
    </template>

    <template v-else>
      <div
        v-if="!canEdit"
        class="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-stone-800 border-b border-stone-700 text-sm text-stone-400"
      >
        <i class="fa-solid fa-eye" />
        Viewing — read only
      </div>

      <!-- Identity header -->
      <div class="shrink-0 px-3 pt-2 pb-1.5 border-b border-stone-700">
        <template v-if="!editingIdentity">
          <div class="flex items-start justify-between gap-1">
            <div class="min-w-0">
              <div class="font-display text-parchment-200 truncate leading-tight">{{ char.name }}</div>
              <div class="text-sm text-stone-400 truncate">
                {{ char.ancestry }} {{ char.class }} · Lvl {{ char.level }} · {{ char.title }}
              </div>
            </div>
            <button
              v-if="canEdit"
              v-tooltip.left="'Edit name, ancestry, class, level & title'"
              class="shrink-0 text-stone-500 hover:text-parchment-400 transition-colors mt-0.5"
              @click="startIdentityEdit"
            ><i class="fa-solid fa-pencil fa-xs" /></button>
          </div>
        </template>
        <template v-else>
          <div class="space-y-1.5">
            <input
              v-model="identityDraft.name"
              placeholder="Name"
              class="w-full bg-stone-700 border border-stone-600 rounded px-2 py-1 text-stone-100 text-sm focus:outline-none focus:border-parchment-400"
            />
            <div class="flex gap-1.5">
              <input
                v-model="identityDraft.ancestry"
                placeholder="Ancestry"
                class="flex-1 min-w-0 bg-stone-700 border border-stone-600 rounded px-2 py-1 text-stone-100 text-sm focus:outline-none focus:border-parchment-400"
              />
              <input
                v-model="identityDraft.class"
                placeholder="Class"
                class="flex-1 min-w-0 bg-stone-700 border border-stone-600 rounded px-2 py-1 text-stone-100 text-sm focus:outline-none focus:border-parchment-400"
              />
            </div>
            <div class="flex gap-1.5">
              <input
                v-model.number="identityDraft.level"
                type="number" min="1" max="20"
                placeholder="Lvl"
                class="w-16 bg-stone-700 border border-stone-600 rounded px-2 py-1 text-stone-100 text-sm focus:outline-none focus:border-parchment-400"
              />
              <input
                v-model="identityDraft.title"
                placeholder="Title"
                class="flex-1 min-w-0 bg-stone-700 border border-stone-600 rounded px-2 py-1 text-stone-100 text-sm focus:outline-none focus:border-parchment-400"
              />
            </div>
            <div class="flex gap-2 justify-end">
              <button class="text-sm text-parchment-400 hover:text-parchment-200 transition-colors" @click="saveIdentityEdit">Save</button>
              <button class="text-sm text-stone-400 hover:text-stone-300 transition-colors" @click="editingIdentity = false">Cancel</button>
            </div>
          </div>
        </template>
      </div>

      <div class="shrink-0 flex border-b border-stone-700 text-sm">
        <button
          v-for="t in subTabs"
          :key="t.id"
          class="flex-1 py-1.5 font-display uppercase tracking-wider transition-colors"
          :class="subTab === t.id
            ? 'text-parchment-200 border-b-2 border-parchment-400 -mb-px bg-stone-900'
            : 'text-stone-400 hover:text-stone-300 border-b-2 border-transparent -mb-px'"
          @click="subTab = t.id"
        >{{ t.label }}</button>
      </div>

      <!-- STATS TAB -->
      <div v-if="subTab === 'stats'" class="flex-1 overflow-y-auto p-3 flex flex-col gap-3">

        <!-- HP / AC / XP -->
        <div class="flex gap-2">
          <div class="flex-1 bg-stone-800 rounded p-2 flex flex-col items-center gap-1">
            <span class="text-sm text-stone-400 uppercase tracking-wider">HP</span>
            <div class="flex items-center gap-2">
              <button v-if="canEdit" v-tooltip.left="'Lose 1 HP'" class="w-6 h-6 rounded bg-stone-700 hover:bg-stone-600 text-sm flex items-center justify-center" @click="characterStore.adjustHp(-1)">−</button>
              <span class="text-xl font-bold text-parchment-200 w-10 text-center">{{ char.currentHp }}</span>
              <button v-if="canEdit" v-tooltip.right="'Heal 1 HP'" class="w-6 h-6 rounded bg-stone-700 hover:bg-stone-600 text-sm flex items-center justify-center" @click="characterStore.adjustHp(1)">+</button>
            </div>
            <template v-if="editingMaxHp && canEdit">
              <input
                v-model.number="maxHpDraft"
                type="number" min="1"
                class="w-16 text-center bg-stone-700 border border-stone-600 rounded px-1 py-0.5 text-stone-100 text-sm focus:outline-none focus:border-parchment-400"
                @keyup.enter="saveMaxHp"
                @keyup.escape="editingMaxHp = false"
                @blur="saveMaxHp"
              />
            </template>
            <button
              v-else-if="canEdit"
              v-tooltip="'Click to edit maximum HP'"
              class="text-sm text-stone-500 hover:text-parchment-400 transition-colors"
              @click="startEditMaxHp"
            >/ {{ char.maxHitPoints }}</button>
            <span v-else class="text-sm text-stone-500">/ {{ char.maxHitPoints }}</span>
          </div>

          <div class="flex-1 bg-stone-800 rounded p-2 flex flex-col items-center justify-center gap-1">
            <span class="text-sm text-stone-400 uppercase tracking-wider">AC</span>
            <template v-if="editingAC && canEdit">
              <input
                v-model.number="acDraft"
                type="number" min="0"
                class="w-14 text-center bg-stone-700 border border-stone-600 rounded px-1 py-0.5 text-parchment-200 font-bold text-xl focus:outline-none focus:border-parchment-400"
                @keyup.enter="saveAC"
                @keyup.escape="editingAC = false"
                @blur="saveAC"
              />
            </template>
            <button
              v-else-if="canEdit"
              v-tooltip="'Click to edit Armor Class'"
              class="text-xl font-bold text-parchment-200 hover:text-parchment-100 transition-colors"
              @click="startEditAC"
            >{{ char.armorClass }}</button>
            <span v-else class="text-xl font-bold text-parchment-200">{{ char.armorClass }}</span>
          </div>

          <div class="flex-1 bg-stone-800 rounded p-2 flex flex-col items-center justify-center gap-1">
            <span class="text-sm text-stone-400 uppercase tracking-wider">XP</span>
            <template v-if="editingXP && canEdit">
              <input
                v-model.number="xpDraft"
                type="number" min="0"
                class="w-16 text-center bg-stone-700 border border-stone-600 rounded px-1 py-0.5 text-parchment-200 font-bold text-xl focus:outline-none focus:border-parchment-400"
                @keyup.enter="saveXP"
                @keyup.escape="editingXP = false"
                @blur="saveXP"
              />
            </template>
            <button
              v-else-if="canEdit"
              v-tooltip="'Click to edit experience points'"
              class="text-xl font-bold text-parchment-200 hover:text-parchment-100 transition-colors"
              @click="startEditXP"
            >{{ char.XP ?? 0 }}</button>
            <span v-else class="text-xl font-bold text-parchment-200">{{ char.XP ?? 0 }}</span>
          </div>
        </div>

        <!-- Stat scores -->
        <div>
          <div v-if="canEdit" class="flex items-center justify-between mb-1.5">
            <span class="text-xs text-stone-500 uppercase tracking-wider">Ability Scores</span>
            <button
              v-tooltip.left="editingStats ? 'Done editing scores' : 'Edit ability scores'"
              class="transition-colors"
              :class="editingStats ? 'text-parchment-400' : 'text-stone-500 hover:text-parchment-400'"
              @click="editingStats = !editingStats"
            ><i class="fa-solid fa-pencil fa-xs" /></button>
          </div>
          <div class="grid grid-cols-3 gap-2">
          <div
            v-for="stat in stats"
            :key="stat.key"
            class="bg-stone-800 rounded p-2 flex flex-col items-center gap-0.5"
          >
            <span class="text-sm text-stone-400 uppercase tracking-wider">{{ stat.key }}</span>
            <div v-if="canEdit && editingStats" class="flex items-center gap-1">
              <button
                v-tooltip.left="`Decrease ${stat.key}`"
                class="w-5 h-5 rounded bg-stone-700 hover:bg-stone-600 text-xs flex items-center justify-center shrink-0"
                @click="characterStore.adjustStat(stat.key, -1)"
              >−</button>
              <span class="text-lg font-bold text-parchment-200 w-8 text-center">{{ stat.value }}</span>
              <button
                v-tooltip.right="`Increase ${stat.key}`"
                class="w-5 h-5 rounded bg-stone-700 hover:bg-stone-600 text-xs flex items-center justify-center shrink-0"
                @click="characterStore.adjustStat(stat.key, 1)"
              >+</button>
            </div>
            <button
              v-else-if="canEdit"
              v-tooltip="`Roll a ${stat.key} check (d20 ${stat.mod >= 0 ? '+' : ''}${stat.mod})`"
              class="text-lg font-bold text-parchment-200 w-8 text-center hover:text-parchment-100 transition-colors"
              @click="rollStat(stat)"
            >{{ stat.value }}</button>
            <span v-else class="text-lg font-bold text-parchment-200">{{ stat.value }}</span>
            <span class="text-sm" :class="stat.mod >= 0 ? 'text-green-400' : 'text-red-400'">
              {{ stat.mod >= 0 ? '+' : '' }}{{ stat.mod }}
            </span>
          </div>
          </div>
        </div>

        <!-- Alignment / background / deity / languages -->
        <div class="text-sm text-stone-400 bg-stone-800 rounded p-2">
          <template v-if="!editingInfo">
            <div class="flex items-start justify-between gap-1">
              <div class="space-y-0.5 min-w-0">
                <div><span class="text-stone-500">Alignment:</span> {{ char.alignment }}</div>
                <div><span class="text-stone-500">Background:</span> {{ char.background }}</div>
                <div v-if="char.deity"><span class="text-stone-500">Deity:</span> {{ char.deity }}</div>
                <div><span class="text-stone-500">Languages:</span> {{ char.languages }}</div>
              </div>
              <button
                v-if="canEdit"
                v-tooltip.left="'Edit alignment, background, deity & languages'"
                class="shrink-0 text-stone-500 hover:text-parchment-400 transition-colors"
                @click="startInfoEdit"
              ><i class="fa-solid fa-pencil fa-xs" /></button>
            </div>
          </template>
          <template v-else>
            <div class="space-y-1.5">
              <label class="flex flex-col gap-0.5">
                <span class="text-stone-500">Alignment</span>
                <input v-model="infoDraft.alignment" class="w-full bg-stone-700 border border-stone-600 rounded px-2 py-1 text-stone-100 text-sm focus:outline-none focus:border-parchment-400" />
              </label>
              <label class="flex flex-col gap-0.5">
                <span class="text-stone-500">Background</span>
                <input v-model="infoDraft.background" class="w-full bg-stone-700 border border-stone-600 rounded px-2 py-1 text-stone-100 text-sm focus:outline-none focus:border-parchment-400" />
              </label>
              <label class="flex flex-col gap-0.5">
                <span class="text-stone-500">Deity</span>
                <input v-model="infoDraft.deity" placeholder="(optional)" class="w-full bg-stone-700 border border-stone-600 rounded px-2 py-1 text-stone-100 text-sm focus:outline-none focus:border-parchment-400" />
              </label>
              <label class="flex flex-col gap-0.5">
                <span class="text-stone-500">Languages</span>
                <input v-model="infoDraft.languages" class="w-full bg-stone-700 border border-stone-600 rounded px-2 py-1 text-stone-100 text-sm focus:outline-none focus:border-parchment-400" />
              </label>
              <div class="flex gap-2 justify-end">
                <button class="text-sm text-parchment-400 hover:text-parchment-200 transition-colors" @click="saveInfoEdit">Save</button>
                <button class="text-sm text-stone-400 hover:text-stone-300 transition-colors" @click="editingInfo = false">Cancel</button>
              </div>
            </div>
          </template>
        </div>
      </div>

      <!-- COMBAT TAB -->
      <div v-else-if="subTab === 'combat'" class="flex-1 overflow-y-auto p-3 flex flex-col gap-3">
        <div>
          <div class="text-sm text-stone-400 uppercase tracking-wider mb-1.5">Attacks</div>
          <div class="flex flex-col gap-1.5">
            <div
              v-for="atk in parsedAttacks"
              :key="atk.idx"
              class="bg-stone-800 rounded overflow-hidden transition-opacity"
              :class="atk.disabled ? 'opacity-40' : ''"
            >
              <template v-if="editingAtkIdx !== atk.idx">
                <div class="flex items-stretch group">
                  <button
                    class="flex-1 text-left p-2 hover:bg-stone-700 transition-colors disabled:cursor-default disabled:hover:bg-transparent"
                    :disabled="atk.disabled || !canEdit"
                    @click="rollAttack(atk)"
                  >
                    <div class="text-sm font-bold truncate" :class="atk.disabled ? 'line-through text-stone-400' : 'text-parchment-200'">{{ atk.label }}</div>
                    <div class="text-sm text-stone-400 text-wrap">{{ atk.raw.split(':').slice(1).join(':').trim() }}</div>
                  </button>
                  <button
                    v-if="atk.damageDie && !atk.disabled && canEdit"
                    class="flex flex-col items-center justify-center px-2 shrink-0 border-l border-stone-700 hover:bg-stone-700 transition-colors gap-0.5"
                    :title="`Roll damage (${atk.damageDie})`"
                    @click="rollDamage(atk)"
                  >
                    <i class="fa-solid fa-dice text-red-400 text-sm" />
                    <span class="text-red-400 font-mono leading-none" style="font-size:9px">{{ atk.damageDie }}</span>
                  </button>
                  <div v-if="canEdit" class="flex flex-col justify-center gap-1 px-1.5 shrink-0 border-l border-stone-700 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      class="text-stone-400 hover:text-stone-300 transition-colors"
                      :title="atk.disabled ? 'Enable' : 'Disable'"
                      @click="characterStore.updateAttack(atk.idx, { disabled: !atk.disabled })"
                    ><i :class="atk.disabled ? 'fa-solid fa-eye fa-xs' : 'fa-solid fa-eye-slash fa-xs'" /></button>
                    <button class="text-stone-400 hover:text-stone-300 transition-colors" title="Edit" @click="startAtkEdit(atk)">
                      <i class="fa-solid fa-pencil fa-xs" />
                    </button>
                    <button class="text-stone-400 hover:text-red-400 transition-colors" title="Delete" @click="confirm('Delete this attack?', () => characterStore.deleteAttack(atk.idx))">
                      <i class="fa-solid fa-trash fa-xs" />
                    </button>
                  </div>
                </div>
              </template>
              <template v-else>
                <div class="p-2 space-y-1.5">
                  <input
                    v-model="editAtkDraft.raw"
                    class="w-full bg-stone-700 border border-stone-600 rounded px-2 py-1 text-stone-100 text-sm focus:outline-none focus:border-parchment-400"
                    placeholder="Name: +bonus to hit…"
                    @keyup.enter="saveAtkEdit(atk.idx)"
                    @keyup.escape="editingAtkIdx = null"
                  />
                  <input
                    v-model="editAtkDraft.damageDie"
                    class="w-full bg-stone-700 border border-stone-600 rounded px-2 py-1 text-stone-100 text-sm focus:outline-none focus:border-parchment-400"
                    placeholder="Damage die, e.g. 1d8+2 (optional)"
                    @keyup.enter="saveAtkEdit(atk.idx)"
                    @keyup.escape="editingAtkIdx = null"
                  />
                  <div class="flex gap-2 justify-end">
                    <button class="text-sm text-parchment-400 hover:text-parchment-200 transition-colors" @click="saveAtkEdit(atk.idx)">Save</button>
                    <button class="text-sm text-stone-400 hover:text-stone-300 transition-colors" @click="editingAtkIdx = null">Cancel</button>
                  </div>
                </div>
              </template>
            </div>
          </div>
        </div>

        <!-- Talents -->
        <div>
          <div class="text-sm text-stone-400 uppercase tracking-wider mb-1.5">Talents</div>
          <div v-if="char.bonuses?.length" class="flex flex-col gap-1 mb-1.5">
            <div
              v-for="(b, i) in char.bonuses"
              :key="i"
              class="bg-stone-800 rounded p-2 text-sm flex items-start justify-between gap-2 group"
            >
              <div class="min-w-0">
                <span class="text-parchment-300">{{ b.bonusName }}</span>
                <span class="text-stone-500 ml-1">· {{ b.sourceCategory }} ({{ b.sourceName }})</span>
              </div>
              <button
                v-if="canEdit"
                class="shrink-0 text-stone-600 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                title="Remove talent"
                @click="confirm('Remove this talent?', () => removeTalent(i))"
              ><i class="fa-solid fa-trash fa-xs" /></button>
            </div>
          </div>
          <div v-if="showAddTalent && canEdit" class="bg-stone-800 rounded p-2 space-y-1.5 mb-1.5">
            <input
              v-model="newTalentDraft"
              placeholder="Talent name"
              class="w-full bg-stone-700 border border-stone-600 rounded px-2 py-1 text-stone-100 text-sm focus:outline-none focus:border-parchment-400"
              @keyup.enter="submitAddTalent"
              @keyup.escape="showAddTalent = false"
            />
            <div class="flex gap-2 justify-end">
              <button class="text-sm text-parchment-400 hover:text-parchment-200 transition-colors" @click="submitAddTalent">Add</button>
              <button class="text-sm text-stone-400 hover:text-stone-300 transition-colors" @click="showAddTalent = false">Cancel</button>
            </div>
          </div>
          <button
            v-if="canEdit && !showAddTalent"
            class="w-full py-1.5 text-sm rounded bg-stone-700 hover:bg-stone-600 text-stone-300 hover:text-stone-100 transition-colors"
            @click="showAddTalent = true"
          >+ Add Talent</button>
        </div>

        <!-- Spells -->
        <div>
          <div class="text-sm text-stone-400 uppercase tracking-wider mb-1.5">Spells</div>
          <template v-if="editingSpells && canEdit">
            <div class="space-y-1.5">
              <textarea
                v-model="spellsDraft"
                rows="4"
                placeholder="Spells known…"
                class="w-full bg-stone-800 border border-stone-600 rounded px-2 py-1.5 text-stone-300 text-sm focus:outline-none focus:border-parchment-400 resize-none"
              />
              <div class="flex gap-2 justify-end">
                <button class="text-sm text-parchment-400 hover:text-parchment-200 transition-colors" @click="saveSpells">Save</button>
                <button class="text-sm text-stone-400 hover:text-stone-300 transition-colors" @click="editingSpells = false">Cancel</button>
              </div>
            </div>
          </template>
          <template v-else>
            <div class="flex items-start justify-between gap-2 bg-stone-800 rounded p-2">
              <span class="text-sm text-stone-300 flex-1">{{ char.spellsKnown && char.spellsKnown !== 'None' ? char.spellsKnown : '—' }}</span>
              <button
                v-if="canEdit"
                v-tooltip.left="'Edit known spells'"
                class="shrink-0 text-stone-500 hover:text-parchment-400 transition-colors"
                @click="startEditSpells"
              ><i class="fa-solid fa-pencil fa-xs" /></button>
            </div>
          </template>
        </div>
      </div>

      <!-- GEAR TAB -->
      <div v-else-if="subTab === 'gear'" class="flex-1 overflow-y-auto p-3 flex flex-col gap-3">
        <div>
          <div class="flex justify-between text-sm text-stone-400 mb-1">
            <span class="uppercase tracking-wider">Gear Slots</span>
            <div class="flex items-center gap-1">
              <button v-if="canEdit" v-tooltip.left="'Reduce gear slot maximum'" class="w-4 h-4 rounded bg-stone-700 hover:bg-stone-600 text-xs flex items-center justify-center" @click="characterStore.updateField('gearSlotsTotal', Math.max(0, (char.gearSlotsTotal ?? 0) - 1))">−</button>
              <span v-tooltip="'Slots used / slots available'">{{ effectiveGearSlotsUsed }} / {{ char.gearSlotsTotal }}</span>
              <button v-if="canEdit" v-tooltip.right="'Increase gear slot maximum'" class="w-4 h-4 rounded bg-stone-700 hover:bg-stone-600 text-xs flex items-center justify-center" @click="characterStore.updateField('gearSlotsTotal', (char.gearSlotsTotal ?? 0) + 1)">+</button>
            </div>
          </div>
          <div class="w-full bg-stone-700 rounded-full h-2 overflow-hidden">
            <div
              class="h-2 rounded-full transition-all"
              :class="slotRatio > 0.9 ? 'bg-red-500' : slotRatio > 0.7 ? 'bg-amber-500' : 'bg-green-600'"
              :style="{ width: `${Math.min(100, slotRatio * 100)}%` }"
            />
          </div>
          <button
            v-if="canEdit"
            class="mt-2 w-full py-1.5 text-sm rounded bg-stone-700 hover:bg-stone-600 text-stone-300 hover:text-stone-100 transition-colors"
            @click="showAddGear = !showAddGear"
          >+ Add Gear</button>
        </div>

        <div v-if="showAddGear && canEdit" class="bg-stone-800 rounded p-2 space-y-1.5">
          <input
            v-model="newGearDraft.name"
            class="w-full bg-stone-700 border border-stone-600 rounded px-2 py-1 text-stone-100 text-sm focus:outline-none focus:border-parchment-400"
            placeholder="Item name"
            @keyup.enter="submitAddGear"
          />
          <div class="flex gap-2">
            <label class="flex-1 flex flex-col gap-0.5">
              <span class="text-stone-400 text-sm">Slots</span>
              <input v-model.number="newGearDraft.slots" type="number" min="0" class="w-full bg-stone-700 border border-stone-600 rounded px-2 py-1 text-stone-100 text-sm focus:outline-none focus:border-parchment-400" />
            </label>
            <label class="flex-1 flex flex-col gap-0.5">
              <span class="text-stone-400 text-sm">Qty</span>
              <input v-model.number="newGearDraft.quantity" type="number" min="1" class="w-full bg-stone-700 border border-stone-600 rounded px-2 py-1 text-stone-100 text-sm focus:outline-none focus:border-parchment-400" />
            </label>
            <label class="flex-1 flex flex-col gap-0.5">
              <span class="text-stone-400 text-sm">Type</span>
              <select v-model="newGearDraft.type" class="w-full bg-stone-700 border border-stone-600 rounded px-2 py-1 text-stone-100 text-sm focus:outline-none focus:border-parchment-400">
                <option value="weapon">Weapon</option>
                <option value="armor">Armor</option>
                <option value="sundry">Sundry</option>
              </select>
            </label>
          </div>
          <label v-if="newGearDraft.type === 'weapon'" class="flex flex-col gap-0.5">
            <span class="text-stone-400 text-sm">Damage die</span>
            <input
              v-model="newGearDraft.damageDie"
              class="w-full bg-stone-700 border border-stone-600 rounded px-2 py-1 text-stone-100 text-sm focus:outline-none focus:border-parchment-400"
              placeholder="e.g. 1d8, 2d6+2 (optional)"
            />
          </label>
          <div class="flex gap-2 justify-end">
            <button class="text-sm text-parchment-400 hover:text-parchment-200 transition-colors" @click="submitAddGear">Add</button>
            <button class="text-sm text-stone-400 hover:text-stone-300 transition-colors" @click="showAddGear = false">Cancel</button>
          </div>
        </div>

        <div class="flex flex-col gap-1.5">
          <div
            v-for="item in sortedGear"
            :key="item.instanceId"
            class="bg-stone-800 rounded overflow-hidden transition-opacity"
            :class="item.disabled ? 'opacity-40' : ''"
          >
            <template v-if="editingGearId !== item.instanceId">
              <div class="flex items-start gap-2 p-2 group">
                <div class="flex-1 min-w-0">
                  <div class="text-sm text-parchment-200 truncate" :class="item.disabled ? 'line-through text-stone-400' : ''">{{ item.name }}</div>
                  <div class="text-sm text-stone-400">
                    {{ item.slots }} slot{{ item.slots !== 1 ? 's' : '' }}
                    <span v-if="item.quantity > 1"> · ×{{ item.quantity }}</span>
                  </div>
                </div>
                <span
                  class="shrink-0 text-sm px-1.5 py-0.5 rounded"
                  :class="{
                    'bg-red-900/50 text-red-300': item.type === 'weapon',
                    'bg-blue-900/50 text-blue-300': item.type === 'armor',
                    'bg-stone-700 text-stone-400': item.type === 'sundry',
                  }"
                >{{ item.type }}</span>
                <div v-if="canEdit" class="flex gap-1.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    class="text-stone-400 hover:text-stone-300 transition-colors"
                    :title="item.disabled ? 'Enable' : 'Disable'"
                    @click="characterStore.updateGearItem(item.instanceId, { disabled: !item.disabled })"
                  ><i :class="item.disabled ? 'fa-solid fa-eye fa-xs' : 'fa-solid fa-eye-slash fa-xs'" /></button>
                  <button class="text-stone-400 hover:text-stone-300 transition-colors" title="Edit" @click="startGearEdit(item)">
                    <i class="fa-solid fa-pencil fa-xs" />
                  </button>
                  <button class="text-stone-400 hover:text-red-400 transition-colors" title="Delete" @click="confirm('Delete this item?', () => characterStore.deleteGearItem(item.instanceId))">
                    <i class="fa-solid fa-trash fa-xs" />
                  </button>
                </div>
              </div>
            </template>
            <template v-else>
              <div class="p-2 space-y-1.5">
                <input
                  v-model="editGearDraft.name"
                  class="w-full bg-stone-700 border border-stone-600 rounded px-2 py-1 text-stone-100 text-sm focus:outline-none focus:border-parchment-400"
                  placeholder="Item name"
                />
                <div class="flex gap-2">
                  <label class="flex-1 flex flex-col gap-0.5">
                    <span class="text-stone-400 text-sm">Slots</span>
                    <input v-model.number="editGearDraft.slots" type="number" min="0" class="w-full bg-stone-700 border border-stone-600 rounded px-2 py-1 text-stone-100 text-sm focus:outline-none focus:border-parchment-400" />
                  </label>
                  <label class="flex-1 flex flex-col gap-0.5">
                    <span class="text-stone-400 text-sm">Qty</span>
                    <input v-model.number="editGearDraft.quantity" type="number" min="1" class="w-full bg-stone-700 border border-stone-600 rounded px-2 py-1 text-stone-100 text-sm focus:outline-none focus:border-parchment-400" />
                  </label>
                  <label class="flex-1 flex flex-col gap-0.5">
                    <span class="text-stone-400 text-sm">Type</span>
                    <select v-model="editGearDraft.type" class="w-full bg-stone-700 border border-stone-600 rounded px-2 py-1 text-stone-100 text-sm focus:outline-none focus:border-parchment-400">
                      <option value="weapon">Weapon</option>
                      <option value="armor">Armor</option>
                      <option value="sundry">Sundry</option>
                    </select>
                  </label>
                </div>
                <div class="flex gap-2 justify-end">
                  <button class="text-sm text-parchment-400 hover:text-parchment-200 transition-colors" @click="saveGearEdit(item.instanceId)">Save</button>
                  <button class="text-sm text-stone-400 hover:text-stone-300 transition-colors" @click="editingGearId = null">Cancel</button>
                </div>
              </div>
            </template>
          </div>

          <!-- Treasures -->
          <div v-if="char.treasures?.length || canEdit">
            <div class="text-sm text-stone-400 uppercase tracking-wider mt-1 mb-1">Treasures</div>
            <div class="flex flex-col gap-1">
              <div
                v-for="(t, i) in char.treasures ?? []"
                :key="i"
                class="bg-stone-800 rounded p-2 text-sm text-parchment-200 flex items-center justify-between group"
              >
                <span>{{ t }}</span>
                <button
                  v-if="canEdit"
                  class="text-stone-600 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 shrink-0 ml-2"
                  @click="confirm('Remove this treasure?', () => removeTreasure(i))"
                ><i class="fa-solid fa-trash fa-xs" /></button>
              </div>
            </div>
            <div v-if="showAddTreasure && canEdit" class="mt-1 flex gap-1.5">
              <input
                v-model="newTreasureDraft"
                placeholder="Treasure description"
                class="flex-1 min-w-0 bg-stone-700 border border-stone-600 rounded px-2 py-1 text-stone-100 text-sm focus:outline-none focus:border-parchment-400"
                @keyup.enter="submitAddTreasure"
                @keyup.escape="showAddTreasure = false"
              />
              <button class="text-sm text-parchment-400 hover:text-parchment-200 transition-colors shrink-0" @click="submitAddTreasure">Add</button>
              <button class="text-sm text-stone-400 hover:text-stone-300 transition-colors shrink-0" @click="showAddTreasure = false">✕</button>
            </div>
            <button
              v-if="canEdit && !showAddTreasure"
              class="mt-1 w-full py-1 text-sm rounded bg-stone-700 hover:bg-stone-600 text-stone-300 hover:text-stone-100 transition-colors"
              @click="showAddTreasure = true"
            >+ Add Treasure</button>
          </div>

          <!-- Magic items -->
          <div v-if="char.magicItems?.length || canEdit">
            <div class="text-sm text-stone-400 uppercase tracking-wider mt-1 mb-1">Magic Items</div>
            <div class="flex flex-col gap-1">
              <div
                v-for="(m, i) in char.magicItems ?? []"
                :key="i"
                class="bg-stone-800 rounded p-2 text-sm text-parchment-200 flex items-center justify-between group"
              >
                <span>{{ m }}</span>
                <button
                  v-if="canEdit"
                  class="text-stone-600 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 shrink-0 ml-2"
                  @click="confirm('Remove this magic item?', () => removeMagicItem(i))"
                ><i class="fa-solid fa-trash fa-xs" /></button>
              </div>
            </div>
            <div v-if="showAddMagicItem && canEdit" class="mt-1 flex gap-1.5">
              <input
                v-model="newMagicItemDraft"
                placeholder="Magic item name"
                class="flex-1 min-w-0 bg-stone-700 border border-stone-600 rounded px-2 py-1 text-stone-100 text-sm focus:outline-none focus:border-parchment-400"
                @keyup.enter="submitAddMagicItem"
                @keyup.escape="showAddMagicItem = false"
              />
              <button class="text-sm text-parchment-400 hover:text-parchment-200 transition-colors shrink-0" @click="submitAddMagicItem">Add</button>
              <button class="text-sm text-stone-400 hover:text-stone-300 transition-colors shrink-0" @click="showAddMagicItem = false">✕</button>
            </div>
            <button
              v-if="canEdit && !showAddMagicItem"
              class="mt-1 w-full py-1 text-sm rounded bg-stone-700 hover:bg-stone-600 text-stone-300 hover:text-stone-100 transition-colors"
              @click="showAddMagicItem = true"
            >+ Add Magic Item</button>
          </div>
        </div>
      </div>

      <!-- MONEY TAB -->
      <div v-else-if="subTab === 'money'" class="flex-1 overflow-y-auto p-3 flex flex-col gap-3">
        <div class="flex flex-col gap-2">
          <div
            v-for="coin in coins"
            :key="coin.key"
            class="bg-stone-800 rounded p-2 flex items-center gap-3"
          >
            <div class="w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold shrink-0" :class="coin.bg">
              {{ coin.symbol }}
            </div>
            <div class="flex-1">
              <div class="text-sm text-stone-400">{{ coin.label }}</div>
              <div class="text-lg font-bold text-parchment-200">{{ char[coin.key] ?? 0 }}</div>
            </div>
            <div v-if="canEdit" class="flex gap-1">
              <button v-tooltip.left="`Spend 1 ${coin.label.toLowerCase()}`" class="w-7 h-7 rounded bg-stone-700 hover:bg-stone-600 text-sm flex items-center justify-center" @click="characterStore.adjustMoney(coin.key, -1)">−</button>
              <button v-tooltip.right="`Gain 1 ${coin.label.toLowerCase()}`" class="w-7 h-7 rounded bg-stone-700 hover:bg-stone-600 text-sm flex items-center justify-center" @click="characterStore.adjustMoney(coin.key, 1)">+</button>
            </div>
          </div>
        </div>

        <div v-if="char.ledger?.length">
          <div class="text-sm text-stone-400 uppercase tracking-wider mb-1.5">Ledger</div>
          <div class="flex flex-col gap-1">
            <div
              v-for="(entry, i) in char.ledger"
              :key="i"
              class="bg-stone-800 rounded px-2 py-1.5 flex items-center gap-2 text-sm"
            >
              <span class="flex-1 text-stone-400 truncate">{{ entry.desc }}</span>
              <span v-if="entry.goldChange" :class="entry.goldChange > 0 ? 'text-amber-400' : 'text-red-400'">
                {{ entry.goldChange > 0 ? '+' : '' }}{{ entry.goldChange }}gp
              </span>
              <span v-if="entry.silverChange" :class="entry.silverChange > 0 ? 'text-slate-300' : 'text-red-400'">
                {{ entry.silverChange > 0 ? '+' : '' }}{{ entry.silverChange }}sp
              </span>
              <span v-if="entry.copperChange" :class="entry.copperChange > 0 ? 'text-orange-400' : 'text-red-400'">
                {{ entry.copperChange > 0 ? '+' : '' }}{{ entry.copperChange }}cp
              </span>
            </div>
          </div>
        </div>
      </div>

    </template>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useCharacterStore, statMod, parseAttack, parseDamageDie } from '@/stores/characterStore.js'
import { useDiceStore } from '@/stores/diceStore.js'
import { useConfirmDialog } from '@/composables/useConfirmDialog.js'

const characterStore = useCharacterStore()
const diceStore = useDiceStore()
const { confirm } = useConfirmDialog()

const canEdit = computed(() => characterStore.canEditActiveCharacter)
const char = computed(() => characterStore.character)

const subTab = ref('stats')
const subTabs = [
  { id: 'stats',  label: 'Stats'  },
  { id: 'combat', label: 'Combat' },
  { id: 'gear',   label: 'Gear'   },
  { id: 'money',  label: 'Money'  },
]

const coins = [
  { key: 'gold',   label: 'Gold Pieces',   symbol: 'GP', bg: 'bg-amber-700 text-amber-200'  },
  { key: 'silver', label: 'Silver Pieces', symbol: 'SP', bg: 'bg-slate-600 text-slate-200'  },
  { key: 'copper', label: 'Copper Pieces', symbol: 'CP', bg: 'bg-orange-800 text-orange-200' },
]

const stats = computed(() => {
  if (!char.value?.stats) return []
  return ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'].map(key => ({
    key,
    label: key,
    value: char.value.stats[key],
    mod: statMod(char.value.stats[key]),
  }))
})

const parsedAttacks = computed(() => {
  if (!char.value?.attacks) return []
  return char.value.attacks.map((a, idx) => {
    const raw      = typeof a === 'string' ? a : (a.raw ?? '')
    const disabled = typeof a === 'object' ? (a.disabled ?? false) : false
    const damageDie = typeof a === 'object' ? (a.damageDie ?? null) : null
    return { ...parseAttack(raw), idx, disabled, damageDie }
  })
})

const effectiveGearSlotsUsed = computed(() => {
  if (!char.value?.gear) return char.value?.gearSlotsUsed ?? 0
  return char.value.gear
    .filter(item => !item.disabled)
    .reduce((sum, item) => sum + (item.slots ?? 0) * (item.quantity ?? 1), 0)
})

const GEAR_TYPE_ORDER = { weapon: 0, armor: 1, sundry: 2 }
const sortedGear = computed(() => {
  if (!char.value?.gear) return []
  return [...char.value.gear].sort((a, b) =>
    (GEAR_TYPE_ORDER[a.type] ?? 2) - (GEAR_TYPE_ORDER[b.type] ?? 2)
  )
})

const slotRatio = computed(() => {
  if (!char.value) return 0
  return effectiveGearSlotsUsed.value / (char.value.gearSlotsTotal || 1)
})

// --- Stat score edit mode ---
const editingStats = ref(false)

// --- Identity edit ---
const editingIdentity = ref(false)
const identityDraft = ref({})

function startIdentityEdit() {
  identityDraft.value = {
    name:     char.value.name ?? '',
    ancestry: char.value.ancestry ?? '',
    class:    char.value.class ?? '',
    level:    char.value.level ?? 1,
    title:    char.value.title ?? '',
  }
  editingIdentity.value = true
}

function saveIdentityEdit() {
  for (const [field, val] of Object.entries(identityDraft.value)) {
    characterStore.updateField(field, val)
  }
  editingIdentity.value = false
}

// --- Info edit (alignment / background / deity / languages) ---
const editingInfo = ref(false)
const infoDraft = ref({})

function startInfoEdit() {
  infoDraft.value = {
    alignment: char.value.alignment ?? '',
    background: char.value.background ?? '',
    deity:     char.value.deity ?? '',
    languages: char.value.languages ?? '',
  }
  editingInfo.value = true
}

function saveInfoEdit() {
  for (const [field, val] of Object.entries(infoDraft.value)) {
    characterStore.updateField(field, val)
  }
  editingInfo.value = false
}

// --- Max HP / AC / XP click-to-edit ---
const editingMaxHp = ref(false)
const maxHpDraft   = ref(0)
const editingAC    = ref(false)
const acDraft      = ref(0)
const editingXP    = ref(false)
const xpDraft      = ref(0)

function startEditMaxHp() { maxHpDraft.value = char.value.maxHitPoints ?? 0; editingMaxHp.value = true }
function saveMaxHp() {
  const v = Number(maxHpDraft.value) || 1
  characterStore.updateField('maxHitPoints', v)
  if ((char.value.currentHp ?? 0) > v) characterStore.updateField('currentHp', v)
  editingMaxHp.value = false
}

function startEditAC() { acDraft.value = char.value.armorClass ?? 0; editingAC.value = true }
function saveAC() { characterStore.updateField('armorClass', Number(acDraft.value) || 0); editingAC.value = false }

function startEditXP() { xpDraft.value = char.value.XP ?? 0; editingXP.value = true }
function saveXP() { characterStore.updateField('XP', Number(xpDraft.value) || 0); editingXP.value = false }

// --- Attacks ---
const editingAtkIdx = ref(null)
const editAtkDraft  = ref({ raw: '', damageDie: '' })

function startAtkEdit(atk) {
  editingAtkIdx.value = atk.idx
  editAtkDraft.value  = { raw: atk.raw, damageDie: atk.damageDie ?? '' }
}

function saveAtkEdit(idx) {
  characterStore.updateAttack(idx, {
    raw:      editAtkDraft.value.raw.trim(),
    damageDie: editAtkDraft.value.damageDie.trim() || null,
  })
  editingAtkIdx.value = null
}

// --- Talents ---
const showAddTalent  = ref(false)
const newTalentDraft = ref('')

function submitAddTalent() {
  const name = newTalentDraft.value.trim()
  if (!name) return
  const existing = char.value.bonuses ?? []
  characterStore.updateField('bonuses', [
    ...existing,
    { bonusName: name, sourceName: 'Manual', sourceCategory: 'Manual', gainedAtLevel: char.value.level ?? 1 },
  ])
  newTalentDraft.value = ''
  showAddTalent.value = false
}

function removeTalent(idx) {
  characterStore.updateField('bonuses', (char.value.bonuses ?? []).filter((_, i) => i !== idx))
}

// --- Spells ---
const editingSpells = ref(false)
const spellsDraft   = ref('')

function startEditSpells() { spellsDraft.value = char.value.spellsKnown ?? ''; editingSpells.value = true }
function saveSpells() { characterStore.updateField('spellsKnown', spellsDraft.value.trim() || 'None'); editingSpells.value = false }

// --- Gear ---
const showAddGear  = ref(false)
const newGearDraft = ref({ name: '', slots: 1, quantity: 1, type: 'sundry', damageDie: '' })

function submitAddGear() {
  if (!newGearDraft.value.name.trim()) return
  characterStore.addGearItem(newGearDraft.value)
  newGearDraft.value = { name: '', slots: 1, quantity: 1, type: 'sundry', damageDie: '' }
  showAddGear.value = false
}

const editingGearId = ref(null)
const editGearDraft = ref({})

function startGearEdit(item) {
  editingGearId.value = item.instanceId
  editGearDraft.value = { name: item.name, slots: item.slots, quantity: item.quantity, type: item.type }
}

function saveGearEdit(instanceId) {
  characterStore.updateGearItem(instanceId, {
    ...editGearDraft.value,
    slots: Number(editGearDraft.value.slots) || 0,
    quantity: Number(editGearDraft.value.quantity) || 1,
  })
  editingGearId.value = null
}

// --- Treasures ---
const showAddTreasure  = ref(false)
const newTreasureDraft = ref('')

function submitAddTreasure() {
  const text = newTreasureDraft.value.trim()
  if (!text) return
  characterStore.updateField('treasures', [...(char.value.treasures ?? []), text])
  newTreasureDraft.value = ''
  showAddTreasure.value = false
}

function removeTreasure(idx) {
  characterStore.updateField('treasures', (char.value.treasures ?? []).filter((_, i) => i !== idx))
}

// --- Magic items ---
const showAddMagicItem  = ref(false)
const newMagicItemDraft = ref('')

function submitAddMagicItem() {
  const text = newMagicItemDraft.value.trim()
  if (!text) return
  characterStore.updateField('magicItems', [...(char.value.magicItems ?? []), text])
  newMagicItemDraft.value = ''
  showAddMagicItem.value = false
}

function removeMagicItem(idx) {
  characterStore.updateField('magicItems', (char.value.magicItems ?? []).filter((_, i) => i !== idx))
}

// --- Dice rolls ---
const STAT_NAMES = { STR: 'Strength', DEX: 'Dexterity', CON: 'Constitution', INT: 'Intelligence', WIS: 'Wisdom', CHA: 'Charisma' }

function rollStat(stat) {
  diceStore.rollDice({ d20: 1 }, stat.mod, `${STAT_NAMES[stat.key] ?? stat.key} check`, characterStore.activeId)
}

function rollAttack(atk) {
  diceStore.rollDice({ d20: 1 }, atk.bonus, atk.label, characterStore.activeId)
}

function rollDamage(atk) {
  const parsed = parseDamageDie(atk.damageDie)
  if (!parsed) return
  diceStore.rollDice(
    { [`d${parsed.sides}`]: parsed.count },
    parsed.modifier,
    `${atk.label} damage`,
    characterStore.activeId,
  )
}
</script>
