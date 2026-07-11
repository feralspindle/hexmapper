<template>
  <div class="ds-panel-section" :class="{ collapsed: !open }">
    <div class="ds-section-head" @click="open = !open">
      <i class="fa-solid fa-fire" style="flex:0 0 auto" />
      <h3>Lights</h3>
      <span class="ds-meta">{{ lightStore.activeSources.length }} burning</span>
      <svg class="ds-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <path d="M6 9l6 6 6-6"/>
      </svg>
    </div>

    <div v-show="open" class="lights-body">
      <div v-if="!lightStore.sources.length" class="lights-empty">
        No light sources. Light one before the dark notices.
      </div>

      <div
        v-for="source in lightStore.sources"
        :key="source.id"
        class="lights-row"
        :class="{ 'lights-row--expired': source.expired }"
        data-testid="light-source"
      >
        <div class="lights-meta">
          <span class="lights-name">
            <i :class="kindIcon(source.kind)" />
            {{ source.name }}
          </span>
          <span class="ds-meta">
            {{ characterName(source.attached_character_id) }}
          </span>
        </div>

        <span class="lights-clock" data-testid="light-remaining">
          <template v-if="source.expired">out</template>
          <template v-else-if="source.mode === 'rounds'">{{ lightStore.remaining(source) }} rd</template>
          <template v-else>{{ formatMs(lightStore.remaining(source)) }}</template>
        </span>

        <div class="lights-actions">
          <template v-if="source.mode === 'real_time' && !source.expired">
            <button
              type="button"
              class="hm-card-icon-btn"
              :title="source.running ? 'Pause' : 'Start'"
              data-testid="light-toggle"
              @click="lightStore.control(source.id, source.running ? 'pause' : 'start')"
            >
              <i :class="source.running ? 'fa-solid fa-pause' : 'fa-solid fa-play'" />
            </button>
          </template>
          <button
            v-if="source.mode === 'rounds' && !source.expired"
            type="button"
            class="hm-card-icon-btn"
            title="Burn one round"
            data-testid="light-tick"
            @click="lightStore.tick(source.id, 1)"
          >
            <i class="fa-solid fa-minus" />
          </button>
          <button
            type="button"
            class="hm-card-icon-btn"
            title="Reset"
            data-testid="light-reset"
            @click="lightStore.control(source.id, 'reset')"
          >
            <i class="fa-solid fa-rotate-left" />
          </button>
          <button
            type="button"
            class="hm-card-icon-btn hm-card-icon-btn--danger"
            title="Remove"
            data-testid="light-remove"
            @click="lightStore.removeSource(source.id)"
          >
            <i class="fa-solid fa-xmark" />
          </button>
        </div>
      </div>

      <div class="lights-add">
        <select v-model="presetKind" class="ds-input lights-add-kind" data-testid="light-kind">
          <option v-for="preset in LIGHT_PRESETS" :key="preset.kind" :value="preset.kind">
            {{ preset.label }}
          </option>
        </select>
        <select v-model="mode" class="ds-input lights-add-mode" data-testid="light-mode" title="Real time burns by the clock, rounds burn when the round tracker advances">
          <option value="real_time">clock</option>
          <option value="rounds">rounds</option>
        </select>
        <select v-model="attachTo" class="ds-input lights-add-attach" data-testid="light-attach" title="Who carries it">
          <option value="">unattached</option>
          <option v-for="c in characterStore.characters" :key="c.id" :value="c.id">
            {{ c.data?.name ?? 'Unnamed' }}
          </option>
        </select>
        <button type="button" class="ds-btn tiny" data-testid="light-add" @click="addLight">
          <i class="fa-solid fa-fire" />
          <span>Light</span>
        </button>
      </div>
      <p v-if="lightStore.error" class="lights-error">{{ lightStore.error }}</p>
    </div>
  </div>
</template>

<script setup>
import { onMounted, ref, watch } from 'vue'
import { useLightStore, LIGHT_PRESETS } from '@/stores/lightStore.js'
import { useSessionStore } from '@/stores/sessionStore.js'
import { useCharacterStore } from '@/stores/characterStore.js'

const lightStore = useLightStore()
const sessionStore = useSessionStore()
const characterStore = useCharacterStore()

const open = ref(true)
const presetKind = ref('torch')
const mode = ref('real_time')
const attachTo = ref('')

onMounted(() => {
  if (sessionStore.sessionId) lightStore.init(sessionStore.sessionId)
})

watch(() => sessionStore.sessionId, (id) => {
  if (id) lightStore.init(id)
})

function addLight() {
  const preset = LIGHT_PRESETS.find(p => p.kind === presetKind.value) ?? LIGHT_PRESETS[0]
  lightStore.createSource({
    name: preset.label,
    kind: preset.kind,
    mode: mode.value,
    duration_ms: preset.duration_ms,
    duration_rounds: preset.duration_rounds,
    attached_character_id: attachTo.value || null,
  })
}

function kindIcon(kind) {
  if (kind === 'lantern') return 'fa-solid fa-lightbulb'
  if (kind === 'light_spell') return 'fa-solid fa-wand-sparkles'
  return 'fa-solid fa-fire'
}

function characterName(id) {
  if (!id) return ''
  const c = characterStore.characters.find(c => c.id === id)
  return c?.data?.name ?? ''
}

function formatMs(ms) {
  const total = Math.ceil(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}
</script>

<style scoped>
.lights-body {
  padding: 8px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.lights-empty,
.lights-error {
  font-family: var(--font-body);
  font-style: italic;
  font-size: 13px;
  color: var(--ink-mute);
  text-align: center;
  padding: 6px 0;
}

.lights-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.lights-row--expired {
  opacity: 0.55;
}

.lights-meta {
  flex: 1;
  min-width: 0;
}

.lights-name {
  display: block;
  font-family: var(--font-display);
  font-size: 14px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lights-name i {
  margin-right: 4px;
  color: var(--accent-2);
}

.lights-clock {
  font-family: var(--font-mono, monospace);
  font-size: 13px;
  flex: 0 0 auto;
}

.lights-actions {
  display: flex;
  gap: 2px;
  flex: 0 0 auto;
}

.lights-add {
  display: flex;
  gap: 4px;
  align-items: center;
  border-top: 1px solid var(--rule);
  padding-top: 8px;
  margin-top: 2px;
}

.lights-add-kind,
.lights-add-mode,
.lights-add-attach {
  flex: 1;
  min-width: 0;
  padding: 4px 6px;
  font-size: 12px;
}
</style>
