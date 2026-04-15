import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore.js'

const DICE_ORDER = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100']
const HISTORY_LIMIT = 60

export const useDiceStore = defineStore('dice', () => {
  const rolls       = ref([])
  const annotations = ref({})
  let channel = null
  let currentSessionId = null

  async function init(sessionId) {
    if (currentSessionId === sessionId) return
    cleanup()
    currentSessionId = sessionId

    const { data } = await supabase
      .from('dice_rolls')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false })
      .limit(HISTORY_LIMIT)

    if (data) {
      rolls.value = data

      const rollIds = data.map(r => r.id)
      if (rollIds.length) {
        const { data: anns } = await supabase
          .from('dice_roll_annotations')
          .select('*')
          .in('roll_id', rollIds)
          .order('created_at', { ascending: true })

        if (anns) {
          const map = {}
          for (const a of anns) {
            if (!map[a.roll_id]) map[a.roll_id] = []
            map[a.roll_id].push(a)
          }
          annotations.value = map
        }
      }
    }

    channel = supabase
      .channel(`dice:${sessionId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'dice_rolls', filter: `session_id=eq.${sessionId}` },
        ({ new: row }) => {
          const authStore = useAuthStore()
          if (row.user_id === authStore.user?.id) return
          rolls.value = [row, ...rolls.value].slice(0, HISTORY_LIMIT)
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
      )
      .subscribe()
  }

  async function rollDice(pending, modifier, label = null, characterId = null) {
    const authStore = useAuthStore()
    const results = []
    let total = modifier

    for (const die of DICE_ORDER) {
      const count = pending[die] ?? 0
      const sides = parseInt(die.slice(1))
      for (let i = 0; i < count; i++) {
        const val = Math.floor(Math.random() * sides) + 1
        results.push({ die, value: val })
        total += val
      }
    }

    const optimisticId = crypto.randomUUID()
    const optimistic = {
      id: optimisticId,
      session_id: currentSessionId,
      user_id: authStore.user?.id,
      display_name: authStore.displayName,
      character_id: characterId,
      pending: { ...pending },
      modifier,
      results,
      total,
      label,
      created_at: new Date().toISOString(),
    }

    rolls.value = [optimistic, ...rolls.value].slice(0, HISTORY_LIMIT)

    const { data, error } = await supabase
      .from('dice_rolls')
      .insert({
        session_id: currentSessionId,
        user_id: authStore.user?.id,
        display_name: authStore.displayName ?? 'Adventurer',
        character_id: characterId,
        pending: { ...pending },
        modifier,
        results,
        total,
        label,
      })
      .select()
      .single()

    if (error) {
      rolls.value = rolls.value.filter(r => r.id !== optimisticId)
      console.error('rollDice error:', error.message)
    } else {
      rolls.value = rolls.value.map(r => (r.id === optimisticId ? data : r))
    }
  }

  async function addAnnotation(rollId, body) {
    const authStore = useAuthStore()
    if (!body.trim() || !currentSessionId) return

    const tempId = `pending-${crypto.randomUUID()}`
    const tempAnn = {
      id:           tempId,
      roll_id:      rollId,
      session_id:   currentSessionId,
      user_id:      authStore.user?.id,
      display_name: authStore.displayName,
      body:         body.trim(),
      created_at:   new Date().toISOString(),
    }

    const existing = annotations.value[rollId] ?? []
    annotations.value = { ...annotations.value, [rollId]: [...existing, tempAnn] }

    const { data, error } = await supabase
      .from('dice_roll_annotations')
      .insert({
        roll_id:      rollId,
        session_id:   currentSessionId,
        user_id:      authStore.user?.id,
        display_name: authStore.displayName,
        body:         body.trim(),
      })
      .select()
      .single()

    if (error) {
      annotations.value = {
        ...annotations.value,
        [rollId]: (annotations.value[rollId] ?? []).filter(a => a.id !== tempId),
      }
      console.error('addAnnotation:', error.message)
    } else {
      annotations.value = {
        ...annotations.value,
        [rollId]: (annotations.value[rollId] ?? []).map(a => a.id === tempId ? data : a),
      }
    }
  }

  function cleanup() {
    if (channel) {
      supabase.removeChannel(channel)
      channel = null
    }
    rolls.value       = []
    annotations.value = {}
    currentSessionId  = null
  }

  return { rolls, annotations, init, rollDice, addAnnotation, cleanup }
})
