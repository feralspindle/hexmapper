import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { createSessionChannel } from '@/lib/sessionChannel.js'
import { apiClient, ApiError } from '@/lib/apiClient.js'

export const useCompendiumStore = defineStore('compendium', () => {
  const entries = ref([])
  const error = ref(null)

  const session = createSessionChannel()

  const gear = computed(() => entries.value.filter(e => e.kind === 'gear'))
  const spells = computed(() => entries.value.filter(e => e.kind === 'spell'))

  async function init(sessionId) {
    if (session.key === sessionId) return
    cleanup()
    const generation = session.begin(sessionId)
    session.open(`compendium:${sessionId}`, { sessionId, refresh }, ch => ch
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'compendium_entries',
        filter: `session_id=eq.${sessionId}`,
      }, (payload) => {
        if (payload.eventType === 'DELETE') {
          entries.value = entries.value.filter(e => e.id !== payload.old?.id)
          return
        }
        const row = payload.new
        if (!row?.id) return
        const idx = entries.value.findIndex(e => e.id === row.id)
        if (idx === -1) entries.value = [...entries.value, row]
        else entries.value = entries.value.map(e => (e.id === row.id ? row : e))
      }))
    await refresh(generation)
  }

  async function refresh(generation = session.generation) {
    const sessionId = session.key
    if (!sessionId) return
    try {
      const rows = (await apiClient.get(`/compendium-entries?session_id=${sessionId}`)) ?? []
      if (!session.isCurrent(generation)) return
      entries.value = rows
    } catch (err) {
      _fail('refresh', err)
    }
  }

  function cleanup() {
    session.close()
    entries.value = []
    error.value = null
  }

  async function removeEntry(id) {
    const backup = entries.value.find(e => e.id === id)
    entries.value = entries.value.filter(e => e.id !== id)
    try {
      await apiClient.delete(`/compendium-entries/${id}`, 'compendium_delete')
    } catch (err) {
      if (backup && !entries.value.some(e => e.id === id)) {
        entries.value = [...entries.value, backup]
      }
      _fail('delete', err)
    }
  }

  function _fail(what, err) {
    error.value = err instanceof ApiError ? err.message : String(err)
    console.error(`compendiumStore.${what}:`, error.value)
  }

  return {
    entries,
    gear,
    spells,
    error,
    init,
    refresh,
    cleanup,
    removeEntry,
  }
})
