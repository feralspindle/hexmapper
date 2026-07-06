import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '@/lib/supabase'
import { realtime } from '@/lib/realtime.js'
import { mergeRealtimeSnapshot } from '@/lib/realtimeProtocol.js'
import { apiClient, ApiError } from '@/lib/apiClient.js'

const FEED_LIMIT = 100

export const useActivityStore = defineStore('activity', () => {
  const activities = ref([])
  let channel = null
  let _dungeonId = null
  let _initGeneration = 0

  async function refresh(generation = _initGeneration) {
    const dungeonId = _dungeonId
    if (!dungeonId) return
    const { data } = await supabase
      .from('dungeon_activity')
      .select('*')
      .eq('dungeon_id', dungeonId)
      .order('created_at', { ascending: false })
      .limit(FEED_LIMIT)
    if (!data || _dungeonId !== dungeonId || generation !== _initGeneration) return
    activities.value = mergeRealtimeSnapshot(data, activities.value, FEED_LIMIT)
  }

  async function init(sessionId, dungeonId) {
    const generation = ++_initGeneration
    _dungeonId = dungeonId
    activities.value = []
    if (channel) { realtime.removeChannel(channel); channel = null }

    let subscribedRefreshed = false
    channel = realtime
      .channel(`dungeon:${dungeonId}:activity`, { sessionId, onReconnect: () => refresh(generation) })
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'dungeon_activity', filter: `dungeon_id=eq.${dungeonId}` },
        ({ new: row }) => {
          if (!activities.value.some(a => a.id === row.id)) {
            activities.value = [row, ...activities.value].slice(0, FEED_LIMIT)
          }
        },
      )
      .subscribe(status => {
        if (status !== 'SUBSCRIBED' || subscribedRefreshed) return
        subscribedRefreshed = true
        void refresh(generation)
      })

    return refresh(generation)
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
      activities.value = [data, ...activities.value].slice(0, FEED_LIMIT)
    }
  }

  function cleanup() {
    _initGeneration += 1
    if (channel) { realtime.removeChannel(channel); channel = null }
    activities.value = []
    _dungeonId = null
  }

  return { activities, init, refresh, record, cleanup }
})
