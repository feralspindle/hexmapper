import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '@/lib/supabase'
import { realtime } from '@/lib/realtime.js'
import { apiClient, ApiError } from '@/lib/apiClient.js'

export const useActivityStore = defineStore('activity', () => {
  const activities = ref([])
  let channel = null
  let _dungeonId = null

  async function _fetchActivities(dungeonId) {
    const { data } = await supabase
      .from('dungeon_activity')
      .select('*')
      .eq('dungeon_id', dungeonId)
      .order('created_at', { ascending: false })
      .limit(100)
    return data
  }

  async function refresh() {
    const dungeonId = _dungeonId
    if (!dungeonId) return
    const data = await _fetchActivities(dungeonId)
    if (data && _dungeonId === dungeonId) activities.value = data
  }

  async function init(sessionId, dungeonId) {
    _dungeonId = dungeonId
    if (channel) realtime.removeChannel(channel)

    const data = await _fetchActivities(dungeonId)
    if (_dungeonId === dungeonId) activities.value = data ?? []

    channel = realtime
      .channel(`dungeon:${dungeonId}:activity`, { sessionId, onReconnect: () => refresh() })
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'dungeon_activity', filter: `dungeon_id=eq.${dungeonId}` },
        ({ new: row }) => {
          if (!activities.value.some(a => a.id === row.id)) {
            activities.value = [row, ...activities.value].slice(0, 100)
          }
        },
      )
      .subscribe()
  }

  async function record(verb, what) {
    if (!_dungeonId) return

    let data
    try {
      data = await apiClient.post('/dungeon-activity', {
        dungeon_id: _dungeonId,
        verb,
        what: what ?? '',
      })
    } catch (error) {
      console.error('activityStore.record:', error instanceof ApiError ? error.message : error)
      return
    }

    if (!activities.value.some(a => a.id === data.id)) {
      activities.value = [data, ...activities.value].slice(0, 100)
    }
  }

  function cleanup() {
    if (channel) { realtime.removeChannel(channel); channel = null }
    activities.value = []
    _dungeonId = null
  }

  return { activities, init, refresh, record, cleanup }
})
