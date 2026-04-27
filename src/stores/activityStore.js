import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore.js'

export const useActivityStore = defineStore('activity', () => {
  const activities = ref([])
  let channel = null
  let _dungeonId = null

  function init(sessionId, dungeonId) {
    _dungeonId = dungeonId
    if (channel) supabase.removeChannel(channel)

    channel = supabase
      .channel(`dungeon:${dungeonId}:activity`)
      .on('broadcast', { event: 'activity' }, ({ payload }) => {
        activities.value = [payload, ...activities.value].slice(0, 60)
      })
      .subscribe()
  }

  async function record(verb, what) {
    if (!channel) return
    const authStore = useAuthStore()
    const item = {
      id:     crypto.randomUUID(),
      who:    authStore.displayName ?? 'Someone',
      userId: authStore.user?.id ?? null,
      verb,
      what,
      at:     new Date().toISOString(),
    }
    activities.value = [item, ...activities.value].slice(0, 60)
    await channel.send({ type: 'broadcast', event: 'activity', payload: item })
  }

  function cleanup() {
    if (channel) { supabase.removeChannel(channel); channel = null }
    activities.value = []
    _dungeonId = null
  }

  return { activities, init, record, cleanup }
})
