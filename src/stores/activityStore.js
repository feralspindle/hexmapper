import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '@/lib/supabase'
import { createSessionChannel } from '@/lib/sessionChannel.js'
import { mergeRealtimeSnapshot } from '@/lib/realtimeProtocol.js'
import { apiClient, ApiError } from '@/lib/apiClient.js'

const FEED_LIMIT = 100

export const useActivityStore = defineStore('activity', () => {
  const activities = ref([])
  const session = createSessionChannel()

  async function refresh(generation = session.generation) {
    const dungeonId = session.key
    if (!dungeonId) return
    const { data } = await supabase
      .from('dungeon_activity')
      .select('*')
      .eq('dungeon_id', dungeonId)
      .order('created_at', { ascending: false })
      .limit(FEED_LIMIT)
    if (!data || !session.isCurrent(generation)) return
    activities.value = mergeRealtimeSnapshot(data, activities.value, FEED_LIMIT)
  }

  async function init(sessionId, dungeonId) {
    const generation = session.begin(dungeonId)
    activities.value = []

    session.open(`dungeon:${dungeonId}:activity`, { sessionId, refresh }, ch => ch
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'dungeon_activity', filter: `dungeon_id=eq.${dungeonId}` },
        ({ new: row }) => {
          if (!activities.value.some(a => a.id === row.id)) {
            activities.value = [row, ...activities.value].slice(0, FEED_LIMIT)
          }
        },
      ))

    return refresh(generation)
  }

  async function record(verb, what) {
    if (!session.key) return

    let data
    try {
      data = await apiClient.post('/dungeon-activity', {
        dungeon_id: session.key,
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
    session.close()
    activities.value = []
  }

  return { activities, init, refresh, record, cleanup }
})
