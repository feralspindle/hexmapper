<template>

  <button
    v-if="hidden"
    class="ds-party-reopen"
    :style="{ left: `${pos.x}px`, top: `${pos.y + 32}px` }"
    @click="hidden = false"
  >
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>
    </svg>
    Party · {{ onlineCount }}
  </button>

  <div
    v-else
    class="ds-party-panel"
    :style="{ left: `${pos.x}px`, top: `${pos.y}px` }"
  >

    <div
      class="ds-party-head"
      @mousedown="startDrag"
    >

      <div class="ds-grip">
        <span v-for="i in 6" :key="i" />
      </div>

      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" style="color:var(--paper-3);flex:0 0 auto">
        <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>
      </svg>

      <h4>The Party</h4>
      <span class="ds-party-meta">{{ onlineCount }} online</span>


      <button
        class="ds-panel-action"
        :style="collapsed ? 'transform:rotate(-90deg)' : ''"
        @click.stop="collapsed = !collapsed"
      >
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M6 9l6 6 6-6"/></svg>
      </button>


      <button class="ds-panel-action" @click.stop="hidden = true">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
      </button>
    </div>

    <div v-if="!collapsed" class="ds-party-body">
      <div v-if="!partyCards.length" style="font-family:var(--font-body);font-style:italic;font-size:13px;color:var(--ink-mute);text-align:center;padding:16px 0">
        No party members yet
      </div>
      <div class="ds-party-grid">
        <div
          v-for="char in partyCards"
          :key="char.id"
          class="ds-player-card"
          :class="{ me: char.user_id === authStore.user?.id }"
          :style="{ '--player-color': charColor(char.user_id) }"
        >
          <div style="display:flex;align-items:center;gap:6px">
            <div class="ds-pc-dot" />
            <span class="ds-pc-name">{{ char.data?.name ?? 'Unnamed' }}</span>
            <div v-if="isOnline(char.user_id)" class="ds-online-dot" style="margin-left:auto" title="Online" />
          </div>

          <div class="ds-pc-role">{{ charRole(char) }}</div>

   
          <div v-if="char.data?.maxHitPoints" class="ds-hp-row">
            <span style="min-width:30px">{{ char.data?.currentHp ?? char.data?.maxHitPoints ?? '—' }}/{{ char.data?.maxHitPoints }}</span>
            <div class="ds-hp-bar">
              <span :style="{ width: hpPct(char) + '%' }" />
            </div>
            <span v-if="char.data?.armorClass" style="min-width:22px;text-align:right">AC {{ char.data.armorClass }}</span>
          </div>

          <div v-else-if="isGM(char)" style="font-family:var(--font-zine);font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:var(--ink-mute)">
            Game Master
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useCharacterStore } from '@/stores/characterStore.js'
import { useSessionStore } from '@/stores/sessionStore.js'
import { useAuthStore } from '@/stores/authStore.js'
import { playerColorFor } from '@/composables/usePlayerColor.js'

const characterStore = useCharacterStore()
const sessionStore   = useSessionStore()
const authStore      = useAuthStore()

const STORAGE_KEY = 'dm.partyPanel.pos'
const DEFAULT_POS = { x: 80, y: 88 }

const pos      = ref({ ...DEFAULT_POS })
const collapsed = ref(false)
const hidden    = ref(false)

onMounted(() => {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
    if (saved?.x !== undefined) pos.value = saved
  } catch {}
})

function persistPos() { localStorage.setItem(STORAGE_KEY, JSON.stringify(pos.value)) }


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
  persistPos()
  window.removeEventListener('mousemove', onDragMove)
  window.removeEventListener('mouseup', onDragUp)
}
onUnmounted(() => {
  window.removeEventListener('mousemove', onDragMove)
  window.removeEventListener('mouseup', onDragUp)
})

const onlineUserIds = computed(() => new Set(sessionStore.onlineUsers.map(u => u.user_id).filter(Boolean)))
const onlineCount   = computed(() => onlineUserIds.value.size)

const partyCards = computed(() => {
  const selectionMap = new Map(
    characterStore.memberSelections
      .filter(m => m.active_character_id)
      .map(m => [m.user_id, m.active_character_id])
  )
  if (authStore.user?.id && characterStore.activeId) {
    selectionMap.set(authStore.user.id, characterStore.activeId)
  }

  const result = []
  const seen = new Set()

  for (const [userId, charId] of selectionMap) {
    const char = characterStore.characters.find(c => c.id === charId && c.user_id === userId)
    if (char && !seen.has(userId)) { result.push(char); seen.add(userId) }
  }

  for (const char of [...characterStore.characters].reverse()) {
    if (!seen.has(char.user_id)) { result.push(char); seen.add(char.user_id) }
  }

  return result
})

function isOnline(userId) { return userId && onlineUserIds.value.has(userId) }
function isGM(char) { return char.user_id === sessionStore.sessionOwnerId }

function charColor(userId) {
  if (!userId) return 'var(--ink-mute)'
  return playerColorFor(userId)
}

function charRole(char) {
  const d = char.data
  if (!d) return ''
  const parts = [d.ancestry, d.class ?? d.characterClass].filter(Boolean)
  if (d.level) parts.push(`Lvl ${d.level}`)
  return parts.join(' · ') || (isGM(char) ? 'Dungeon Master' : '')
}

function hpPct(char) {
  const max = char.data?.maxHitPoints ?? 0
  if (!max) return 0
  return Math.round(Math.min(100, Math.max(0, ((char.data?.currentHp ?? max) / max) * 100)))
}
</script>
