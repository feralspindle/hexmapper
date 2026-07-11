import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { supabase } from '@/lib/supabase'
import { useDiceStore } from '@/stores/diceStore.js'
import { useSessionStore } from '@/stores/sessionStore.js'
import { splitTonight, rankPlayers, rankSkills, bestPlayerPerSkill, longestStreaks } from '@/lib/diceStats.js'

// deep history for the leaderboard, well past diceStore's 60-roll feed. a table
// that ever passes this means all-time quietly becomes "last 1000".
const HISTORY_LIMIT = 1000

const COLUMNS = 'id, user_id, display_name, character_id, total, label, stats, created_at'

export const useDiceStatsStore = defineStore('diceStats', () => {
  const diceStore = useDiceStore()
  const sessionStore = useSessionStore()

  const rolls = ref([])
  let currentSessionId = null
  let loadGeneration = 0

  async function init(sessionId) {
    if (currentSessionId === sessionId) return
    cleanup()
    currentSessionId = sessionId
    const generation = loadGeneration

    const { data } = await supabase
      .from('dice_rolls')
      .select(COLUMNS)
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false })
      .limit(HISTORY_LIMIT)

    if (currentSessionId !== sessionId || generation !== loadGeneration || !data) return
    rolls.value = data
  }

  // diceStore sets latestRoll for every new roll (own via rollDice, others via
  // realtime), so leaning on it keeps the leaderboard live without a second
  // postgres_changes subscription on the same table.
  watch(() => diceStore.latestRoll, (roll) => {
    if (!roll || !currentSessionId) return
    if (rolls.value.some(r => r.id === roll.id)) return
    rolls.value = [roll, ...rolls.value].slice(0, HISTORY_LIMIT)
  })

  function cleanup() {
    loadGeneration += 1
    rolls.value = []
    currentSessionId = null
  }

  const split = computed(() => splitTonight(rolls.value))
  const ownerId = computed(() => sessionStore.sessionOwnerId)

  const leaderboardTonight = computed(() => rankPlayers(split.value.tonight, { ownerId: ownerId.value }))
  const leaderboardAllTime = computed(() => rankPlayers(split.value.all, { ownerId: ownerId.value }))
  const skillsTonight      = computed(() => rankSkills(split.value.tonight))
  const skillsAllTime      = computed(() => rankSkills(split.value.all))
  const bestAtTonight      = computed(() => bestPlayerPerSkill(split.value.tonight))
  const bestAtAllTime      = computed(() => bestPlayerPerSkill(split.value.all))
  const streaksTonight     = computed(() => longestStreaks(split.value.tonight))
  const streaksAllTime     = computed(() => longestStreaks(split.value.all))

  return {
    rolls,
    init,
    cleanup,
    leaderboardTonight,
    leaderboardAllTime,
    skillsTonight,
    skillsAllTime,
    bestAtTonight,
    bestAtAllTime,
    streaksTonight,
    streaksAllTime,
  }
})
