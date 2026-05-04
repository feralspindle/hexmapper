import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore.js'

export function statMod(value) {
  return Math.floor((value - 10) / 2)
}

export function parseDamageDie(str) {
  if (!str) return null
  const match = str.trim().match(/^(\d*)d(\d+)([+-]\d+)?$/i)
  if (!match) return null
  return {
    count:    parseInt(match[1] || '1', 10),
    sides:    parseInt(match[2], 10),
    modifier: match[3] ? parseInt(match[3], 10) : 0,
  }
}

export function parseAttack(str) {
  const colonIdx = str.indexOf(':')
  const label = colonIdx >= 0 ? str.slice(0, colonIdx).trim() : str
  const bonusMatch = str.match(/([+-]\d+)/)
  const bonus = bonusMatch ? parseInt(bonusMatch[1], 10) : 0
  return { label, bonus, raw: str }
}

export const useCharacterStore = defineStore('character', () => {
  // Keyed save timers so editing char A then switching to char B doesn't cancel A's save
  const _saveTimers = new Map()
  let _realtimeChannel = null

  const characters = ref([])
  const activeId = ref(null)
  const loading = ref(false)
  const saving = ref(false)
  const currentSessionId = ref(null)
  // user_id → active_character_id, loaded from session_members
  const memberSelections = ref([])

  const activeCharacter = computed(() =>
    characters.value.find(c => c.id === activeId.value) ?? null
  )

  const character = computed(() => activeCharacter.value?.data ?? null)

  const canEditActiveCharacter = computed(() => {
    const authStore = useAuthStore()
    if (!activeCharacter.value) return false
    return activeCharacter.value.user_id === authStore.user?.id
  })

  const myCharacters = computed(() => {
    const authStore = useAuthStore()
    return characters.value.filter(c => c.user_id === authStore.user?.id)
  })

  const otherCharacters = computed(() => {
    const authStore = useAuthStore()
    return characters.value.filter(c => c.user_id !== authStore.user?.id)
  })

  function _augment(data) {
    return { ...data, currentHp: data.currentHp ?? data.maxHitPoints ?? 0 }
  }

  async function loadAll(sessionId) {
    const authStore = useAuthStore()
    if (!authStore.user?.id || !sessionId) return

    currentSessionId.value = sessionId
    loading.value = true

    const [charsResult, membersResult] = await Promise.all([
      supabase.from('characters').select('*').eq('session_id', sessionId).order('created_at', { ascending: true }),
      supabase.from('session_members').select('user_id, active_character_id').eq('session_id', sessionId),
    ])

    loading.value = false

    if (charsResult.error) { console.error('characterStore.loadAll:', charsResult.error.message); return }
    characters.value = charsResult.data ?? []

    _subscribeRealtime(sessionId)

    if (membersResult.data) {
      memberSelections.value = membersResult.data
      await _fetchMissingChars(membersResult.data.map(m => m.active_character_id))
    }

    const storageKey = `char_active_${authStore.user.id}_${sessionId}`
    const savedId = localStorage.getItem(storageKey)
    if (savedId && characters.value.find(c => c.id === savedId)) {
      setActive(savedId)
    } else {
      const mine = characters.value.filter(c => c.user_id === authStore.user.id)
      if (mine.length === 1) setActive(mine[0].id)
    }
  }

  function setActive(id) {
    const authStore = useAuthStore()
    activeId.value = id
    if (authStore.user?.id && currentSessionId.value) {
      const key = `char_active_${authStore.user.id}_${currentSessionId.value}`
      if (id) localStorage.setItem(key, id)
      else localStorage.removeItem(key)
      // Update memberSelections locally so party panel reflects instantly
      const userId = authStore.user.id
      const existing = memberSelections.value.find(m => m.user_id === userId)
      if (existing) existing.active_character_id = id ?? null
      else memberSelections.value = [...memberSelections.value, { user_id: userId, active_character_id: id ?? null }]
      // Persist to DB so other players see this user's selection
      supabase.from('session_members').upsert(
        { session_id: currentSessionId.value, user_id: userId, active_character_id: id ?? null },
        { onConflict: 'session_id,user_id' },
      ).then(({ error }) => { if (error) console.warn('setActive upsert:', error.message) })
    }
  }

  async function importCharacter(json) {
    const authStore = useAuthStore()
    if (!authStore.user?.id) return

    saving.value = true
    const { data, error } = await supabase
      .from('characters')
      .insert({
        user_id: authStore.user.id,
        session_id: currentSessionId.value,
        data: _augment(json),
      })
      .select()
      .single()
    saving.value = false

    if (error) { console.error('characterStore.importCharacter:', error.message); return null }
    characters.value = [...characters.value, data]
    setActive(data.id)
    return data
  }

  async function deleteCharacter(id) {
    const { error } = await supabase.from('characters').delete().eq('id', id)
    if (error) { console.error('characterStore.deleteCharacter:', error.message); return }
    characters.value = characters.value.filter(c => c.id !== id)
    if (activeId.value === id) {
      const mine = characters.value.filter(c => {
        const authStore = useAuthStore()
        return c.user_id === authStore.user?.id
      })
      setActive(mine[0]?.id ?? null)
    }
  }

  function updateField(field, value) {
    if (!activeId.value) return
    characters.value = characters.value.map(c =>
      c.id === activeId.value ? { ...c, data: { ...c.data, [field]: value } } : c
    )
    _scheduleSave(activeId.value)
  }

  function adjustHp(delta) {
    if (!character.value) return
    const max = character.value.maxHitPoints ?? 0
    const next = Math.max(0, Math.min(max, (character.value.currentHp ?? 0) + delta))
    updateField('currentHp', next)
  }

  function adjustStat(key, delta) {
    if (!character.value?.stats) return
    updateField('stats', { ...character.value.stats, [key]: Math.max(1, (character.value.stats[key] ?? 10) + delta) })
  }

  function adjustMaxHp(delta) {
    if (!character.value) return
    const newMax = Math.max(1, (character.value.maxHitPoints ?? 0) + delta)
    updateField('maxHitPoints', newMax)
    if ((character.value.currentHp ?? 0) > newMax) updateField('currentHp', newMax)
  }

  function adjustMoney(type, delta) {
    if (!character.value) return
    const next = Math.max(0, (character.value[type] ?? 0) + delta)
    updateField(type, next)
  }

  function addGearItem(item) {
    if (!character.value) return
    const newItem = {
      instanceId: crypto.randomUUID(),
      name: item.name,
      slots: Number(item.slots) || 0,
      quantity: Number(item.quantity) || 1,
      type: item.type ?? 'sundry',
      disabled: false,
    }
    updateField('gear', [...(character.value.gear ?? []), newItem])
    if (newItem.type === 'weapon') {
      const attackEntry = {
        id: crypto.randomUUID(),
        raw: `${newItem.name}: +0 to hit`,
        damageDie: item.damageDie?.trim() || null,
        disabled: false,
        gearInstanceId: newItem.instanceId,
      }
      updateField('attacks', [...(character.value.attacks ?? []), attackEntry])
    }
  }

  function updateGearItem(instanceId, patch) {
    if (!character.value?.gear) return
    updateField('gear', character.value.gear.map(item =>
      item.instanceId === instanceId ? { ...item, ...patch } : item
    ))
  }

  function deleteGearItem(instanceId) {
    if (!character.value?.gear) return
    updateField('gear', character.value.gear.filter(item => item.instanceId !== instanceId))
  }

  function updateAttack(idx, patch) {
    if (!character.value?.attacks) return
    updateField('attacks', character.value.attacks.map((a, i) => {
      if (i !== idx) return a
      const base = typeof a === 'string'
        ? { id: crypto.randomUUID(), raw: a, disabled: false }
        : { ...a }
      return { ...base, ...patch }
    }))
  }

  function deleteAttack(idx) {
    if (!character.value?.attacks) return
    updateField('attacks', character.value.attacks.filter((_, i) => i !== idx))
  }

  async function _fetchMissingChars(ids) {
    const missing = (ids ?? []).filter(id => id && !characters.value.find(c => c.id === id))
    if (!missing.length) return
    const { data } = await supabase.from('characters').select('*').in('id', missing)
    if (data?.length) {
      const existing = new Set(characters.value.map(c => c.id))
      characters.value = [...characters.value, ...data.filter(c => !existing.has(c.id))]
    }
  }

  function _subscribeRealtime(sessionId) {
    if (_realtimeChannel) supabase.removeChannel(_realtimeChannel)
    _realtimeChannel = supabase
      .channel(`characters:${sessionId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'characters',
        filter: `session_id=eq.${sessionId}`,
      }, ({ new: row }) => {
        const authStore = useAuthStore()
        if (row.user_id === authStore.user?.id) return  // we created it ourselves
        if (!characters.value.find(c => c.id === row.id)) {
          characters.value = [...characters.value, row]
        }
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'characters',
        filter: `session_id=eq.${sessionId}`,
      }, ({ new: updated }) => {
        if (updated.id === activeId.value) return  // we're the source of truth for our own
        characters.value = characters.value.map(c =>
          c.id === updated.id ? { ...c, data: _augment(updated.data) } : c
        )
      })
      .on('postgres_changes', {
        event: 'DELETE',
        schema: 'public',
        table: 'characters',
        filter: `session_id=eq.${sessionId}`,
      }, ({ old }) => {
        characters.value = characters.value.filter(c => c.id !== old.id)
      })
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'session_members',
        filter: `session_id=eq.${sessionId}`,
      }, async ({ new: row }) => {
        if (!memberSelections.value.find(m => m.user_id === row.user_id)) {
          memberSelections.value = [
            ...memberSelections.value,
            { user_id: row.user_id, active_character_id: row.active_character_id ?? null },
          ]
        }
        await _fetchMissingChars([row.active_character_id])
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'session_members',
        filter: `session_id=eq.${sessionId}`,
      }, async ({ new: row }) => {
        const idx = memberSelections.value.findIndex(m => m.user_id === row.user_id)
        const entry = { user_id: row.user_id, active_character_id: row.active_character_id ?? null }
        if (idx !== -1) memberSelections.value[idx] = entry
        else memberSelections.value = [...memberSelections.value, entry]
        await _fetchMissingChars([row.active_character_id])
      })
      .on('postgres_changes', {
        event: 'DELETE',
        schema: 'public',
        table: 'session_members',
        filter: `session_id=eq.${sessionId}`,
      }, ({ old }) => {
        memberSelections.value = memberSelections.value.filter(m => m.user_id !== old.user_id)
      })
      .subscribe()
  }

  async function _saveCharacter(charId) {
    const char = characters.value.find(c => c.id === charId)
    if (!char) return
    saving.value = true
    const { error } = await supabase
      .from('characters')
      .update({ data: char.data })
      .eq('id', charId)
    saving.value = false
    if (error) console.error('characterStore._save:', error.message)
    _saveTimers.delete(charId)
  }

  function _scheduleSave(charId) {
    if (_saveTimers.has(charId)) clearTimeout(_saveTimers.get(charId))
    _saveTimers.set(charId, setTimeout(() => _saveCharacter(charId), 800))
  }

  function cleanup() {
    for (const timer of _saveTimers.values()) clearTimeout(timer)
    _saveTimers.clear()
    if (_realtimeChannel) { supabase.removeChannel(_realtimeChannel); _realtimeChannel = null }
    characters.value = []
    activeId.value = null
    currentSessionId.value = null
    memberSelections.value = []
  }

  return {
    characters, activeId, activeCharacter, character,
    currentSessionId, canEditActiveCharacter, myCharacters, otherCharacters,
    memberSelections,
    loading, saving,
    loadAll, setActive, importCharacter, deleteCharacter,
    updateField, adjustHp, adjustMoney, adjustStat, adjustMaxHp,
    addGearItem, updateGearItem, deleteGearItem, updateAttack, deleteAttack,
    cleanup,
  }
})
