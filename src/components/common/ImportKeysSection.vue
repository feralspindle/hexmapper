<template>
  <div class="ds-panel-section" :class="{ collapsed: !open }">
    <div class="ds-section-head" @click="toggleOpen">
      <i class="fa-solid fa-key" style="flex:0 0 auto" />
      <h3>Import keys</h3>
      <span class="ds-meta">{{ keys.length ? `${keys.length} active` : 'none' }}</span>
      <svg class="ds-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <path d="M6 9l6 6 6-6"/>
      </svg>
    </div>

    <div v-show="open" class="ik-body">
      <p class="ik-hint">
        Keys let a local tool push tables, monsters, characters, and compendium
        entries into this session over the API. Treat them like passwords.
      </p>

      <div v-if="freshKey" class="ik-fresh">
        <span class="ds-field-label">New key - copy it now, it is never shown again</span>
        <div class="ik-fresh-row">
          <code class="ik-fresh-key" data-testid="import-key-fresh">{{ freshKey }}</code>
          <button type="button" class="ds-btn tiny" data-testid="import-key-copy" @click="copyFreshKey">
            <i class="fa-solid" :class="copied ? 'fa-check' : 'fa-copy'" />
            <span>{{ copied ? 'Copied' : 'Copy' }}</span>
          </button>
        </div>
      </div>

      <div
        v-for="key in keys"
        :key="key.id"
        class="ik-row"
        data-testid="import-key-row"
      >
        <div class="ik-row-main">
          <span class="ik-name">{{ key.name }}</span>
          <span class="ik-meta">{{ key.key_prefix }}… · {{ lastUsed(key) }}</span>
        </div>
        <button
          type="button"
          class="hm-card-icon-btn hm-card-icon-btn--danger"
          title="Revoke key"
          data-testid="import-key-revoke"
          @click="confirmRevoke(key)"
        >
          <i class="fa-solid fa-ban" />
        </button>
      </div>

      <div class="ik-mint">
        <input
          v-model="newName"
          class="ds-input"
          maxlength="80"
          placeholder="Key name, e.g. my-familiar"
          data-testid="import-key-name"
          @keydown.enter.prevent="mint"
        />
        <button type="button" class="ds-btn tiny" :disabled="!newName.trim() || minting" data-testid="import-key-mint" @click="mint">
          <i class="fa-solid fa-plus" />
          <span>Mint</span>
        </button>
      </div>
      <p v-if="error" class="ik-error">{{ error }}</p>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useSessionStore } from '@/stores/sessionStore.js'
import { useConfirmDialog } from '@/composables/useConfirmDialog.js'
import { useTimeAgo } from '@/composables/useTimeAgo.js'
import { apiClient, ApiError } from '@/lib/apiClient.js'

const sessionStore = useSessionStore()
const { confirm } = useConfirmDialog()
const { timeAgo } = useTimeAgo()

const open = ref(false)
const keys = ref([])
const loaded = ref(false)
const newName = ref('')
const freshKey = ref('')
const copied = ref(false)
const minting = ref(false)
const error = ref('')

function toggleOpen() {
  open.value = !open.value
  if (open.value && !loaded.value) load()
}

async function load() {
  try {
    keys.value = (await apiClient.get(`/import-keys?session_id=${sessionStore.sessionId}`)) ?? []
    loaded.value = true
    error.value = ''
  } catch (err) {
    _fail(err)
  }
}

async function mint() {
  const name = newName.value.trim()
  if (!name || minting.value) return
  minting.value = true
  try {
    const row = await apiClient.post('/import-keys', {
      session_id: sessionStore.sessionId,
      name,
    }, 'mint_import_key')
    freshKey.value = row.key
    copied.value = false
    newName.value = ''
    keys.value = [...keys.value, row]
    error.value = ''
  } catch (err) {
    _fail(err)
  } finally {
    minting.value = false
  }
}

async function copyFreshKey() {
  try {
    await navigator.clipboard.writeText(freshKey.value)
    copied.value = true
  } catch {
    copied.value = false
  }
}

function confirmRevoke(key) {
  confirm(
    `Revoke "${key.name}"? Anything still using it stops working immediately.`,
    async () => {
      try {
        await apiClient.delete(`/import-keys/${key.id}`, 'revoke_import_key')
        keys.value = keys.value.filter(k => k.id !== key.id)
      } catch (err) {
        _fail(err)
      }
    },
  )
}

function lastUsed(key) {
  return key.last_used_at ? `used ${timeAgo(key.last_used_at)}` : 'never used'
}

function _fail(err) {
  error.value = err instanceof ApiError ? err.message : String(err)
}
</script>

<style scoped>
.ik-body {
  padding: 8px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ik-hint {
  font-family: var(--font-body);
  font-style: italic;
  font-size: 12px;
  color: var(--ink-mute);
  margin: 0;
}

.ik-fresh {
  border: 1px solid var(--accent-2);
  border-left-width: 3px;
  padding: 6px 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  background: var(--paper);
}

.ik-fresh-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.ik-fresh-key {
  flex: 1;
  min-width: 0;
  font-family: var(--font-mono);
  font-size: 11px;
  overflow-wrap: anywhere;
  user-select: all;
}

.ik-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.ik-row-main {
  flex: 1;
  min-width: 0;
}

.ik-name {
  display: block;
  font-family: var(--font-display);
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ik-meta {
  display: block;
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--ink-mute);
}

.ik-mint {
  display: flex;
  align-items: center;
  gap: 6px;
  border-top: 1px solid var(--rule);
  padding-top: 8px;
}

.ik-mint .ds-input {
  flex: 1;
  min-width: 0;
  padding: 4px 6px;
  font-size: 12px;
}

.ik-error {
  font-size: 11px;
  color: var(--accent);
  margin: 0;
}
</style>
