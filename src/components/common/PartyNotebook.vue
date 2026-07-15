<template>
  <div
    v-if="visible"
    class="pn-panel"
    :style="{ left: pos.x + 'px', top: pos.y + 'px', width: size.w + 'px', height: size.h + 'px' }"
  >
    <div class="pn-head" @mousedown="startDrag">
      <div class="ds-grip">
        <span v-for="i in 6" :key="i" />
      </div>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" style="color:var(--paper-3);flex:0 0 auto">
        <path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z"/>
        <path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z"/>
      </svg>
      <h4>The Party Notebook</h4>
      <button class="ds-panel-action" @click.stop="close()">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
          <path d="M18 6L6 18M6 6l12 12"/>
        </svg>
      </button>
    </div>

    <div class="pn-tabs">
      <button class="pn-tab" :class="{ active: activeTab === 'quests' }" data-testid="notebook-tab-quests" @click="activeTab = 'quests'">
        Quests<span v-if="activeQuestCount" class="pn-badge">{{ activeQuestCount }}</span>
      </button>
      <button class="pn-tab" :class="{ active: activeTab === 'notes' }" data-testid="notebook-tab-notes" @click="activeTab = 'notes'">
        Notes<span v-if="notebookStore.notes.length" class="pn-badge">{{ notebookStore.notes.length }}</span>
      </button>
      <button class="pn-tab" :class="{ active: activeTab === 'vault' }" data-testid="notebook-tab-vault" @click="activeTab = 'vault'">
        Vault<span v-if="vaultStore.loot.length" class="pn-badge">{{ vaultStore.loot.length }}</span>
      </button>
      <button class="pn-tab" :class="{ active: activeTab === 'calendar' }" data-testid="notebook-tab-calendar" @click="activeTab = 'calendar'">
        Calendar
      </button>
      <button v-if="isSoloOrCoop" class="pn-tab" :class="{ active: activeTab === 'journal' }" data-testid="notebook-tab-journal" @click="activeTab = 'journal'">
        Journal
      </button>
    </div>

    <div class="pn-body">


      <template v-if="activeTab === 'quests'">
        <div class="pn-section-bar">
          <span class="pn-count">Active {{ activeQuestCount }}</span>
          <button class="pn-add-btn" data-testid="quest-new" @click="newQuest">+ New Quest</button>
        </div>
        <div v-if="!activeQuests.length" class="pn-empty">No active quests</div>
        <div v-for="quest in activeQuests" :key="quest.id" class="pn-quest-card" data-testid="quest-card">
          <div class="pn-quest-title-row">
            <input
              class="pn-quest-title"
              data-testid="quest-title"
              :value="quest.title"
              placeholder="Quest title…"
              @focus="onItemFocus('quest', quest.id)"
              @blur="onItemBlur('quest', quest.id)"
              @input="debounceSaveQuest(quest.id, { title: $event.target.value })"
            />
          </div>
          <div v-if="editorsFor('quest', quest.id).length" class="pn-editing-indicator">
            <span class="pn-editing-dot" />
            {{ editorsFor('quest', quest.id).join(', ') }} {{ editorsFor('quest', quest.id).length === 1 ? 'is' : 'are' }} editing…
          </div>
          <div v-if="quest.goals?.length" class="pn-progress-row">
            <div class="pn-progress-bar">
              <div class="pn-progress-fill" :style="{ width: goalPct(quest) + '%' }"></div>
            </div>
            <span class="pn-progress-label">{{ completedGoals(quest) }}/{{ quest.goals.length }} goals</span>
          </div>
          <div class="pn-quest-meta">
            <span class="pn-quest-author">{{ quest.added_by_name }}</span>
            <span v-if="quest.is_gm_added" class="pn-gm-badge">Added by Game Master</span>
          </div>
          <textarea
            class="pn-quest-desc"
            :value="quest.description"
            placeholder="Quest description…"
            rows="2"
            @focus="onItemFocus('quest', quest.id)"
            @blur="onItemBlur('quest', quest.id)"
            @input="debounceSaveQuest(quest.id, { description: $event.target.value })"
          />
          <div class="pn-goals-section">
            <div class="pn-goals-label">Goals</div>
            <div v-for="goal in (quest.goals ?? [])" :key="goal.id" class="pn-goal-row">
              <button class="pn-goal-check" :class="{ checked: goal.completed }" @click="toggleGoal(quest, goal.id)">
                <svg v-if="goal.completed" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              </button>
              <input
                class="pn-goal-text"
                :class="{ done: goal.completed }"
                :value="goal.text"
                placeholder="Goal…"
                @focus="onItemFocus('quest', quest.id)"
                @blur="onItemBlur('quest', quest.id)"
                @input="updateGoalText(quest, goal.id, $event.target.value)"
              />
              <button class="pn-goal-del" @click="removeGoal(quest, goal.id)">
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                  <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
              </button>
            </div>
            <button class="pn-add-goal" @click="addGoal(quest)">+ Add a goal…</button>
          </div>
          <div class="pn-reward-section">
            <div class="pn-reward-label">Rewards</div>
            <div v-if="(quest.rewards ?? []).length" class="pn-reward-list">
              <div v-for="r in (quest.rewards ?? [])" :key="r.id" class="pn-reward-item">
                <span class="pn-reward-chip" :class="{ 'pn-reward-chip--coins': r.type === 'coins' }">
                  <template v-if="r.type === 'coins'">{{ r.qty }} {{ r.currency }}</template>
                  <template v-else>{{ r.qty > 1 ? '×' + r.qty + '\u2009' : '' }}{{ r.name }}</template>
                </span>
                <button class="pn-reward-remove" @click="removeReward(quest.id, r.id)">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
                  </svg>
                </button>
              </div>
            </div>
            <template v-if="addRewardQuestId === quest.id">
              <div v-if="!newRewardType" class="pn-reward-type-picker">
                <button class="pn-reward-type-opt" @click="newRewardType = 'coins'">Coins</button>
                <button class="pn-reward-type-opt" @click="newRewardType = 'item'">Item</button>
                <button class="pn-reward-cancel" @click="cancelAddReward">✕</button>
              </div>
              <div v-else class="pn-reward-add-form">
                <select v-if="newRewardType === 'coins'" v-model="newRewardCurrency" class="pn-reward-select">
                  <option value="gold">Gold</option>
                  <option value="silver">Silver</option>
                  <option value="copper">Copper</option>
                </select>
                <input
                  v-else
                  v-model="newRewardName"
                  class="pn-reward-name-input"
                  placeholder="Item name…"
                  @keydown.enter="submitReward(quest.id)"
                  @keydown.escape="cancelAddReward"
                />
                <input
                  v-model.number="newRewardQty"
                  type="number"
                  min="1"
                  class="pn-reward-qty-input"
                  @keydown.enter="submitReward(quest.id)"
                />
                <button class="pn-reward-submit" @click="submitReward(quest.id)">Add</button>
                <button class="pn-reward-cancel" @click="cancelAddReward">✕</button>
              </div>
            </template>
            <button v-else class="pn-add-reward-btn" @click="openAddReward(quest.id)">+ Add reward</button>
          </div>
          <div class="pn-quest-footer">
            <button class="pn-complete-btn" data-testid="quest-complete" @click="completeQuest(quest.id)">Mark complete</button>
            <button class="pn-del-btn" title="Delete quest" @click="deleteQuest(quest.id)">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
              </svg>
            </button>
          </div>
        </div>

        <div v-if="completedQuests.length" class="pn-section-bar pn-section-bar--completed">
          <button class="pn-count pn-count--btn" @click="showCompleted = !showCompleted">
            Completed {{ completedQuests.length }}
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" :style="showCompleted ? '' : 'transform:rotate(-90deg)'">
              <path d="M6 9l6 6 6-6"/>
            </svg>
          </button>
        </div>
        <template v-if="showCompleted">
          <div
            v-for="quest in completedQuests"
            :key="quest.id"
            class="pn-quest-card pn-quest-card--done"
            :class="{ 'pn-quest-card--expanded': isCompletedExpanded(quest.id) }"
          >
            <div class="pn-quest-title-row pn-quest-title-row--clickable" @click="toggleCompletedExpand(quest.id)">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" class="pn-done-chevron" :style="isCompletedExpanded(quest.id) ? '' : 'transform:rotate(-90deg)'">
                <path d="M6 9l6 6 6-6"/>
              </svg>
              <span class="pn-quest-title pn-quest-title--done">{{ quest.title || 'Untitled quest' }}</span>
              <button class="pn-del-btn" @click.stop="deleteQuest(quest.id)">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
                </svg>
              </button>
            </div>

            <template v-if="isCompletedExpanded(quest.id)">
              <p v-if="quest.description" class="pn-done-desc">{{ quest.description }}</p>

              <div v-if="quest.goals?.length" class="pn-goals-section">
                <div class="pn-goals-label">Goals</div>
                <div v-for="goal in quest.goals" :key="goal.id" class="pn-goal-row">
                  <div class="pn-goal-check" :class="{ checked: goal.completed }">
                    <svg v-if="goal.completed" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  </div>
                  <span class="pn-goal-text" :class="{ done: goal.completed }">{{ goal.text }}</span>
                </div>
              </div>

              <div v-if="quest.rewards?.length" class="pn-reward-section" style="border-top:none; padding-top:0; margin-top:6px">
                <div class="pn-reward-label">Rewards</div>
                <div class="pn-reward-list">
                  <div v-for="r in quest.rewards" :key="r.id" class="pn-reward-item">
                    <span class="pn-reward-chip" :class="{ 'pn-reward-chip--coins': r.type === 'coins' }">
                      <template v-if="r.type === 'coins'">{{ r.qty }} {{ r.currency }}</template>
                      <template v-else>{{ r.qty > 1 ? '×' + r.qty + ' ' : '' }}{{ r.name }}</template>
                    </span>
                  </div>
                </div>
              </div>

              <div class="pn-quest-footer" style="margin-top:8px">
                <button class="pn-reactivate-btn" @click="reactivateQuest(quest.id)">Reactivate</button>
                <button class="pn-del-btn" title="Delete quest" @click="deleteQuest(quest.id)">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
                  </svg>
                </button>
              </div>
            </template>
          </div>
        </template>
      </template>


      <template v-if="activeTab === 'notes'">
        <div class="pn-section-bar">
          <span class="pn-count">Entries {{ notebookStore.notes.length }}</span>
          <button class="pn-add-btn" data-testid="note-new" @click="newNote">+ New Entry</button>
        </div>
        <div v-if="!notebookStore.notes.length" class="pn-empty">No session notes yet</div>
        <div v-for="note in notebookStore.notes" :key="note.id" class="pn-note-card" data-testid="note-card">
          <div class="pn-note-header">
            <input
              class="pn-note-title"
              data-testid="note-title"
              :value="note.title"
              placeholder="Entry title…"
              :readonly="!canEditNote(note)"
              @focus="canEditNote(note) && onItemFocus('note', note.id)"
              @blur="canEditNote(note) && onItemBlur('note', note.id)"
              @input="debounceSaveNote(note.id, { title: $event.target.value })"
            />
            <span class="pn-note-author-badge" :style="{ '--bc': authorColor(note) }">
              {{ note.is_gm_author ? 'Game Master' : note.author_name }}
            </span>
            <button v-if="canEditNote(note)" class="pn-del-btn" @click="deleteNote(note.id)">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
              </svg>
            </button>
          </div>
          <div class="pn-note-ts">{{ formatTs(note.created_at) }}</div>
          <div v-if="editorsFor('note', note.id).length" class="pn-editing-indicator">
            <span class="pn-editing-dot" />
            {{ editorsFor('note', note.id).join(', ') }} {{ editorsFor('note', note.id).length === 1 ? 'is' : 'are' }} editing…
          </div>
          <textarea
            class="pn-note-content"
            data-testid="note-content"
            :value="note.content"
            placeholder="Write something…"
            :readonly="!canEditNote(note)"
            @focus="canEditNote(note) && onItemFocus('note', note.id)"
            @blur="canEditNote(note) && onItemBlur('note', note.id)"
            @input="debounceSaveNote(note.id, { content: $event.target.value })"
          />
        </div>
      </template>


      <template v-if="activeTab === 'vault'">

        <div class="pv-section-bar">
          <button class="pv-section-toggle" @click="lootOpen = !lootOpen">
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" :style="lootOpen ? '' : 'transform:rotate(-90deg)'">
              <path d="M6 9l6 6 6-6"/>
            </svg>
            <span class="pv-section-title">Pending Loot</span>
            <span v-if="vaultStore.loot.length" class="pv-badge">{{ vaultStore.loot.length }}</span>
          </button>
          <button class="pv-add-btn" data-testid="vault-add-loot" @click="toggleAddLoot">+ Add</button>
        </div>

        <template v-if="lootOpen">
          <div v-if="addLootOpen" class="pv-add-form">
            <input
              v-if="newLootType === 'item'"
              ref="lootNameInput"
              v-model="newLootName"
              class="pv-input"
              placeholder="Item name…"
              data-testid="vault-loot-name"
              @keydown.enter="submitNewLoot"
              @keydown.escape="cancelAddLoot"
            />
            <select v-else v-model="newLootCurrency" class="pv-input pv-currency-select" data-testid="vault-loot-currency">
              <option value="gold">Gold</option>
              <option value="silver">Silver</option>
              <option value="copper">Copper</option>
            </select>
            <div class="pv-form-row">
              <label class="pv-form-label">Qty</label>
              <input v-model.number="newLootQty" type="number" min="1" class="pv-input pv-input--qty" data-testid="vault-loot-qty" @keydown.enter="submitNewLoot" />
              <button class="pv-submit-btn" data-testid="vault-loot-submit" @click="submitNewLoot">Add</button>
              <button class="pv-cancel-btn" @click="cancelAddLoot">✕</button>
            </div>
            <div class="pv-type-row">
              <button class="pv-type-btn" :class="{ active: newLootType === 'item' }" data-testid="vault-loot-type-item" @click="newLootType = 'item'">Item</button>
              <button class="pv-type-btn" :class="{ active: newLootType === 'coins' }" data-testid="vault-loot-type-coins" @click="newLootType = 'coins'">Coins</button>
            </div>
          </div>

          <div v-if="!vaultStore.loot.length && !addLootOpen" class="pv-empty">No pending loot</div>

          <div v-for="item in vaultStore.loot" :key="item.id" class="pv-loot-card" data-testid="vault-loot-card">
            <div class="pv-loot-main">
              <span v-if="item.quantity > 1" class="pv-loot-qty" :class="{ 'pv-loot-qty--coins': (item.loot_type ?? 'item') === 'coins' }">×{{ item.quantity }}</span>
              <span class="pv-loot-name">{{ item.name }}</span>
            </div>
            <div v-if="item.notes" class="pv-loot-notes">{{ item.notes }}</div>
            <div class="pv-loot-by">from {{ item.added_by_name }}</div>

            <div v-if="claimingId === item.id" class="pv-split-row">
              <span class="pv-split-info">Take</span>
              <input
                v-model.number="claimQty"
                type="number"
                min="1"
                :max="item.quantity"
                class="pv-input pv-input--qty"
                data-testid="vault-claim-qty"
                @keydown.enter="confirmClaim(item)"
                @keydown.escape="claimingId = null"
              />
              <span class="pv-split-info">of {{ item.quantity }}</span>
              <button class="pv-split-confirm" :disabled="!claimQtyValid(item)" data-testid="vault-claim-confirm" @click="confirmClaim(item)">Claim</button>
              <button class="pv-split-cancel" @click="claimingId = null">✕</button>
            </div>

            <div v-if="splittingId === item.id" class="pv-split-row">
              <template v-if="activeChars.length > 0">
                <span class="pv-split-info">
                  ÷{{ activeChars.length }} players = {{ splitQtyPer(item) }} each<template v-if="splitRemainder(item) > 0"> · {{ splitRemainder(item) }} remainder</template>
                </span>
                <button
                  class="pv-split-confirm"
                  :disabled="splitQtyPer(item) < 1"
                  data-testid="vault-split-confirm"
                  @click="confirmSplit(item)"
                >Deal out</button>
              </template>
              <span v-else class="pv-split-info pv-split-info--warn">No active characters</span>
              <button class="pv-split-cancel" @click="splittingId = null">✕</button>
            </div>

            <div v-if="assigningId === item.id" class="pv-split-row pv-assign-row">
              <div class="pv-assign-chars">
                <button
                  v-for="c in activeChars"
                  :key="c.id"
                  class="pv-assign-char"
                  :class="{ active: assignCount(c.id) > 0 }"
                  :disabled="assignCount(c.id) === 0 && totalAssigned >= item.quantity"
                  data-testid="vault-assign-char"
                  @click="cycleAssign(c, item)"
                >{{ (c.data?.name || 'Player').split(' ')[0] }}<span v-if="assignCount(c.id) > 0" class="pv-assign-n"> ×{{ assignCount(c.id) }}</span></button>
              </div>
              <span class="pv-split-info">{{ totalAssigned }}/{{ item.quantity }}</span>
              <button class="pv-split-confirm" :disabled="totalAssigned === 0" data-testid="vault-assign-confirm" @click="confirmAssign(item)">Deal out</button>
              <button class="pv-split-cancel" @click="assigningId = null">✕</button>
            </div>

            <div v-if="stashingId === item.id" class="pv-split-row pv-stash-row">
              <span class="pv-split-info">Store to:</span>
              <button
                v-for="c in vaultStore.containers"
                :key="c.id"
                class="pv-stash-option"
                @click="doStash(item, c.id)"
              >{{ c.name }}</button>
              <button class="pv-split-cancel" @click="stashingId = null">✕</button>
            </div>

            <div class="pv-loot-actions">
              <button
                class="pv-action"
                :class="{ active: claimingId === item.id }"
                :disabled="!characterStore.character"
                :title="characterStore.character ? 'Add to my inventory' : 'Select a character first'"
                data-testid="vault-claim"
                @click="onClaimClick(item)"
              >Claim</button>
              <button v-if="(item.loot_type ?? 'item') === 'coins'" class="pv-action" title="Move to party bank" data-testid="vault-deposit" @click="vaultStore.depositLoot(item)">Deposit</button>
              <button
                class="pv-action"
                :class="{ active: stashingId === item.id }"
                :disabled="vaultStore.containers.length === 0"
                :title="vaultStore.containers.length === 0 ? 'No containers — add one below' : 'Store in group storage'"
                @click="onStashClick(item)"
              >Store</button>
              <template v-if="(item.loot_type ?? 'item') === 'coins'">
                <button
                  class="pv-action pv-action--split"
                  :class="{ active: splittingId === item.id }"
                  :disabled="activeChars.length < 2"
                  :title="activeChars.length < 2 ? 'Need 2+ active characters' : 'Split among active players'"
                  data-testid="vault-split"
                  @click="toggleSplit(item)"
                >Split</button>
              </template>
              <template v-else>
                <button
                  class="pv-action pv-action--split"
                  :class="{ active: assigningId === item.id }"
                  :disabled="activeChars.length < 1"
                  :title="activeChars.length < 1 ? 'No active characters' : 'Assign to players'"
                  data-testid="vault-assign"
                  @click="toggleAssign(item)"
                >Assign</button>
              </template>
              <button class="pv-action pv-action--danger" title="Discard" @click="vaultStore.discardLoot(item)">Discard</button>
            </div>
          </div>
        </template>


        <div class="pv-section-bar pv-section-bar--storage">
          <button class="pv-section-toggle" @click="bankOpen = !bankOpen">
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" :style="bankOpen ? '' : 'transform:rotate(-90deg)'">
              <path d="M6 9l6 6 6-6"/>
            </svg>
            <span class="pv-section-title">Party Bank</span>
          </button>
          <div class="pv-bank-btns">
            <button class="pv-add-btn" @click="toggleAddBank">+ Deposit</button>
            <button class="pv-add-btn" @click="toggleWithdrawBank">− Withdraw</button>
          </div>
        </div>

        <template v-if="bankOpen">
          <div v-if="addBankOpen" class="pv-add-form">
            <select v-model="newBankCurrency" class="pv-input pv-currency-select">
              <option value="gold">Gold</option>
              <option value="silver">Silver</option>
              <option value="copper">Copper</option>
            </select>
            <div class="pv-form-row">
              <label class="pv-form-label">Qty</label>
              <input v-model.number="newBankQty" type="number" min="1" class="pv-input pv-input--qty" @keydown.enter="submitNewBank" />
              <button class="pv-submit-btn" @click="submitNewBank">Deposit</button>
              <button class="pv-cancel-btn" @click="cancelAddBank">✕</button>
            </div>
          </div>

          <div v-if="withdrawBankOpen" class="pv-add-form">
            <select v-model="withdrawBankCurrency" class="pv-input pv-currency-select">
              <option value="gold">Gold</option>
              <option value="silver">Silver</option>
              <option value="copper">Copper</option>
            </select>
            <div class="pv-form-row">
              <label class="pv-form-label">Qty</label>
              <input v-model.number="withdrawBankQty" type="number" min="1" class="pv-input pv-input--qty" @keydown.enter="submitWithdrawBank" />
              <button class="pv-submit-btn" @click="submitWithdrawBank">Withdraw</button>
              <button class="pv-cancel-btn" @click="withdrawBankOpen = false">✕</button>
            </div>
          </div>

          <div class="pv-bank-coins-grid">
            <div v-for="coin in BANK_COINS" :key="coin.key" class="pv-bank-coin">
              <div class="pv-coin-icon" :style="{ background: coin.bg, color: coin.fg }">{{ coin.symbol }}</div>
              <div class="pv-coin-amount" :data-testid="`vault-bank-${coin.key}`">{{ bankTotal(coin.key) }}</div>
              <div class="pv-coin-label">{{ coin.label }}</div>
            </div>
          </div>

          <div v-if="!vaultStore.ledger.length" class="pv-empty">No transactions yet</div>
          <div v-for="entry in vaultStore.ledger" :key="entry.id" class="pv-ledger-entry">
            <span class="pv-ledger-who">{{ entry.character_name || entry.display_name }}</span>
            <span class="pv-ledger-desc">{{ entry.description }}</span>
            <span v-if="entry.gold_change"   class="pv-ledger-change" :style="{ color: entry.gold_change   > 0 ? '#b89c2a' : '#8a1c1c' }">{{ entry.gold_change   > 0 ? '+' : '' }}{{ entry.gold_change   }}gp</span>
            <span v-if="entry.silver_change" class="pv-ledger-change" :style="{ color: entry.silver_change > 0 ? '#6b7e8a' : '#8a1c1c' }">{{ entry.silver_change > 0 ? '+' : '' }}{{ entry.silver_change }}sp</span>
            <span v-if="entry.copper_change" class="pv-ledger-change" :style="{ color: entry.copper_change > 0 ? '#8a5a2a' : '#8a1c1c' }">{{ entry.copper_change > 0 ? '+' : '' }}{{ entry.copper_change }}cp</span>
            <span class="pv-ledger-ts">{{ formatTs(entry.created_at) }}</span>
          </div>
        </template>

       <div class="pv-section-bar pv-section-bar--storage">
          <button class="pv-section-toggle" @click="storageOpen = !storageOpen">
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" :style="storageOpen ? '' : 'transform:rotate(-90deg)'">
              <path d="M6 9l6 6 6-6"/>
            </svg>
            <span class="pv-section-title">Group Storage</span>
            <span v-if="vaultStore.containers.length" class="pv-badge">{{ vaultStore.containers.length }}</span>
          </button>
          <button class="pv-add-btn" data-testid="vault-add-container" @click="toggleAddContainer">+ Add</button>
        </div>

        <template v-if="storageOpen">
          <div v-if="addContainerOpen" class="pv-add-form">
            <input
              ref="containerNameInput"
              v-model="newContainerName"
              class="pv-input"
              placeholder="Name (e.g. Donkey Cart)…"
              data-testid="vault-container-name"
              @keydown.enter="submitNewContainer"
              @keydown.escape="cancelAddContainer"
            />
            <div class="pv-form-row">
              <label class="pv-form-label">Slots</label>
              <input v-model.number="newContainerSlots" type="number" min="1" class="pv-input pv-input--qty" @keydown.enter="submitNewContainer" />
              <button class="pv-submit-btn" data-testid="vault-container-submit" @click="submitNewContainer">Add</button>
              <button class="pv-cancel-btn" @click="cancelAddContainer">✕</button>
            </div>
          </div>

          <div v-if="!vaultStore.containers.length && !addContainerOpen" class="pv-empty">No containers. Add a cart, horse, or other shared storage</div>

          <template v-for="container in vaultStore.containers" :key="container.id">
            <div class="pv-container-header">
              <button class="pv-section-toggle" @click="toggleContainer(container.id)">
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" :style="isContainerOpen(container.id) ? '' : 'transform:rotate(-90deg)'">
                  <path d="M6 9l6 6 6-6"/>
                </svg>
                <span class="pv-container-name">{{ container.name }}</span>
              </button>
              <span class="pv-container-slots">{{ containerSlotsUsed(container.id) }} / {{ container.gear_slots }} slots</span>
              <button class="pv-storage-remove pv-storage-remove--visible" title="Remove container" @click="tryRemoveContainer(container)">
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                  <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
              </button>
            </div>
            <div class="pv-container-slot-bar">
              <div class="pv-container-slot-fill" :style="{
                width: Math.min(100, containerSlotsUsed(container.id) / Math.max(1, container.gear_slots) * 100) + '%',
                background: containerSlotsUsed(container.id) / container.gear_slots > 0.9 ? '#8a1c1c'
                          : containerSlotsUsed(container.id) / container.gear_slots > 0.7 ? '#b8541c'
                          : 'var(--accent-3, #4a7c59)'
              }" />
            </div>

            <div v-if="confirmRemoveId === container.id" class="pv-split-row pv-confirm-row">
              <span class="pv-split-info">Remove "{{ container.name }}"? Items return to bank.</span>
              <button class="pv-split-confirm pv-split-confirm--danger" @click="doRemoveContainer(container.id)">Remove</button>
              <button class="pv-split-cancel" @click="confirmRemoveId = null">✕</button>
            </div>

            <template v-if="isContainerOpen(container.id)">
              <div v-if="addItemContainerId === container.id" class="pv-add-form pv-add-form--indent">
                <input
                  ref="itemNameInputs"
                  v-model="newItemName"
                  class="pv-input"
                  placeholder="Item name…"
                  @keydown.enter="submitNewItem(container.id)"
                  @keydown.escape="addItemContainerId = null"
                />
                <div class="pv-form-row">
                  <label class="pv-form-label">Qty</label>
                  <input v-model.number="newItemQty" type="number" min="1" class="pv-input pv-input--qty" />
                  <label class="pv-form-label">Slots</label>
                  <div class="pv-slots-stepper">
                    <button @click="newItemSlots = Math.max(0, newItemSlots - 1)">−</button>
                    <span>{{ newItemSlots }}</span>
                    <button @click="newItemSlots++">+</button>
                  </div>
                </div>
                <div class="pv-form-row">
                  <label class="pv-form-label">Type</label>
                  <select v-model="newItemType" class="pv-input pv-item-type-select">
                    <option value="sundry">Sundry</option>
                    <option value="weapon">Weapon</option>
                    <option value="armor">Armor</option>
                  </select>
                  <button class="pv-submit-btn" @click="submitNewItem(container.id)">Add</button>
                  <button class="pv-cancel-btn" @click="addItemContainerId = null">✕</button>
                </div>
              </div>

              <template
                v-for="item in vaultStore.items.filter(i => i.container_id === container.id)"
                :key="item.id"
              >
                <div v-if="editingItemId === item.id" class="pv-add-form pv-add-form--indent">
                  <input v-model="editItemDraft.name" class="pv-input" @keydown.escape="editingItemId = null" />
                  <div class="pv-form-row">
                    <label class="pv-form-label">Qty</label>
                    <input v-model.number="editItemDraft.qty" type="number" min="1" class="pv-input pv-input--qty" />
                    <label class="pv-form-label">Slots</label>
                    <div class="pv-slots-stepper">
                      <button @click="editItemDraft.slots = Math.max(0, editItemDraft.slots - 1)">−</button>
                      <span>{{ editItemDraft.slots }}</span>
                      <button @click="editItemDraft.slots++">+</button>
                    </div>
                  </div>
                  <div class="pv-form-row">
                    <label class="pv-form-label">Type</label>
                    <select v-model="editItemDraft.type" class="pv-input pv-item-type-select">
                      <option value="sundry">Sundry</option>
                      <option value="weapon">Weapon</option>
                      <option value="armor">Armor</option>
                    </select>
                    <button class="pv-submit-btn" @click="saveEditItem(item)">Save</button>
                    <button class="pv-cancel-btn" @click="editingItemId = null">✕</button>
                  </div>
                </div>
                <div v-else class="pv-gear-item" data-testid="vault-stored-item">
                  <div class="pv-gear-main">
                    <div class="pv-gear-name">{{ item.name }}</div>
                    <div class="pv-gear-sub">
                      {{ item.slots ?? 1 }} slot{{ (item.slots ?? 1) !== 1 ? 's' : '' }}<span v-if="item.quantity > 1"> · ×{{ item.quantity }}</span>
                    </div>
                  </div>
                  <span class="pv-gear-badge" :class="item.item_type ?? 'sundry'">{{ item.item_type ?? 'sundry' }}</span>
                  <button
                    class="pv-gear-edit-btn"
                    :disabled="!characterStore.character"
                    :title="characterStore.character ? 'Take to my gear' : 'Select a character first'"
                    data-testid="vault-item-take"
                    @click="onTakeClick(item)"
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                      <polyline points="7 10 12 15 17 10"/>
                      <line x1="12" y1="15" x2="12" y2="3"/>
                    </svg>
                  </button>
                  <button
                    v-if="vaultStore.containers.length > 1"
                    class="pv-gear-edit-btn"
                    title="Move to another container"
                    data-testid="vault-item-move"
                    @click="onMoveClick(item)"
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M5 12h14"/>
                      <path d="M12 5l7 7-7 7"/>
                    </svg>
                  </button>
                  <button class="pv-gear-edit-btn" title="Edit" @click="startEditItem(item)">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                      <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                  </button>
                  <button class="pv-storage-remove" title="Remove" @click="vaultStore.removeStoredItem(item)">
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                      <path d="M18 6L6 18M6 6l12 12"/>
                    </svg>
                  </button>
                </div>

                <div v-if="takingItemId === item.id" class="pv-split-row">
                  <span class="pv-split-info">Take</span>
                  <input
                    v-model.number="takeQty"
                    type="number"
                    min="1"
                    :max="item.quantity"
                    class="pv-input pv-input--qty"
                    data-testid="vault-take-qty"
                    @keydown.enter="confirmTake(item)"
                    @keydown.escape="takingItemId = null"
                  />
                  <span class="pv-split-info">of {{ item.quantity }}</span>
                  <button class="pv-split-confirm" :disabled="!takeQtyValid(item)" data-testid="vault-take-confirm" @click="confirmTake(item)">Take</button>
                  <button class="pv-split-cancel" @click="takingItemId = null">✕</button>
                </div>

                <div v-if="movingItemId === item.id" class="pv-split-row pv-stash-row">
                  <span class="pv-split-info">Move to:</span>
                  <button
                    v-for="c in vaultStore.containers.filter(c => c.id !== item.container_id)"
                    :key="c.id"
                    class="pv-stash-option"
                    data-testid="vault-move-option"
                    @click="doMoveItem(item, c.id)"
                  >{{ c.name }}</button>
                  <button class="pv-split-cancel" @click="movingItemId = null">✕</button>
                </div>
              </template>

              <div
                v-if="!vaultStore.items.filter(i => i.container_id === container.id).length && addItemContainerId !== container.id"
                class="pv-empty pv-empty--sm"
              >Empty</div>

              <div class="pv-container-add-row">
                <button class="pv-add-btn" @click="openAddItem(container.id)">+ Add item</button>
              </div>
            </template>
          </template>
        </template>

        <div class="pv-section-bar pv-section-bar--storage">
          <button class="pv-section-toggle" @click="activityOpen = !activityOpen">
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" :style="activityOpen ? '' : 'transform:rotate(-90deg)'">
              <path d="M6 9l6 6 6-6"/>
            </svg>
            <span class="pv-section-title">Activity</span>
          </button>
        </div>

        <template v-if="activityOpen">
          <div v-if="!vaultStore.activity.length" class="pv-empty">No activity yet</div>
          <div v-for="entry in vaultStore.activity" :key="entry.id" class="pv-ledger-entry" data-testid="vault-activity-entry">
            <span class="pv-ledger-who">{{ entry.character_name || entry.display_name }}</span>
            <span class="pv-ledger-desc">{{ entry.verb }} {{ entry.what }}</span>
            <span class="pv-ledger-ts">{{ formatTs(entry.created_at) }}</span>
          </div>
        </template>

      </template>

      <template v-if="activeTab === 'calendar'">
        <PartyCalendar :session-id="sessionId" />
      </template>

      <template v-if="activeTab === 'journal' && isSoloOrCoop">
        <JournalPanel :session-id="sessionId" />
      </template>

    </div>
    <div class="pn-resize-handle" @mousedown.stop="startResize">
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
        <line x1="2" y1="9" x2="9" y2="2"/>
        <line x1="5.5" y1="9" x2="9" y2="5.5"/>
      </svg>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import PartyCalendar from '@/components/common/PartyCalendar.vue'
import JournalPanel from '@/components/common/JournalPanel.vue'
import { useCharacterStore } from '@/stores/characterStore.js'
import { useNotebookStore } from '@/stores/notebookStore.js'
import { useVaultStore } from '@/stores/vaultStore.js'
import { useSessionStore } from '@/stores/sessionStore.js'
import { useAuthStore } from '@/stores/authStore.js'
import { usePartyNotebook } from '@/composables/usePartyNotebook.js'
import { createPatchDebouncer } from '@/composables/usePatchDebounce.js'
import { playerColorFor } from '@/composables/usePlayerColor.js'
import { useQuestToast } from '@/composables/useQuestToast.js'
import { playDiceSound } from '@/lib/diceSound.js'

const props = defineProps({ sessionId: { type: String, required: true } })

const { visible, activeTab, close } = usePartyNotebook()
const notebookStore   = useNotebookStore()
const characterStore  = useCharacterStore()
const vaultStore      = useVaultStore()
const sessionStore    = useSessionStore()
const authStore       = useAuthStore()

// the journal is a solo/co-op tool, same gate as the oracle and travel panels
const isSoloOrCoop = computed(() => sessionStore.playMode === 'gm_less')
watch(isSoloOrCoop, (solo) => {
  if (!solo && activeTab.value === 'journal') activeTab.value = 'quests'
}, { immediate: true })

const showCompleted = ref(false)
const POS_KEY  = 'dm.partyNotebook.pos'
const SIZE_KEY = 'dm.partyNotebook.size'
const pos  = ref({ x: 80, y: 140 })
const size = ref({ w: 640, h: 600 })

onMounted(async () => {
  try {
    const savedPos  = JSON.parse(localStorage.getItem(POS_KEY)  ?? 'null')
    const savedSize = JSON.parse(localStorage.getItem(SIZE_KEY) ?? 'null')
    if (savedPos?.x  !== undefined) pos.value  = savedPos
    if (savedSize?.w !== undefined) size.value = savedSize
  } catch {}
  await Promise.all([
    notebookStore.init(props.sessionId),
    vaultStore.init(props.sessionId),
  ])
})

onUnmounted(() => {
  questSaver.flush()
  noteSaver.flush()
  window.removeEventListener('mousemove', onDragMove)
  window.removeEventListener('mouseup', onDragUp)
  window.removeEventListener('mousemove', onResizeMove)
  window.removeEventListener('mouseup', onResizeUp)
})

let dragStart = null
function startDrag(e) {
  dragStart = { mx: e.clientX, my: e.clientY, px: pos.value.x, py: pos.value.y }
  window.addEventListener('mousemove', onDragMove)
  window.addEventListener('mouseup', onDragUp)
}
function onDragMove(e) {
  if (!dragStart) return
  pos.value = {
    x: Math.max(0, dragStart.px + (e.clientX - dragStart.mx)),
    y: Math.max(0, dragStart.py + (e.clientY - dragStart.my)),
  }
}
function onDragUp() {
  dragStart = null
  localStorage.setItem(POS_KEY, JSON.stringify(pos.value))
  window.removeEventListener('mousemove', onDragMove)
  window.removeEventListener('mouseup', onDragUp)
}

let resizeStart = null
function startResize(e) {
  resizeStart = { mx: e.clientX, my: e.clientY, w: size.value.w, h: size.value.h }
  window.addEventListener('mousemove', onResizeMove)
  window.addEventListener('mouseup', onResizeUp)
}
function onResizeMove(e) {
  if (!resizeStart) return
  size.value = {
    w: Math.max(400, resizeStart.w + (e.clientX - resizeStart.mx)),
    h: Math.max(360, Math.min(window.innerHeight - 60, resizeStart.h + (e.clientY - resizeStart.my))),
  }
}
function onResizeUp() {
  resizeStart = null
  localStorage.setItem(SIZE_KEY, JSON.stringify(size.value))
  window.removeEventListener('mousemove', onResizeMove)
  window.removeEventListener('mouseup', onResizeUp)
}



const activeQuests     = computed(() => notebookStore.quests.filter(q => !q.completed))
const completedQuests  = computed(() => notebookStore.quests.filter(q => q.completed))
const activeQuestCount = computed(() => activeQuests.value.length)

function goalPct(quest) {
  const goals = quest.goals ?? []
  if (!goals.length) return 0
  return Math.round((goals.filter(g => g.completed).length / goals.length) * 100)
}
function completedGoals(quest) {
  return (quest.goals ?? []).filter(g => g.completed).length
}

const questSaver = createPatchDebouncer((id, patch) => notebookStore.updateQuest(id, patch))
function debounceSaveQuest(id, patch) {
  const quest = notebookStore.quests.find(q => q.id === id)
  if (quest) Object.assign(quest, patch)
  questSaver.push(id, patch)
}

async function newQuest() {
  const q = await notebookStore.addQuest()
  if (q) showCompleted.value = false
}

async function completeQuest(id) {
  const quest = notebookStore.quests.find(q => q.id === id)
  const rewards = quest?.rewards ?? []
  for (const r of rewards) {
    if (r.type === 'coins') {
      const label = r.currency.charAt(0).toUpperCase() + r.currency.slice(1) + ' Coins'
      await vaultStore.addLoot(label, r.qty, '', 'coins', r.currency)
    } else if (r.name?.trim()) {
      await vaultStore.addLoot(r.name.trim(), r.qty, '', 'item', null)
    }
  }
  if (rewards.length) {
    const { push: pushQuest } = useQuestToast()
    pushQuest({ title: quest.title, rewards })
  }
  notebookStore.updateQuest(id, { completed: true })
}

function deleteQuest(id) {
  notebookStore.deleteQuest(id)
}

const expandedCompletedIds = ref(new Set())

function isCompletedExpanded(id) {
  return expandedCompletedIds.value.has(id)
}

function toggleCompletedExpand(id) {
  const s = new Set(expandedCompletedIds.value)
  s.has(id) ? s.delete(id) : s.add(id)
  expandedCompletedIds.value = s
}

function reactivateQuest(id) {
  expandedCompletedIds.value = new Set([...expandedCompletedIds.value].filter(x => x !== id))
  notebookStore.updateQuest(id, { completed: false })
}

function toggleGoal(quest, goalId) {
  const goals = (quest.goals ?? []).map(g =>
    g.id === goalId ? { ...g, completed: !g.completed } : g
  )
  notebookStore.updateQuest(quest.id, { goals })
}

function updateGoalText(quest, goalId, text) {
  const goals = (quest.goals ?? []).map(g => g.id === goalId ? { ...g, text } : g)
  debounceSaveQuest(quest.id, { goals })
}

function addGoal(quest) {
  const goals = [...(quest.goals ?? []), { id: crypto.randomUUID(), text: '', completed: false }]
  notebookStore.updateQuest(quest.id, { goals })
}

function removeGoal(quest, goalId) {
  const goals = (quest.goals ?? []).filter(g => g.id !== goalId)
  notebookStore.updateQuest(quest.id, { goals })
}



const addRewardQuestId  = ref(null)
const newRewardType     = ref(null)
const newRewardCurrency = ref('gold')
const newRewardName     = ref('')
const newRewardQty      = ref(1)

function openAddReward(questId) {
  addRewardQuestId.value  = questId
  newRewardType.value     = null
  newRewardCurrency.value = 'gold'
  newRewardName.value     = ''
  newRewardQty.value      = 1
}

function cancelAddReward() {
  addRewardQuestId.value = null
  newRewardType.value    = null
}

function submitReward(questId) {
  if (newRewardType.value === 'item' && !newRewardName.value.trim()) return
  const reward = newRewardType.value === 'coins'
    ? { id: crypto.randomUUID(), type: 'coins', currency: newRewardCurrency.value, qty: newRewardQty.value }
    : { id: crypto.randomUUID(), type: 'item', name: newRewardName.value.trim(), qty: newRewardQty.value }
  const quest = notebookStore.quests.find(q => q.id === questId)
  debounceSaveQuest(questId, { rewards: [...(quest?.rewards ?? []), reward] })
  addRewardQuestId.value = null
  newRewardType.value    = null
}

function removeReward(questId, rewardId) {
  const quest = notebookStore.quests.find(q => q.id === questId)
  debounceSaveQuest(questId, { rewards: (quest?.rewards ?? []).filter(r => r.id !== rewardId) })
}


const activeChars = computed(() => {
  const gmId = sessionStore.sessionOwnerId
  const activeIds = new Set(characterStore.memberSelections.map(m => m.active_character_id).filter(Boolean))
  return characterStore.characters.filter(c => activeIds.has(c.id) && c.user_id !== gmId)
})


const noteSaver = createPatchDebouncer((id, patch) => notebookStore.updateNote(id, patch))
function debounceSaveNote(id, patch) {
  const note = notebookStore.notes.find(n => n.id === id)
  if (note) Object.assign(note, patch)
  noteSaver.push(id, patch)
}

async function newNote() {
  await notebookStore.addNote()
}

function deleteNote(id) {
  notebookStore.deleteNote(id)
}

function canEditNote(note) {
  return sessionStore.isGM || note.author_user_id === authStore.user?.id
}

function editorsFor(kind, id) {
  return notebookStore.editingBy[`${kind}:${id}`] ?? []
}

const _itemBlurTimers = new Map()
function onItemFocus(kind, id) {
  clearTimeout(_itemBlurTimers.get(`${kind}:${id}`))
  notebookStore.setEditing(kind, id)
}
function onItemBlur(kind, id) {
  _itemBlurTimers.set(`${kind}:${id}`, setTimeout(() => notebookStore.clearEditing(kind, id), 150))
}

function authorColor(note) {
  if (note.is_gm_author) return 'var(--accent)'
  return playerColorFor(note.author_user_id)
}

function formatTs(ts) {
  if (!ts) return ''
  const d   = new Date(ts)
  const now = new Date()
  const isToday     = d.toDateString() === now.toDateString()
  const isYesterday = new Date(now - 86400000).toDateString() === d.toDateString()
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  if (isToday)     return `today · ${time}`
  if (isYesterday) return `yesterday · ${time}`
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ` · ${time}`
}

const lootOpen     = ref(true)
const bankOpen     = ref(true)
const storageOpen  = ref(true)
const activityOpen = ref(true)


const splittingId = ref(null)

function splitQtyPer(item) {
  return activeChars.value.length ? Math.floor(item.quantity / activeChars.value.length) : 0
}

function splitRemainder(item) {
  return activeChars.value.length ? item.quantity % activeChars.value.length : 0
}

function toggleSplit(item) {
  splittingId.value = splittingId.value === item.id ? null : item.id
  if (splittingId.value) { stashingId.value = null; assigningId.value = null; claimingId.value = null }
}

async function confirmSplit(item) {
  splittingId.value = null
  playDiceSound()
  await vaultStore.splitLoot(item, activeChars.value)
}

const claimingId = ref(null)
const claimQty   = ref(1)

function claimQtyValid(item) {
  return Number.isInteger(claimQty.value) && claimQty.value >= 1 && claimQty.value <= item.quantity
}

function onClaimClick(item) {
  if (item.quantity === 1) {
    void vaultStore.claimLoot(item)
    return
  }
  claimingId.value = claimingId.value === item.id ? null : item.id
  if (claimingId.value) {
    splittingId.value = null
    assigningId.value = null
    stashingId.value  = null
    claimQty.value    = item.quantity
  }
}

async function confirmClaim(item) {
  if (!claimQtyValid(item)) return
  const qty = claimQty.value
  claimingId.value = null
  await vaultStore.claimLoot(item, qty)
}


const assigningId     = ref(null)
const charAssignments = ref(new Map())
const totalAssigned   = computed(() => [...charAssignments.value.values()].reduce((s, c) => s + c, 0))

function assignCount(charId) {
  return charAssignments.value.get(charId) ?? 0
}

function toggleAssign(item) {
  assigningId.value = assigningId.value === item.id ? null : item.id
  if (assigningId.value) { splittingId.value = null; stashingId.value = null; claimingId.value = null; charAssignments.value = new Map() }
}

function cycleAssign(char, item) {
  const current     = assignCount(char.id)
  const othersTotal = totalAssigned.value - current
  const next = current >= (item.quantity - othersTotal) ? 0 : current + 1
  const m = new Map(charAssignments.value)
  next === 0 ? m.delete(char.id) : m.set(char.id, next)
  charAssignments.value = m
}

async function confirmAssign(item) {
  const asgns = []
  for (const [charId, qty] of charAssignments.value.entries()) {
    const char = activeChars.value.find(c => c.id === charId)
    if (char && qty > 0) {
      asgns.push({ char, qty })
      vaultStore.broadcastLootToast({ type: 'item', charName: char.data?.name || 'Player', itemName: item.name, qty })
    }
  }
  assigningId.value     = null
  charAssignments.value = new Map()
  playDiceSound()
  await vaultStore.assignLoot(item, asgns)
}


const stashingId = ref(null)

function onStashClick(item) {
  if (vaultStore.containers.length === 1) {
    doStash(item, vaultStore.containers[0].id)
  } else {
    stashingId.value = stashingId.value === item.id ? null : item.id
    if (stashingId.value) { splittingId.value = null; assigningId.value = null; claimingId.value = null }
  }
}

async function doStash(item, containerId) {
  stashingId.value = null
  await vaultStore.stashLoot(item, containerId)
}


const addLootOpen     = ref(false)
const newLootName     = ref('')
const newLootQty      = ref(1)
const newLootType     = ref('item')
const newLootCurrency = ref('gold')
const lootNameInput   = ref(null)

function toggleAddLoot() {
  addLootOpen.value = !addLootOpen.value
  if (addLootOpen.value) {
    newLootName.value     = ''
    newLootQty.value      = 1
    newLootType.value     = 'item'
    newLootCurrency.value = 'gold'
    nextTick(() => lootNameInput.value?.focus())
  }
}

function cancelAddLoot() { addLootOpen.value = false }

async function submitNewLoot() {
  const isCoins = newLootType.value === 'coins'
  if (!isCoins && !newLootName.value.trim()) return
  const name     = isCoins ? newLootCurrency.value.charAt(0).toUpperCase() + newLootCurrency.value.slice(1) + ' Coins' : newLootName.value
  const currency = isCoins ? newLootCurrency.value : null
  await vaultStore.addLoot(name, newLootQty.value, '', newLootType.value, currency)
  newLootName.value     = ''
  newLootQty.value      = 1
  newLootType.value     = 'item'
  newLootCurrency.value = 'gold'
  addLootOpen.value     = false
}


const BANK_COINS = [
  { key: 'gold',   symbol: 'GP', label: 'Gold',   bg: '#b89c2a', fg: '#fff5e8' },
  { key: 'silver', symbol: 'SP', label: 'Silver',  bg: '#6b7e8a', fg: '#fff5e8' },
  { key: 'copper', symbol: 'CP', label: 'Copper',  bg: '#8a5a2a', fg: '#fff5e8' },
]

function isCoinItem(item, currency) {
  if (item.currency) return item.currency === currency
  return (item.name ?? '').toLowerCase().includes(currency)
}

function bankTotal(currency) {
  return vaultStore.bankItems
    .filter(i => isCoinItem(i, currency))
    .reduce((s, i) => s + (i.quantity ?? 0), 0)
}



const addBankOpen     = ref(false)
const newBankQty      = ref(1)
const newBankCurrency = ref('gold')

function toggleAddBank() {
  addBankOpen.value = !addBankOpen.value
  if (addBankOpen.value) {
    newBankQty.value      = 1
    newBankCurrency.value = 'gold'
  }
}

function cancelAddBank() { addBankOpen.value = false }

const withdrawBankOpen     = ref(false)
const withdrawBankCurrency = ref('gold')
const withdrawBankQty      = ref(1)

function toggleWithdrawBank() {
  withdrawBankOpen.value = !withdrawBankOpen.value
  if (withdrawBankOpen.value) { addBankOpen.value = false; withdrawBankCurrency.value = 'gold'; withdrawBankQty.value = 1 }
}

async function submitWithdrawBank() {
  if (withdrawBankQty.value < 1) return
  await vaultStore.withdrawCoins(withdrawBankCurrency.value, withdrawBankQty.value)
  withdrawBankOpen.value = false
  withdrawBankQty.value  = 1
}

async function submitNewBank() {
  const name = newBankCurrency.value.charAt(0).toUpperCase() + newBankCurrency.value.slice(1) + ' Coins'
  await vaultStore.addToBank(name, newBankQty.value, '', newBankCurrency.value)
  newBankQty.value      = 1
  newBankCurrency.value = 'gold'
  addBankOpen.value     = false
}


const addContainerOpen   = ref(false)
const newContainerName   = ref('')
const newContainerSlots  = ref(10)
const containerNameInput = ref(null)

function toggleAddContainer() {
  addContainerOpen.value = !addContainerOpen.value
  if (addContainerOpen.value) {
    newContainerName.value  = ''
    newContainerSlots.value = 10
    nextTick(() => containerNameInput.value?.focus())
  }
}

function cancelAddContainer() { addContainerOpen.value = false }

async function submitNewContainer() {
  if (!newContainerName.value.trim()) return
  await vaultStore.addContainer(newContainerName.value, newContainerSlots.value)
  newContainerName.value  = ''
  newContainerSlots.value = 10
  addContainerOpen.value  = false
}


const containerOpenState = ref({})

function isContainerOpen(id) {
  return containerOpenState.value[id] !== false
}

function toggleContainer(id) {
  containerOpenState.value = { ...containerOpenState.value, [id]: !isContainerOpen(id) }
}


const confirmRemoveId = ref(null)

function tryRemoveContainer(container) {
  const hasItems = vaultStore.items.some(i => i.container_id === container.id)
  if (hasItems) {
    confirmRemoveId.value = container.id
  } else {
    vaultStore.removeContainer(container.id)
  }
}

async function doRemoveContainer(id) {
  confirmRemoveId.value = null
  await vaultStore.removeContainer(id)
}


const addItemContainerId = ref(null)
const newItemName        = ref('')
const newItemQty         = ref(1)
const newItemSlots       = ref(1)
const newItemType        = ref('sundry')
const itemNameInputs     = ref(null)

const editingItemId = ref(null)
const editItemDraft = ref({ name: '', qty: 1, slots: 1, type: 'sundry' })

function startEditItem(item) {
  editingItemId.value = item.id
  editItemDraft.value = { name: item.name, qty: item.quantity ?? 1, slots: item.slots ?? 1, type: item.item_type ?? 'sundry' }
}

async function saveEditItem(item) {
  if (!editItemDraft.value.name.trim()) return
  await vaultStore.editVaultItem(item, {
    name:      editItemDraft.value.name.trim(),
    quantity:  editItemDraft.value.qty,
    slots:     editItemDraft.value.slots,
    item_type: editItemDraft.value.type,
  })
  editingItemId.value = null
}


const takingItemId = ref(null)
const takeQty      = ref(1)
const movingItemId = ref(null)

function takeQtyValid(item) {
  return Number.isInteger(takeQty.value) && takeQty.value >= 1 && takeQty.value <= item.quantity
}

function onTakeClick(item) {
  movingItemId.value = null
  if (item.quantity === 1) {
    takingItemId.value = null
    void vaultStore.takeVaultItem(item)
    return
  }
  takingItemId.value = takingItemId.value === item.id ? null : item.id
  if (takingItemId.value) takeQty.value = item.quantity
}

async function confirmTake(item) {
  if (!takeQtyValid(item)) return
  const qty = takeQty.value
  takingItemId.value = null
  await vaultStore.takeVaultItem(item, qty)
}

function onMoveClick(item) {
  takingItemId.value = null
  movingItemId.value = movingItemId.value === item.id ? null : item.id
}

async function doMoveItem(item, containerId) {
  movingItemId.value = null
  await vaultStore.moveVaultItem(item, containerId)
}

const GEM_NAMES = ['emerald', 'pearl', 'ruby', 'sapphire', 'diamond']

function calcContainerItemSlots(item) {
  const name = (item.name ?? '').toLowerCase()
  if (GEM_NAMES.some(g => name.includes(g))) return Math.ceil((item.quantity ?? 1) / 10)
  if (item.currency || ['gold coins', 'silver coins', 'copper coins'].some(c => name.includes(c))) {
    return Math.ceil((item.quantity ?? 1) / 100)
  }
  return (item.slots ?? 0) * (item.quantity ?? 1)
}

function containerSlotsUsed(containerId) {
  return vaultStore.items
    .filter(i => i.container_id === containerId)
    .reduce((s, i) => s + calcContainerItemSlots(i), 0)
}

async function openAddItem(containerId) {
  addItemContainerId.value = containerId
  newItemName.value  = ''
  newItemQty.value   = 1
  newItemSlots.value = 1
  newItemType.value  = 'sundry'
  await nextTick()
  const el = Array.isArray(itemNameInputs.value) ? itemNameInputs.value[0] : itemNameInputs.value
  el?.focus()
}

async function submitNewItem(containerId) {
  if (!newItemName.value.trim()) return
  await vaultStore.addToContainer(containerId, newItemName.value, newItemQty.value, newItemSlots.value, newItemType.value)
  newItemName.value        = ''
  newItemQty.value         = 1
  newItemSlots.value       = 1
  newItemType.value        = 'sundry'
  addItemContainerId.value = null
}
</script>

<style scoped>
.pn-panel {
  position: fixed;
  z-index: 90;
  background: var(--paper);
  background-image:
    radial-gradient(ellipse at 0% 0%, rgba(120,80,40,0.06), transparent 50%),
    radial-gradient(ellipse at 100% 100%, rgba(120,80,40,0.05), transparent 55%);
  border: 1px solid var(--ink);
  box-shadow:
    0 1px 0 rgba(255,255,255,0.5) inset,
    0 0 0 1px var(--paper-2) inset,
    0 14px 32px rgba(0,0,0,0.35),
    0 4px 10px rgba(0,0,0,0.18);
  display: flex;
  flex-direction: column;
  font-family: var(--font-body);
}

.pn-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px 8px 12px;
  background: var(--ink);
  color: var(--paper);
  cursor: grab;
  user-select: none;
  box-shadow: 0 1px 0 rgba(255,255,255,0.06) inset;
}
.pn-head:active { cursor: grabbing; }
.pn-head h4 {
  margin: 0;
  font-family: var(--font-display);
  font-style: italic;
  font-size: 19px;
  font-weight: 400;
  color: var(--paper);
  flex: 1;
}

.pn-tabs {
  display: flex;
  border-bottom: 1px solid var(--rule-strong);
  background: var(--paper-2);
}
.pn-tab {
  flex: 1;
  padding: 10px 6px 9px;
  background: transparent;
  border: none;
  font-family: var(--font-zine);
  font-size: 14px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--ink-soft);
  cursor: default;
  border-bottom: 2px solid transparent;
  transition: color 0.12s, border-color 0.12s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
}
.pn-tab:hover { color: var(--ink); }
.pn-tab.active {
  color: var(--ink);
  border-bottom-color: var(--ink);
  background: var(--paper);
}
.pn-badge {
  background: var(--ink-soft);
  color: var(--paper);
  font-family: var(--font-mono);
  font-size: 11px;
  border-radius: 8px;
  padding: 1px 5px;
  line-height: 1.4;
}
.pn-tab.active .pn-badge {
  background: var(--accent);
}

.pn-body {
  padding: 0 0 12px;
  overflow-y: auto;
  flex: 1;
  min-height: 0;
}

.pn-section-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px 6px;
  border-bottom: 1px solid var(--rule);
}
.pn-section-bar--completed { margin-top: 10px; }

.pn-count {
  font-family: var(--font-zine);
  font-size: 14px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--ink-soft);
}
.pn-count--btn {
  background: none;
  border: none;
  cursor: default;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0;
}
.pn-count--btn svg { transition: transform 0.15s; }

.pn-add-btn {
  font-family: var(--font-zine);
  font-size: 14px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--accent-2);
  background: none;
  border: none;
  cursor: default;
  padding: 2px 0;
}
.pn-add-btn:hover { color: var(--accent); }

.pn-empty {
  font-family: var(--font-body);
  font-style: italic;
  font-size: 16px;
  color: var(--ink-mute);
  text-align: center;
  padding: 16px 12px;
}


.pn-quest-card {
  margin: 8px 10px 0;
  border: 1px solid var(--rule-strong);
  background: var(--paper);
  padding: 10px 10px 8px;
}
.pn-quest-card--done {
  opacity: 0.55;
  padding: 7px 10px;
}
.pn-quest-card--done.pn-quest-card--expanded {
  opacity: 1;
  padding: 10px 10px 8px;
}
.pn-quest-title-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
}
.pn-quest-title-row--clickable { cursor: default; }
.pn-done-chevron {
  flex: 0 0 auto;
  color: var(--ink-mute);
  transition: transform 0.15s;
}
.pn-done-desc {
  font-family: var(--font-body);
  font-style: italic;
  font-size: 16px;
  color: var(--ink-soft);
  margin: 4px 0 8px;
  line-height: 1.5;
}
.pn-reactivate-btn {
  flex: 1;
  background: var(--paper-2);
  border: 1px solid var(--rule-strong);
  color: var(--ink-soft);
  font-family: var(--font-zine);
  font-size: 14px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  padding: 5px 8px;
  cursor: default;
  transition: background 0.1s, color 0.1s;
}
.pn-reactivate-btn:hover {
  background: var(--ink);
  color: var(--paper);
  border-color: var(--ink);
}
.pn-quest-title {
  flex: 1;
  background: none;
  border: none;
  font-family: var(--font-display);
  font-style: italic;
  font-size: 20px;
  color: var(--ink);
  padding: 0;
  outline: none;
  min-width: 0;
}
.pn-quest-title--done {
  text-decoration: line-through;
  color: var(--ink-mute);
  font-family: var(--font-display);
  font-style: italic;
  font-size: 16px;
}
.pn-progress-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 5px;
}
.pn-progress-bar {
  flex: 1;
  height: 7px;
  background: var(--rule-strong);
  border-radius: 4px;
  overflow: hidden;
}
.pn-progress-fill {
  height: 100%;
  background: var(--accent-3, #4a7c59);
  border-radius: 4px;
  transition: width 0.2s;
}
.pn-progress-label {
  font-family: var(--font-mono);
  font-size: 16px;
  color: var(--accent-3, #4a7c59);
  white-space: nowrap;
}
.pn-quest-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 5px;
}
.pn-quest-author {
  font-family: var(--font-zine);
  font-size: 14px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--ink-soft);
}
.pn-gm-badge {
  font-family: var(--font-zine);
  font-size: 13px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--accent-2);
  border: 1px solid var(--accent-2);
  border-radius: 2px;
  padding: 1px 4px;
}
.pn-quest-desc {
  width: 100%;
  box-sizing: border-box;
  background: none;
  border: none;
  border-bottom: 1px dashed var(--rule);
  font-family: var(--font-body);
  font-style: italic;
  font-size: 18px;
  color: var(--ink-soft);
  padding: 4px 0 6px;
  margin-bottom: 8px;
  resize: none;
  outline: none;
  line-height: 1.5;
}

.pn-goals-section { margin-bottom: 8px; }
.pn-goals-label {
  font-family: var(--font-zine);
  font-size: 14px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--ink-soft);
  margin-bottom: 4px;
}
.pn-goal-row {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-bottom: 3px;
}
.pn-goal-check {
  width: 14px;
  height: 14px;
  flex: 0 0 14px;
  border: 1.5px solid var(--ink-mute);
  border-radius: 2px;
  background: none;
  cursor: default;
  display: grid;
  place-items: center;
  padding: 0;
  transition: border-color 0.1s, background 0.1s;
}
.pn-goal-check.checked {
  border-color: var(--accent-3);
  background: var(--accent-3);
  color: white;
}
.pn-goal-text {
  flex: 1;
  background: none;
  border: none;
  font-family: var(--font-body);
  font-size: 18px;
  color: var(--ink);
  outline: none;
  padding: 0;
  min-width: 0;
}
.pn-goal-text.done {
  text-decoration: line-through;
  color: var(--ink-mute);
}
.pn-goal-del {
  background: none;
  border: none;
  color: var(--ink-mute);
  cursor: default;
  padding: 2px;
  opacity: 0;
  transition: opacity 0.1s;
}
.pn-goal-row:hover .pn-goal-del { opacity: 0.6; }
.pn-goal-del:hover { opacity: 1 !important; }

.pn-add-goal {
  background: none;
  border: none;
  font-family: var(--font-body);
  font-style: italic;
  font-size: 16px;
  color: var(--ink-soft);
  cursor: default;
  padding: 2px 0;
  margin-top: 2px;
}
.pn-add-goal:hover { color: var(--ink); }

.pn-reward-section {
  border-top: 1px dashed var(--rule);
  padding-top: 6px;
  margin-bottom: 8px;
}
.pn-reward-label {
  font-family: var(--font-zine);
  font-size: 14px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--ink-soft);
  margin-bottom: 5px;
}
.pn-reward-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 6px;
}
.pn-reward-item {
  display: flex;
  align-items: center;
  gap: 2px;
}
.pn-reward-chip {
  font-family: var(--font-body);
  font-size: 18px;
  color: var(--ink);
  background: var(--paper-2);
  border: 1px solid var(--rule-strong);
  border-radius: 2px;
  padding: 4px 10px;
  white-space: nowrap;
}
.pn-reward-chip--coins {
  color: #7a5c10;
  border-color: #a87c20;
}
.pn-reward-remove {
  background: none;
  border: none;
  color: var(--ink-mute);
  cursor: default;
  padding: 4px;
  display: grid;
  place-items: center;
  opacity: 0.3;
  transition: opacity 0.1s, color 0.1s;
}
.pn-reward-item:hover .pn-reward-remove { opacity: 0.7; }
.pn-reward-remove:hover { opacity: 1 !important; color: var(--accent); }
.pn-add-reward-btn {
  font-family: var(--font-body);
  font-style: italic;
  font-size: 16px;
  color: var(--ink-soft);
  background: none;
  border: none;
  cursor: default;
  padding: 2px 0;
}
.pn-add-reward-btn:hover { color: var(--ink); }
.pn-reward-type-picker {
  display: flex;
  align-items: center;
  gap: 5px;
}
.pn-reward-type-opt {
  font-family: var(--font-zine);
  font-size: 13px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  background: var(--paper-2);
  border: 1px solid var(--rule-strong);
  color: var(--ink);
  padding: 5px 12px;
  border-radius: 2px;
  cursor: default;
  transition: background 0.1s, color 0.1s;
}
.pn-reward-type-opt:hover {
  background: var(--ink);
  color: var(--paper);
  border-color: var(--ink);
}
.pn-reward-add-form {
  display: flex;
  align-items: center;
  gap: 5px;
}
.pn-reward-name-input {
  flex: 1;
  background: none;
  border: none;
  border-bottom: 1px solid var(--rule-strong);
  font-family: var(--font-body);
  font-size: 16px;
  color: var(--ink);
  padding: 2px 0;
  outline: none;
  min-width: 0;
}
.pn-reward-select {
  background: var(--paper-2);
  border: 1px solid var(--rule-strong);
  border-radius: 2px;
  font-family: var(--font-zine);
  font-size: 14px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--ink);
  padding: 4px 6px;
  outline: none;
  cursor: default;
}
.pn-reward-qty-input {
  width: 46px;
  flex: 0 0 46px;
  background: var(--paper-2);
  border: 1px solid var(--rule-strong);
  border-radius: 2px;
  font-family: var(--font-mono);
  font-size: 15px;
  color: var(--ink);
  padding: 3px 5px;
  text-align: center;
  outline: none;
}
.pn-reward-submit {
  background: var(--ink);
  color: var(--paper);
  border: none;
  font-family: var(--font-zine);
  font-size: 13px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  padding: 5px 10px;
  border-radius: 2px;
  cursor: default;
  flex: 0 0 auto;
  transition: opacity 0.12s;
}
.pn-reward-submit:hover { opacity: 0.8; }
.pn-reward-cancel {
  background: none;
  border: none;
  color: var(--ink-mute);
  font-size: 15px;
  cursor: default;
  padding: 2px 4px;
}
.pn-reward-cancel:hover { color: var(--accent); }

.pn-quest-footer {
  display: flex;
  align-items: center;
  gap: 6px;
}
.pn-complete-btn {
  flex: 1;
  background: var(--accent-3);
  border: none;
  color: white;
  font-family: var(--font-zine);
  font-size: 14px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  padding: 6px 8px;
  cursor: default;
  transition: opacity 0.12s;
}
.pn-complete-btn:hover { opacity: 0.85; }

.pn-del-btn {
  background: none;
  border: 1px solid var(--rule-strong);
  color: var(--ink-mute);
  width: 24px;
  height: 24px;
  display: grid;
  place-items: center;
  cursor: default;
  border-radius: 2px;
  flex: 0 0 auto;
  transition: color 0.1s, border-color 0.1s;
}
.pn-del-btn:hover { color: var(--accent); border-color: var(--accent); }

.pn-note-card {
  margin: 8px 10px 0;
  border: 1px solid var(--rule-strong);
  background: var(--paper);
  padding: 9px 10px 8px;
}
.pn-note-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 3px;
}
.pn-note-title {
  flex: 1;
  background: none;
  border: none;
  font-family: var(--font-display);
  font-style: italic;
  font-size: 20px;
  color: var(--ink);
  padding: 0;
  outline: none;
  min-width: 0;
  font-weight: 600;
}
.pn-note-author-badge {
  font-family: var(--font-zine);
  font-size: 13px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--paper);
  background: var(--bc, var(--ink-mute));
  border-radius: 2px;
  padding: 2px 6px;
  flex: 0 0 auto;
  max-width: 90px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pn-note-ts {
  font-family: var(--font-mono);
  font-size: 14px;
  color: var(--ink-soft);
  margin-bottom: 5px;
}
.pn-note-content {
  width: 100%;
  box-sizing: border-box;
  background: none;
  border: none;
  border-top: 1px dashed var(--rule);
  font-family: var(--font-body);
  font-size: 18px;
  color: var(--ink-soft);
  padding: 6px 0 0;
  resize: none;
  outline: none;
  line-height: 1.55;
  field-sizing: content;
  min-height: 4.65em;
}
.pn-note-title[readonly],
.pn-note-content[readonly] {
  cursor: default;
  caret-color: transparent;
}
.pn-note-title[readonly]::selection,
.pn-note-content[readonly]::selection {
  background: transparent;
}
.pn-editing-indicator {
  display: flex;
  align-items: center;
  gap: 5px;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--ink-soft);
  margin: 2px 0 4px;
}
.pn-editing-dot {
  flex: 0 0 auto;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--accent, #4a7c59);
  animation: pn-editing-pulse 1.4s ease-in-out infinite;
}
@keyframes pn-editing-pulse {
  0%, 100% { opacity: 0.35; }
  50%       { opacity: 1; }
}


.pv-section-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 7px 12px 6px;
  border-bottom: 1px solid var(--rule-strong);
  background: var(--paper-2);
}
.pv-section-bar--storage { margin-top: 4px; }

.pv-section-toggle {
  display: flex;
  align-items: center;
  gap: 5px;
  background: none;
  border: none;
  padding: 0;
  cursor: default;
  color: inherit;
}
.pv-section-toggle svg {
  transition: transform 0.15s;
  color: var(--ink-mute);
  flex: 0 0 auto;
}
.pv-section-title {
  font-family: var(--font-zine);
  font-size: 14px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--ink-soft);
}
.pv-badge {
  background: var(--ink);
  color: var(--paper);
  font-family: var(--font-mono);
  font-size: 11px;
  border-radius: 8px;
  padding: 1px 5px;
  line-height: 1.4;
}
.pv-add-btn {
  font-family: var(--font-zine);
  font-size: 14px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--accent-2);
  background: none;
  border: none;
  cursor: default;
  padding: 2px 0;
}
.pv-add-btn:hover { color: var(--accent); }

.pv-empty {
  font-family: var(--font-body);
  font-style: italic;
  font-size: 18px;
  color: var(--ink-soft);
  text-align: center;
  padding: 12px 12px;
}
.pv-empty--sm {
  font-size: 16px;
  padding: 6px 24px;
  text-align: left;
}

.pv-add-form {
  padding: 8px 12px 6px;
  border-bottom: 1px solid var(--rule);
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.pv-add-form--indent { padding-left: 24px; }
.pv-input {
  width: 100%;
  box-sizing: border-box;
  background: var(--paper-2);
  border: 1px solid var(--rule-strong);
  border-radius: 2px;
  font-family: var(--font-body);
  font-size: 16px;
  color: var(--ink);
  padding: 5px 8px;
  outline: none;
}
.pv-input:focus { border-color: var(--ink-soft); }
.pv-input--qty {
  width: 60px;
  flex: 0 0 60px;
  text-align: center;
}
.pv-currency-select {
  font-family: var(--font-zine);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  cursor: default;
}
.pv-form-row {
  display: flex;
  align-items: center;
  gap: 6px;
}
.pv-form-label {
  font-family: var(--font-zine);
  font-size: 14px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ink-soft);
  flex: 0 0 auto;
}
.pv-submit-btn {
  flex: 1;
  background: var(--ink);
  color: var(--paper);
  border: none;
  font-family: var(--font-zine);
  font-size: 14px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  padding: 5px 8px;
  cursor: default;
  border-radius: 2px;
  transition: opacity 0.12s;
}
.pv-submit-btn:hover { opacity: 0.8; }
.pv-cancel-btn {
  background: none;
  border: 1px solid var(--rule-strong);
  color: var(--ink-mute);
  width: 26px;
  height: 26px;
  display: grid;
  place-items: center;
  cursor: default;
  border-radius: 2px;
  font-size: 14px;
  flex: 0 0 auto;
}
.pv-cancel-btn:hover { color: var(--accent); border-color: var(--accent); }

.pv-loot-card {
  margin: 8px 10px 0;
  border: 1px solid var(--rule-strong);
  background: var(--paper);
  padding: 10px 10px 8px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.07);
}
.pv-loot-main {
  display: flex;
  align-items: baseline;
  gap: 5px;
  margin-bottom: 2px;
}
.pv-loot-qty {
  font-family: var(--font-mono);
  font-size: 16px;
  color: var(--ink-soft);
  flex: 0 0 auto;
}
.pv-loot-name {
  font-family: var(--font-display);
  font-style: italic;
  font-size: 19px;
  color: var(--ink);
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pv-loot-notes {
  font-family: var(--font-body);
  font-size: 15px;
  color: var(--ink-soft);
  margin-bottom: 1px;
}
.pv-loot-by {
  font-family: var(--font-zine);
  font-size: 14px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ink-soft);
  margin-bottom: 6px;
}

.pv-split-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 0;
  margin-bottom: 4px;
  border-top: 1px dashed var(--rule);
  border-bottom: 1px dashed var(--rule);
}
.pv-stash-row { flex-wrap: wrap; gap: 4px; }
.pv-split-info {
  font-family: var(--font-mono);
  font-size: 15px;
  color: var(--ink-soft);
  flex: 1;
}
.pv-split-info--warn { color: var(--accent); }
.pv-split-confirm {
  background: var(--accent-3, #4a7c59);
  color: white;
  border: none;
  font-family: var(--font-zine);
  font-size: 13px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  padding: 5px 10px;
  border-radius: 2px;
  cursor: default;
  transition: opacity 0.12s;
  white-space: nowrap;
}
.pv-split-confirm:disabled { opacity: 0.4; cursor: not-allowed; }
.pv-split-confirm:not(:disabled):hover { opacity: 0.8; }
.pv-split-confirm--danger { background: var(--accent, #a0392a); }
.pv-split-cancel {
  background: none;
  border: none;
  color: var(--ink-mute);
  font-size: 13px;
  cursor: default;
  padding: 2px 4px;
  flex: 0 0 auto;
}
.pv-split-cancel:hover { color: var(--accent); }

.pv-stash-option {
  background: var(--paper-2);
  border: 1px solid var(--rule-strong);
  color: var(--ink);
  font-family: var(--font-zine);
  font-size: 13px;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  padding: 4px 8px;
  border-radius: 2px;
  cursor: default;
  transition: background 0.1s, color 0.1s;
  white-space: nowrap;
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.pv-stash-option:hover {
  background: var(--ink);
  color: var(--paper);
  border-color: var(--ink);
}

.pv-loot-actions {
  display: flex;
  gap: 4px;
}
.pv-action {
  flex: 1;
  background: var(--paper-2);
  border: 1px solid var(--rule-strong);
  color: var(--ink);
  font-family: var(--font-zine);
  font-size: 13px;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  padding: 4px 2px;
  border-radius: 2px;
  cursor: default;
  transition: background 0.1s, color 0.1s, border-color 0.1s;
  white-space: nowrap;
}
.pv-action:not(:disabled):hover {
  background: var(--ink);
  color: var(--paper);
  border-color: var(--ink);
}
.pv-action:disabled { opacity: 0.35; cursor: not-allowed; }
.pv-action--split.active,
.pv-action.active {
  background: var(--ink);
  color: var(--paper);
  border-color: var(--ink);
}
.pv-action--danger:not(:disabled):hover {
  background: var(--accent);
  color: white;
  border-color: var(--accent);
}

.pv-storage-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  border-bottom: 1px solid var(--rule);
}
.pv-storage-row--indent { padding-left: 24px; }
.pv-storage-qty {
  font-family: var(--font-mono);
  font-size: 15px;
  color: var(--ink-soft);
  flex: 0 0 auto;
}
.pv-storage-name {
  flex: 1;
  font-family: var(--font-body);
  font-size: 18px;
  color: var(--ink);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pv-storage-remove {
  background: none;
  border: none;
  color: var(--ink-mute);
  cursor: default;
  padding: 2px;
  display: grid;
  place-items: center;
  opacity: 0;
  transition: opacity 0.1s, color 0.1s;
  flex: 0 0 auto;
}
.pv-storage-row:hover .pv-storage-remove { opacity: 0.6; }
.pv-storage-remove:hover { opacity: 1 !important; color: var(--accent); }
.pv-storage-remove--visible { opacity: 0.5; }

.pv-container-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px 5px 12px;
  border-bottom: 1px solid var(--rule);
  background: var(--paper-2);
}
.pv-container-name {
  font-family: var(--font-body);
  font-size: 18px;
  color: var(--ink);
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pv-container-slots {
  font-family: var(--font-mono);
  font-size: 14px;
  color: var(--ink-soft);
  flex: 0 0 auto;
  white-space: nowrap;
}
.pv-confirm-row { padding: 5px 12px; }

.pv-container-add-row {
  padding: 4px 12px 4px 24px;
  border-bottom: 1px solid var(--rule);
}

.pv-container-slot-bar {
  height: 4px;
  background: var(--paper-3, #d8c69e);
  overflow: hidden;
}
.pv-container-slot-fill {
  height: 100%;
  transition: width 0.3s ease;
}

.pv-gear-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 12px 7px 24px;
  border-bottom: 1px solid var(--rule);
  background: var(--paper);
}
.pv-gear-item:hover .pv-storage-remove,
.pv-gear-item:hover .pv-gear-edit-btn { opacity: 0.6; }
.pv-gear-edit-btn {
  background: none;
  border: none;
  color: var(--ink-mute);
  cursor: default;
  padding: 2px;
  display: grid;
  place-items: center;
  opacity: 0;
  transition: opacity 0.1s, color 0.1s;
  flex: 0 0 auto;
}
.pv-gear-edit-btn:hover { opacity: 1 !important; color: var(--ink); }
.pv-gear-edit-btn:disabled { cursor: not-allowed; }
.pv-gear-edit-btn:disabled:hover { opacity: 0.6 !important; color: var(--ink-mute); }
.pv-gear-main { flex: 1; min-width: 0; }
.pv-gear-name {
  font-family: var(--font-body);
  font-size: 18px;
  font-weight: 600;
  color: var(--ink);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.pv-gear-sub {
  font-family: var(--font-body);
  font-size: 15px;
  color: var(--ink-soft);
  margin-top: 1px;
}
.pv-gear-badge {
  font-family: var(--font-zine);
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  padding: 2px 6px;
  border: 1px solid;
  flex-shrink: 0;
  align-self: flex-start;
}
.pv-gear-badge.weapon {
  background: rgba(138, 28, 28, 0.1);
  color: #8a1c1c;
  border-color: rgba(138, 28, 28, 0.3);
}
.pv-gear-badge.armor {
  background: rgba(44, 82, 102, 0.1);
  color: #2c5266;
  border-color: rgba(44, 82, 102, 0.3);
}
.pv-gear-badge.sundry {
  background: var(--paper-3, #d8ccb4);
  color: var(--ink-mute);
  border-color: var(--rule);
}

.pv-slots-stepper {
  display: flex;
  align-items: center;
  gap: 0;
  border: 1px solid var(--rule-strong);
  border-radius: 2px;
  overflow: hidden;
  flex: 0 0 auto;
}
.pv-slots-stepper button {
  background: var(--paper-2);
  border: none;
  color: var(--ink);
  font-size: 18px;
  width: 24px;
  height: 28px;
  cursor: default;
  line-height: 1;
  transition: background 0.1s;
}
.pv-slots-stepper button:hover { background: var(--paper-3); }
.pv-slots-stepper span {
  font-family: var(--font-mono);
  font-size: 16px;
  color: var(--ink);
  min-width: 24px;
  text-align: center;
  padding: 0 4px;
}
.pv-item-type-select {
  flex: 1;
  font-family: var(--font-zine);
  font-size: 13px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--ink);
  cursor: default;
}

.pv-loot-qty--coins { color: var(--gold, #c8a84b); }

.pv-bank-btns { display: flex; gap: 8px; }

.pv-bank-coins-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1px;
  background: var(--rule-strong);
  border-bottom: 1px solid var(--rule-strong);
}
.pv-bank-coin {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 10px 8px;
  background: var(--paper);
}
.pv-coin-icon {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-mono);
  font-size: 13px;
  font-weight: 700;
  flex-shrink: 0;
}
.pv-coin-amount {
  font-family: var(--font-mono);
  font-size: 25px;
  font-weight: 700;
  color: var(--ink);
  line-height: 1;
}
.pv-coin-label {
  font-family: var(--font-zine);
  font-size: 11px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--ink-mute);
}

.pv-type-row {
  display: flex;
  gap: 4px;
}
.pv-type-btn {
  flex: 1;
  font-family: var(--font-zine);
  font-size: 13px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  background: var(--paper-2);
  border: 1px solid var(--rule-strong);
  color: var(--ink-soft);
  padding: 3px 6px;
  border-radius: 2px;
  cursor: default;
  transition: background 0.1s, color 0.1s;
}
.pv-type-btn.active {
  background: var(--ink);
  color: var(--paper);
  border-color: var(--ink);
}

.pv-assign-row { flex-wrap: wrap; gap: 4px 6px; padding: 6px 0; }
.pv-assign-chars {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  width: 100%;
}
.pv-assign-char {
  font-family: var(--font-zine);
  font-size: 13px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  background: var(--paper-2);
  border: 1px solid var(--rule-strong);
  color: var(--ink);
  padding: 4px 8px;
  border-radius: 2px;
  cursor: default;
  transition: background 0.1s, color 0.1s, border-color 0.1s;
  display: flex;
  align-items: center;
  white-space: nowrap;
}
.pv-assign-char.active {
  background: var(--ink);
  color: var(--paper);
  border-color: var(--ink);
}
.pv-assign-char:disabled { opacity: 0.3; cursor: not-allowed; }
.pv-assign-n { font-family: var(--font-mono); font-size: 11px; }


.pv-ledger-entry {
  display: flex;
  align-items: baseline;
  gap: 6px;
  padding: 5px 12px;
  border-bottom: 1px solid var(--rule);
}
.pv-ledger-who {
  font-family: var(--font-display);
  font-style: italic;
  font-size: 16px;
  color: var(--ink);
  flex: 0 0 auto;
  max-width: 100px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pv-ledger-desc {
  font-family: var(--font-zine);
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ink-mute);
  flex: 1;
}
.pv-ledger-change {
  font-family: var(--font-mono);
  font-size: 14px;
  font-weight: 700;
  flex: 0 0 auto;
}
.pv-ledger-ts {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--ink-mute);
  flex: 0 0 auto;
  white-space: nowrap;
}

.pn-resize-handle {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 20px;
  height: 20px;
  cursor: nwse-resize;
  display: grid;
  place-items: center;
  color: var(--ink-mute);
  opacity: 0.35;
  transition: opacity 0.15s;
}
.pn-resize-handle:hover { opacity: 0.8; }
</style>
