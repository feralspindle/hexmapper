<template>
  <div v-if="statBlock" style="display:flex;flex-direction:column;gap:12px" data-testid="token-inspector-statblock">
    <div style="display:flex;align-items:center;gap:10px">
      <div class="ds-token-portrait" :style="{ borderColor: statBlockColor }">
        <span>{{ (statBlock.data?.name || '?').slice(0, 1).toUpperCase() }}</span>
      </div>
      <div style="min-width:0">
        <div style="font-family:var(--font-display);font-size:15px;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
          {{ statBlock.data?.name || 'Unnamed' }}
        </div>
        <div style="font-family:var(--font-mono);font-size:10px;color:var(--ink-mute);letter-spacing:.04em">
          {{ statBlock.kind }} · AC {{ statBlock.data?.ac ?? '?' }} · LV {{ statBlock.data?.level ?? '?' }}
        </div>
      </div>
    </div>

    <div>
      <label class="ds-field-label">Hit Points</label>
      <div style="display:flex;align-items:center;gap:8px">
        <button class="ds-btn tiny" data-testid="token-hp-minus" @click="statBlockStore.adjustHp(statBlock.id, -1)">−</button>
        <div style="flex:1">
          <div class="ds-token-hpbar">
            <div class="ds-token-hpbar-fill" :style="{ width: `${statBlockHpPct * 100}%`, background: statBlockHpColor }" />
          </div>
          <div style="font-family:var(--font-mono);font-size:11px;color:var(--ink-2);text-align:center;margin-top:3px" data-testid="token-hp-readout">
            {{ statBlock.data?.currentHp ?? 0 }} / {{ statBlock.data?.maxHp ?? 0 }}
          </div>
        </div>
        <button class="ds-btn tiny" data-testid="token-hp-plus" @click="statBlockStore.adjustHp(statBlock.id, 1)">+</button>
      </div>
    </div>

    <div v-if="statBlock.data?.attacks" class="ds-dims-readout">
      <span style="font-family:var(--font-zine);font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--ink-mute)">ATK</span>
      <span style="font-family:var(--font-body);font-size:12px">{{ statBlock.data.attacks }}</span>
    </div>
    <div v-if="statBlock.data?.move" class="ds-dims-readout">
      <span style="font-family:var(--font-zine);font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--ink-mute)">MV</span>
      <span style="font-family:var(--font-body);font-size:12px">{{ statBlock.data.move }}</span>
    </div>

    <button
      class="ds-btn tiny"
      style="align-self:flex-start"
      data-testid="token-remove"
      @click="dungeonStore.removeToken(token.id)"
    >Remove from map</button>
  </div>

  <div v-else-if="character" style="display:flex;flex-direction:column;gap:12px" data-testid="token-inspector">

    <div style="display:flex;align-items:center;gap:10px">
      <div class="ds-token-portrait" :style="{ borderColor: ringColor }">
        <img v-if="imageUrl" :src="imageUrl" alt="" />
        <span v-else>{{ (character.data?.name || '?').slice(0, 1).toUpperCase() }}</span>
      </div>
      <div style="min-width:0">
        <div style="font-family:var(--font-display);font-size:15px;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
          {{ character.data?.name || 'Unnamed' }}
        </div>
        <div style="font-family:var(--font-mono);font-size:10px;color:var(--ink-mute);letter-spacing:.04em">
          {{ [character.data?.ancestry, character.data?.class].filter(Boolean).join(' ') || 'adventurer' }}
        </div>
      </div>
    </div>

    <label v-if="canEdit" class="ds-token-upload">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/>
      </svg>
      {{ imageUrl ? 'Replace token image' : 'Upload token image' }}
      <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" style="display:none" data-testid="token-image-input" @change="onImageChange" />
    </label>
    <p v-if="uploadError" style="font-family:var(--font-mono);font-size:10px;color:var(--accent);margin:0">{{ uploadError }}</p>

    <div>
      <label class="ds-field-label">Hit Points</label>
      <div style="display:flex;align-items:center;gap:8px">
        <button v-if="canEdit" class="ds-btn tiny" data-testid="token-hp-minus" @click="adjustHp(-1)">−</button>
        <div style="flex:1">
          <div class="ds-token-hpbar">
            <div class="ds-token-hpbar-fill" :style="{ width: `${hpPct * 100}%`, background: hpColor }" />
          </div>
          <div style="font-family:var(--font-mono);font-size:11px;color:var(--ink-2);text-align:center;margin-top:3px" data-testid="token-hp-readout">
            {{ currentHp }} / {{ maxHp }}
          </div>
        </div>
        <button v-if="canEdit" class="ds-btn tiny" data-testid="token-hp-plus" @click="adjustHp(1)">+</button>
      </div>
    </div>

    <div class="ds-dims-readout">
      <span style="font-family:var(--font-zine);font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--ink-mute)">Initiative</span>
      <span style="background:var(--paper);border:1px solid var(--rule-strong);padding:3px 8px;letter-spacing:.04em" data-testid="token-initiative">
        {{ character.data?.initiative ?? '—' }}
      </span>
    </div>

    <div>
      <label class="ds-field-label">Conditions</label>
      <div v-if="conditions.length" style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:8px">
        <span
          v-for="cond in conditions"
          :key="cond.name"
          class="ds-token-cond"
          :style="{ '--cond-color': cond.color }"
          data-testid="token-condition"
        >
          <i :class="cond.faClass" style="font-size:10px" />
          {{ cond.name }}
          <button v-if="canEdit" class="ds-x-btn" style="width:14px;height:14px;font-size:10px" @click="removeCondition(cond.name)">×</button>
        </span>
      </div>
      <div v-else style="font-family:var(--font-body);font-style:italic;font-size:12px;color:var(--ink-mute);margin-bottom:8px">
        none
      </div>

      <template v-if="canEdit">
        <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px">
          <button
            v-for="preset in availablePresets"
            :key="preset.name"
            class="ds-btn tiny"
            :data-testid="`token-preset-${preset.name}`"
            @click="addCondition(preset.name)"
          >{{ preset.name }}</button>
        </div>
        <div style="display:flex;gap:6px">
          <input
            v-model="customCondition"
            class="ds-input"
            placeholder="Custom (e.g. in hell)"
            data-testid="token-custom-condition"
            @keydown.enter="addCustomCondition"
          />
          <button class="ds-btn tiny" :disabled="!customCondition.trim()" data-testid="token-add-condition" @click="addCustomCondition">Add</button>
        </div>
      </template>
    </div>

    <button
      v-if="canEdit"
      class="ds-btn tiny"
      style="align-self:flex-start"
      data-testid="token-remove"
      @click="dungeonStore.removeToken(token.id)"
    >Remove from map</button>
  </div>

  <div v-else-if="token.stat_block_id" style="font-family:var(--font-body);font-style:italic;font-size:13px;color:var(--ink-mute)">
    This token's stat block was deleted.
  </div>

  <div v-else style="font-family:var(--font-body);font-style:italic;font-size:13px;color:var(--ink-mute)">
    This token's character is no longer in the party.
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useD } from '@/stores/dungeonStore.js'
import { useCharacterStore } from '@/stores/characterStore.js'
import { useStatBlockStore, STAT_BLOCK_TOKEN_COLORS } from '@/stores/statBlockStore.js'
import { useSessionStore } from '@/stores/sessionStore.js'
import { useAuthStore } from '@/stores/authStore.js'
import { playerColorFor } from '@/composables/usePlayerColor.js'
import { COMMON_CONDITIONS, conditionBadge, normalizeCondition } from '@/lib/conditions.js'
import { uploadTokenImage, tokenImageUrl } from '@/lib/tokenImage.js'

const props = defineProps({
  token: { type: Object, required: true },
})

const dungeonStore = useD()
const characterStore = useCharacterStore()
const statBlockStore = useStatBlockStore()
const sessionStore = useSessionStore()
const authStore = useAuthStore()

const customCondition = ref('')
const uploadError = ref('')

const character = computed(() =>
  characterStore.characters.find(c => c.id === props.token.character_id) ?? null
)
const statBlock = computed(() =>
  props.token.stat_block_id
    ? statBlockStore.blocks.find(b => b.id === props.token.stat_block_id) ?? null
    : null
)
const statBlockColor = computed(() =>
  STAT_BLOCK_TOKEN_COLORS[statBlock.value?.kind] ?? STAT_BLOCK_TOKEN_COLORS.monster
)
const statBlockHpPct = computed(() => {
  const max = Number(statBlock.value?.data?.maxHp) || 0
  const current = Number(statBlock.value?.data?.currentHp) || 0
  return max > 0 ? Math.max(0, Math.min(1, current / max)) : 0
})
const statBlockHpColor = computed(() =>
  statBlockHpPct.value > 0.5 ? '#6ebe5a' : statBlockHpPct.value > 0.25 ? '#e0a83c' : '#c83c32'
)
const canEdit = computed(() =>
  sessionStore.isGM || character.value?.user_id === authStore.user?.id
)
const ringColor = computed(() => playerColorFor(character.value?.user_id))
const imageUrl = computed(() => tokenImageUrl(character.value?.data?.tokenImagePath))

const maxHp = computed(() => character.value?.data?.maxHitPoints ?? 0)
const currentHp = computed(() => character.value?.data?.currentHp ?? maxHp.value)
const hpPct = computed(() => maxHp.value > 0 ? Math.max(0, Math.min(1, currentHp.value / maxHp.value)) : 0)
const hpColor = computed(() => hpPct.value > 0.5 ? '#6ebe5a' : hpPct.value > 0.25 ? '#e0a83c' : '#c83c32')

const conditions = computed(() =>
  (character.value?.data?.conditions ?? []).map(conditionBadge)
)
const availablePresets = computed(() => {
  const active = new Set(character.value?.data?.conditions ?? [])
  return COMMON_CONDITIONS.filter(c => !active.has(c.name))
})

function adjustHp(delta) {
  if (!character.value) return
  characterStore.adjustHpForChar(character.value.id, delta)
}

function addCondition(name) {
  if (!character.value) return
  const normalized = normalizeCondition(name)
  if (!normalized) return
  const current = character.value.data?.conditions ?? []
  if (current.includes(normalized)) return
  characterStore.updateFieldForChar(character.value.id, 'conditions', [...current, normalized])
}

function addCustomCondition() {
  addCondition(customCondition.value)
  customCondition.value = ''
}

function removeCondition(name) {
  if (!character.value) return
  const current = character.value.data?.conditions ?? []
  characterStore.updateFieldForChar(character.value.id, 'conditions', current.filter(c => c !== name))
}

async function onImageChange(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file || !character.value) return
  uploadError.value = ''
  try {
    const path = await uploadTokenImage(file, sessionStore.sessionId)
    characterStore.updateFieldForChar(character.value.id, 'tokenImagePath', path)
  } catch (err) {
    uploadError.value = err.message ?? 'Upload failed'
  }
}
</script>

<style scoped>
.ds-token-portrait {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  border: 2px solid var(--rule-strong);
  background: var(--paper-2);
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-display);
  font-size: 18px;
  color: var(--ink-2);
  flex: 0 0 auto;
}
.ds-token-portrait img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.ds-token-upload {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 5px 10px;
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: .04em;
  color: var(--ink-2);
  background: var(--paper-2);
  border: 1px solid var(--rule-strong);
  border-radius: 2px;
  cursor: pointer;
  transition: background .15s, color .15s;
}
.ds-token-upload:hover { background: var(--paper-3); color: var(--ink); }

.ds-token-hpbar {
  height: 6px;
  border-radius: 3px;
  background: var(--paper-2);
  border: 1px solid var(--rule-strong);
  overflow: hidden;
}
.ds-token-hpbar-fill {
  height: 100%;
  transition: width .15s;
}

.ds-token-cond {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 7px;
  border-radius: 10px;
  border: 1px solid var(--cond-color);
  color: var(--ink);
  background: var(--paper-2);
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: .02em;
}
.ds-token-cond i { color: var(--cond-color); }
</style>
