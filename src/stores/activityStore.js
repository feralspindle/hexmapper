import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore.js'

export const useActivityStore = defineStore('activity', () => {
  const activities = ref([])
  let channel = null
  let _dungeonId = null

  async function init(sessionId, dungeonId) {
    _dungeonId = dungeonId
    if (channel) supabase.removeChannel(channel)

    const { data } = await supabase
      .from('dungeon_activity')
      .select('*')
      .eq('dungeon_id', dungeonId)
      .order('created_at', { ascending: false })
      .limit(100)

    activities.value = data ?? []

    channel = supabase
      .channel(`dungeon:${dungeonId}:activity`)
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
    const authStore = useAuthStore()
    const item = {
      dungeon_id:   _dungeonId,
      user_id:      authStore.user?.id ?? null,
      display_name: authStore.displayName ?? 'Someone',
      verb,
      what,
    }

    const { data, error } = await supabase
      .from('dungeon_activity')
      .insert(item)
      .select()
      .single()

    if (error) { console.error('activityStore.record:', error.message); return }
    if (!activities.value.some(a => a.id === data.id)) {
      activities.value = [data, ...activities.value].slice(0, 100)
    }
  }

  function cleanup() {
    if (channel) { supabase.removeChannel(channel); channel = null }
    activities.value = []
    _dungeonId = null
  }

  return { activities, init, record, cleanup }
})
