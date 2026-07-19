import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { createSessionChannel } from '@/lib/sessionChannel.js'
import { apiClient, ApiError } from '@/lib/apiClient.js'

export const STAT_KEYS = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA']

export function blankStatBlock(name = '') {
  return {
    name,
    level: 1,
    alignment: 'N',
    ac: 10,
    maxHp: 4,
    currentHp: 4,
    move: 'near',
    attacks: '',
    stats: { STR: 0, DEX: 0, CON: 0, INT: 0, WIS: 0, CHA: 0 },
    notes: '',
  }
}

const SAVE_DEBOUNCE_MS = 800

export const useStatBlockStore = defineStore('statBlock', () => {
  const blocks = ref([])
  const error = ref(null)

  const session = createSessionChannel()
  const _saveTimers = new Map()

  const npcs = computed(() => blocks.value.filter(b => b.kind === 'npc'))
  const monsters = computed(() => blocks.value.filter(b => b.kind === 'monster'))

  async function init(sessionId) {
    if (session.key === sessionId) return
    cleanup()
    const generation = session.begin(sessionId)
    session.open(`stat-blocks:${sessionId}`, { sessionId, refresh }, ch => ch
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'stat_blocks',
        filter: `session_id=eq.${sessionId}`,
      }, (payload) => {
        if (payload.eventType === 'DELETE') {
          blocks.value = blocks.value.filter(b => b.id !== payload.old?.id)
          return
        }
        const row = payload.new
        if (!row?.id) return
        // a pending debounced save means our local blob is newer than any echo
        if (_saveTimers.has(row.id)) return
        _apply(row)
      }))
    await refresh(generation)
  }

  async function refresh(generation = session.generation) {
    const sessionId = session.key
    if (!sessionId) return
    try {
      const rows = (await apiClient.get(`/stat-blocks?session_id=${sessionId}`)) ?? []
      if (!session.isCurrent(generation)) return
      const pending = blocks.value.filter(b => _saveTimers.has(b.id))
      blocks.value = rows.map(row => pending.find(b => b.id === row.id) ?? row)
    } catch (err) {
      _fail('refresh', err)
    }
  }

  function cleanup() {
    for (const id of _saveTimers.keys()) _flushSave(id)
    session.close()
    blocks.value = []
    error.value = null
  }

  async function createBlock(kind, data) {
    if (!session.key) return null
    try {
      const row = await apiClient.post('/stat-blocks', {
        session_id: session.key,
        kind,
        data,
      }, 'stat_block_create')
      _apply(row)
      return row
    } catch (err) {
      _fail('create', err)
      return null
    }
  }

  function updateData(id, patch) {
    const block = blocks.value.find(b => b.id === id)
    if (!block) return
    block.data = { ...block.data, ...patch }
    _scheduleSave(id)
  }

  function adjustHp(id, delta) {
    const block = blocks.value.find(b => b.id === id)
    if (!block) return
    const max = Number(block.data?.maxHp) || 0
    const current = Number(block.data?.currentHp) || 0
    updateData(id, { currentHp: Math.min(max, Math.max(0, current + delta)) })
  }

  async function duplicateBlock(id) {
    const block = blocks.value.find(b => b.id === id)
    if (!block) return null
    return createBlock(block.kind, { ...block.data })
  }

  async function removeBlock(id) {
    _cancelSave(id)
    blocks.value = blocks.value.filter(b => b.id !== id)
    try {
      await apiClient.delete(`/stat-blocks/${id}`, 'stat_block_delete')
    } catch (err) {
      _fail('delete', err)
      await refresh()
    }
  }

  function _scheduleSave(id) {
    _cancelSave(id)
    _saveTimers.set(id, setTimeout(() => _flushSave(id), SAVE_DEBOUNCE_MS))
  }

  function _cancelSave(id) {
    const timer = _saveTimers.get(id)
    if (timer) clearTimeout(timer)
    _saveTimers.delete(id)
  }

  function _flushSave(id) {
    _cancelSave(id)
    const block = blocks.value.find(b => b.id === id)
    if (!block) return
    apiClient.patch(`/stat-blocks/${id}`, { data: block.data }, 'stat_block_update')
      .catch(err => _fail('save', err))
  }

  function _apply(row) {
    if (!row?.id) return
    const idx = blocks.value.findIndex(b => b.id === row.id)
    if (idx === -1) blocks.value = [...blocks.value, row]
    else blocks.value = blocks.value.map(b => (b.id === row.id ? row : b))
  }

  function _fail(what, err) {
    error.value = err instanceof ApiError ? err.message : String(err)
    console.error(`statBlockStore.${what}:`, error.value)
  }

  return {
    blocks,
    npcs,
    monsters,
    error,
    init,
    refresh,
    cleanup,
    createBlock,
    updateData,
    adjustHp,
    duplicateBlock,
    removeBlock,
  }
})
