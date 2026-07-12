import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { supabase } from '@/lib/supabase'
import { createSessionChannel } from '@/lib/sessionChannel.js'
import { mergeRealtimeSnapshot } from '@/lib/realtimeProtocol.js'
import { apiClient, ApiError } from '@/lib/apiClient.js'
import { useAuthStore } from '@/stores/authStore.js'
import { playDiceSound } from '@/lib/diceSound.js'
import { withRollStreaks } from '@/lib/diceStreaks.js'

const HISTORY_LIMIT = 60

export const useDiceStore = defineStore('dice', () => {
  const rolls       = ref([])
  const annotations = ref({})
  const pendingRoll = ref(null)
  const latestRoll  = ref(null)
  const rollsWithStreaks = computed(() => withRollStreaks(rolls.value))
  const session = createSessionChannel()

  async function refreshHistory(generation = session.generation) {
    const sessionId = session.key
    if (!sessionId) return
    const { data } = await supabase
      .from('dice_rolls')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false })
      .limit(HISTORY_LIMIT)

    if (!session.isCurrent(generation) || !data) return

    rolls.value = mergeRealtimeSnapshot(data, rolls.value, HISTORY_LIMIT)

    const rollIds = rolls.value.map(r => r.id)
    if (rollIds.length) {
      const { data: anns } = await supabase
        .from('dice_roll_annotations')
        .select('*')
        .in('roll_id', rollIds)
        .order('created_at', { ascending: true })

      if (session.isCurrent(generation) && anns) {
        const map = { ...annotations.value }
        for (const annotation of anns) {
          const existing = map[annotation.roll_id] ?? []
          if (!existing.some(item => item.id === annotation.id)) {
            map[annotation.roll_id] = [...existing, annotation]
          }
        }
        annotations.value = map
      }
    }
  }

  async function init(sessionId) {
    if (session.key === sessionId) return
    cleanup()
    const generation = session.begin(sessionId)

    session.open(`dice:${sessionId}`, { sessionId, refresh: refreshHistory }, ch => ch
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'dice_rolls', filter: `session_id=eq.${sessionId}` },
        ({ new: row }) => {
          const authStore = useAuthStore()
          if (row.user_id === authStore.user?.id || rolls.value.some(roll => roll.id === row.id)) return
          rolls.value = [row, ...rolls.value].slice(0, HISTORY_LIMIT)
          latestRoll.value = row
          playDiceSound()
        },
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'dice_roll_annotations', filter: `session_id=eq.${sessionId}` },
        ({ new: row }) => {
          const existing = annotations.value[row.roll_id] ?? []
          if (existing.some(a => a.id === row.id)) return
          annotations.value = {
            ...annotations.value,
            [row.roll_id]: [...existing, row],
          }
        },
      ))

    return refreshHistory(generation)
  }

  async function rollDice(pending, modifier, label = null, characterId = null) {
    if (pendingRoll.value) return

    pendingRoll.value = {
      pending: { ...pending },
      modifier,
      label,
    }

    try {
      const data = await apiClient.post('/dice-rolls', {
        session_id:   session.key,
        pending,
        modifier:     modifier ?? 0,
        label:        label ?? null,
        character_id: characterId ?? null,
      }, 'roll_dice')

      rolls.value = [data, ...rolls.value].slice(0, HISTORY_LIMIT)
      latestRoll.value = data
      playDiceSound()
      return data
    } catch (error) {
      console.error('rollDice:', error instanceof ApiError ? error.message : error)
      return
    } finally {
      pendingRoll.value = null
    }
  }

  async function addAnnotation(rollId, body) {
    const authStore = useAuthStore()
    if (!body.trim() || !session.key) return

    const tempId = `pending-${crypto.randomUUID()}`
    const tempAnn = {
      id:           tempId,
      roll_id:      rollId,
      session_id:   session.key,
      user_id:      authStore.user?.id,
      display_name: authStore.displayName,
      body:         body.trim(),
      created_at:   new Date().toISOString(),
    }

    const existing = annotations.value[rollId] ?? []
    annotations.value = { ...annotations.value, [rollId]: [...existing, tempAnn] }

    try {
      const data = await apiClient.post('/dice-roll-annotations', {
        roll_id:    rollId,
        session_id: session.key,
        body:       body.trim(),
      }, 'add_annotation')
      annotations.value = {
        ...annotations.value,
        [rollId]: (annotations.value[rollId] ?? []).map(a => a.id === tempId ? data : a),
      }
    } catch (error) {
      annotations.value = {
        ...annotations.value,
        [rollId]: (annotations.value[rollId] ?? []).filter(a => a.id !== tempId),
      }
      console.error('addAnnotation:', error instanceof ApiError ? error.message : error)
    }
  }

  function cleanup() {
    session.close()
    rolls.value       = []
    annotations.value = {}
    pendingRoll.value = null
    latestRoll.value  = null
  }

  return { rolls, rollsWithStreaks, annotations, pendingRoll, latestRoll, init, rollDice, addAnnotation, cleanup }
})
