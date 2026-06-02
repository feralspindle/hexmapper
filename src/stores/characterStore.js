import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore.js'
import { playLuckSound } from '@/lib/diceSound.js'

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

const CLIENT_ID = crypto.randomUUID()

export const useCharacterStore = defineStore('character', () => {
  const _saveTimers = new Map()
  const _broadcastTimers = new Map()
  let _realtimeChannel = null

  const characters = ref([])
  const activeId = ref(null)
  const loading = ref(false)
  const saving = ref(false)
  const currentSessionId = ref(null)
  const memberSelections = ref([])
  const luckEvents = ref([])

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
    return {
      ...data,
      currentHp:   data.currentHp ?? data.maxHitPoints ?? 0,
      luckTokens:  data.luckTokens ?? { current: 1, max: 3 },
    }
  }

  async function loadAll(sessionId) {
    const authStore = useAuthStore()
    if (!authStore.user?.id || !sessionId) return

    currentSessionId.value = sessionId
    loading.value = true

    const [charsResult, membersResult] = await Promise.all([
      supabase.from('characters').select('*').eq('session_id', sessionId).order('created_at', { ascending: true }),
      supabase.from('session_members').select('user_id, active_character_id, display_name').eq('session_id', sessionId),
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
      const userId = authStore.user.id
      const existing = memberSelections.value.find(m => m.user_id === userId)
      if (existing) existing.active_character_id = id ?? null
      else memberSelections.value = [...memberSelections.value, { user_id: userId, active_character_id: id ?? null }]
      _realtimeChannel?.send({
        type: 'broadcast',
        event: 'active_character_changed',
        payload: { userId, characterId: id ?? null },
      })
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

  function _fmt(v) {
    if (v === null || v === undefined) return '–'
    if (typeof v === 'object') return JSON.stringify(v)
    return String(v)
  }

  function _gearSlots(gear) {
    return (gear ?? []).filter(i => !i.disabled).reduce((sum, i) => sum + (i.slots ?? 0) * (i.quantity ?? 1), 0)
  }

  function _logSheet(what) {
    if (!currentSessionId.value) return
    const authStore = useAuthStore()
    supabase.from('character_sheet_log').insert({
      session_id:   currentSessionId.value,
      user_id:      authStore.user?.id ?? null,
      display_name: authStore.displayName ?? 'Someone',
      what,
    }).then(({ error }) => { if (error) console.error('characterStore._logSheet:', error.message) })
  }

  function updateField(field, value) {
    if (!activeId.value) return
    const oldValue = character.value?.[field]
    const charName = character.value?.name ?? 'character'
    characters.value = characters.value.map(c =>
      c.id === activeId.value ? { ...c, data: { ...c.data, [field]: value } } : c
    )
    _scheduleSave(activeId.value)
    _scheduleBroadcast(activeId.value)
    if (field !== 'gear' && field !== 'attacks') {
      _logSheet(`${charName} · ${field}: ${_fmt(oldValue)} → ${_fmt(value)}`)
    }
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
    const charName = character.value?.name ?? 'character'
    const slotsBefore = _gearSlots(character.value.gear)
    const newItem = {
      instanceId: crypto.randomUUID(),
      name: item.name,
      slots: Math.round(Math.max(0, Number(item.slots) || 0)),
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
    const delta = newItem.slots * newItem.quantity
    const slotsAfter = slotsBefore + delta
    _logSheet(`${charName} added gear: ${newItem.name} (${newItem.slots} slot${newItem.slots !== 1 ? 's' : ''} ×${newItem.quantity}) · total slots: ${slotsBefore} → ${slotsAfter} (${delta >= 0 ? '+' : ''}${delta})`)
  }

  function addGearItemToChar(charId, item) {
    const char = characters.value.find(c => c.id === charId)
    if (!char?.data) return
    const newItem = {
      instanceId: crypto.randomUUID(),
      name:       item.name,
      slots:      Math.round(Math.max(0, Number(item.slots) || 0)),
      quantity:   Number(item.quantity) || 1,
      type:       item.type ?? 'sundry',
      disabled:   false,
    }
    updateFieldForChar(charId, 'gear', [...(char.data.gear ?? []), newItem])
  }

  function moveGearItem(instanceId, direction) {
    if (!character.value?.gear) return
    const charName = character.value?.name ?? 'character'
    const gear = [...character.value.gear]
    const idx = gear.findIndex(item => item.instanceId === instanceId)
    if (idx === -1) return
    const next = idx + direction
    if (next < 0 || next >= gear.length) return
    const itemName = gear[idx].name
    ;[gear[idx], gear[next]] = [gear[next], gear[idx]]
    updateField('gear', gear)
    _logSheet(`${charName} moved gear: ${itemName} ${direction > 0 ? 'down' : 'up'}`)
  }

  function updateGearItem(instanceId, patch) {
    if (!character.value?.gear) return
    const charName = character.value?.name ?? 'character'
    const item = character.value.gear.find(i => i.instanceId === instanceId)
    const slotsBefore = _gearSlots(character.value.gear)
    const updatedGear = character.value.gear.map(i => i.instanceId === instanceId ? { ...i, ...patch } : i)
    updateField('gear', updatedGear)
    if (item) {
      const action = 'disabled' in patch ? (patch.disabled ? 'disabled' : 'enabled') : 'edited'
      const slotsAfter = _gearSlots(updatedGear)
      const delta = slotsAfter - slotsBefore
      const slotStr = delta !== 0
        ? ` · total slots: ${slotsBefore} → ${slotsAfter} (${delta > 0 ? '+' : ''}${delta})`
        : ` · total slots: ${slotsBefore}`
      _logSheet(`${charName} ${action} gear: ${item.name}${slotStr}`)
    }
  }

  function deleteGearItem(instanceId) {
    if (!character.value?.gear) return
    const charName = character.value?.name ?? 'character'
    const item = character.value.gear.find(i => i.instanceId === instanceId)
    const slotsBefore = _gearSlots(character.value.gear)
    const remainingGear = character.value.gear.filter(i => i.instanceId !== instanceId)
    updateField('gear', remainingGear)
    if (item) {
      const slotsAfter = _gearSlots(remainingGear)
      const delta = slotsAfter - slotsBefore
      _logSheet(`${charName} deleted gear: ${item.name} · total slots: ${slotsBefore} → ${slotsAfter} (${delta > 0 ? '+' : ''}${delta})`)
    }
  }

  function addAttack(raw, damageDie = null) {
    if (!character.value) return
    const charName = character.value?.name ?? 'character'
    updateField('attacks', [...(character.value.attacks ?? []), {
      id: crypto.randomUUID(),
      raw: raw.trim(),
      damageDie: damageDie?.trim() || null,
      disabled: false,
    }])
    _logSheet(`${charName} added attack: ${raw.trim()}`)
  }

  function updateAttack(idx, patch) {
    if (!character.value?.attacks) return
    const charName = character.value?.name ?? 'character'
    const atk = character.value.attacks[idx]
    const raw = typeof atk === 'string' ? atk : (atk?.raw ?? '')
    updateField('attacks', character.value.attacks.map((a, i) => {
      if (i !== idx) return a
      const base = typeof a === 'string'
        ? { id: crypto.randomUUID(), raw: a, disabled: false }
        : { ...a }
      return { ...base, ...patch }
    }))
    _logSheet(`${charName} edited attack: ${raw}`)
  }

  function deleteAttack(idx) {
    if (!character.value?.attacks) return
    const charName = character.value?.name ?? 'character'
    const atk = character.value.attacks[idx]
    const raw = typeof atk === 'string' ? atk : (atk?.raw ?? '')
    updateField('attacks', character.value.attacks.filter((_, i) => i !== idx))
    _logSheet(`${charName} deleted attack: ${raw}`)
  }

  function spendLuckToken() {
    if (!character.value) return
    const luck = character.value.luckTokens ?? { current: 1, max: 3 }
    if (luck.current <= 0) return
    const characterName = character.value.name ?? 'Adventurer'
    updateField('luckTokens', { ...luck, current: luck.current - 1 })
    playLuckSound()
    _pushLuckEvent({ characterName, characterId: activeId.value })
    _realtimeChannel?.send({
      type: 'broadcast',
      event: 'luck_spent',
      payload: { characterName, characterId: activeId.value },
    })
  }

  function adjustLuck(delta) {
    if (!character.value) return
    const luck = character.value.luckTokens ?? { current: 1, max: 3 }
    updateField('luckTokens', { ...luck, current: Math.max(0, Math.min(luck.max, luck.current + delta)) })
  }

  function updateFieldForChar(id, field, value) {
    characters.value = characters.value.map(c =>
      c.id === id ? { ...c, data: { ...c.data, [field]: value } } : c
    )
    _scheduleSave(id)
    _scheduleBroadcast(id)
  }

  async function clearAllInitiative() {
    if (!currentSessionId.value) return
    characters.value = characters.value.map(c => ({
      ...c,
      data: { ...c.data, initiative: null },
    }))
    _realtimeChannel?.send({
      type: 'broadcast',
      event: 'initiative_cleared',
      payload: {},
    })
    const { error } = await supabase.rpc('clear_initiative', { p_session_id: currentSessionId.value })
    if (error) console.error('clearAllInitiative:', error.message)
  }

  function setMaxLuck(max) {
    if (!character.value) return
    const luck = character.value.luckTokens ?? { current: 1, max: 3 }
    const newMax = Math.max(0, max)
    updateField('luckTokens', { current: Math.min(luck.current, newMax), max: newMax })
  }

  function _pushLuckEvent(payload) {
    luckEvents.value = [...luckEvents.value, { id: crypto.randomUUID(), ...payload }]
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
        if (row.user_id === authStore.user?.id) return
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
        if (updated.id === activeId.value) return
        if (characters.value.some(c => c.id === updated.id)) {
          characters.value = characters.value.map(c =>
            c.id === updated.id ? { ...c, data: _augment(updated.data) } : c
          )
        } else {
          characters.value = [...characters.value, { ...updated, data: _augment(updated.data) }]
        }
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
            { user_id: row.user_id, active_character_id: row.active_character_id ?? null, display_name: row.display_name ?? null },
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
        const entry = { user_id: row.user_id, active_character_id: row.active_character_id ?? null, display_name: row.display_name ?? null }
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
      .on('broadcast', { event: 'luck_spent' }, ({ payload }) => {
        _pushLuckEvent(payload)
        playLuckSound()
      })
      .on('broadcast', { event: 'character_updated' }, ({ payload }) => {
        const { characterId, data, sourceClient } = payload
        if (sourceClient === CLIENT_ID) return
        if (characters.value.some(c => c.id === characterId)) {
          characters.value = characters.value.map(c =>
            c.id === characterId ? { ...c, data: _augment(data) } : c
          )
        } else {
          characters.value = [...characters.value, { id: characterId, data: _augment(data) }]
        }
      })
      .on('broadcast', { event: 'initiative_cleared' }, () => {
        characters.value = characters.value.map(c => ({
          ...c,
          data: { ...c.data, initiative: null },
        }))
      })
      .on('broadcast', { event: 'active_character_changed' }, async ({ payload }) => {
        const { userId, characterId } = payload
        const idx = memberSelections.value.findIndex(m => m.user_id === userId)
        const existing = idx !== -1 ? memberSelections.value[idx] : null
        const entry = { ...existing, user_id: userId, active_character_id: characterId }
        if (idx !== -1) memberSelections.value[idx] = entry
        else memberSelections.value = [...memberSelections.value, entry]
        await _fetchMissingChars([characterId])
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

  function _scheduleBroadcast(charId) {
    if (_broadcastTimers.has(charId)) clearTimeout(_broadcastTimers.get(charId))
    _broadcastTimers.set(charId, setTimeout(() => {
      const char = characters.value.find(c => c.id === charId)
      if (!char) return
      _realtimeChannel?.send({
        type: 'broadcast',
        event: 'character_updated',
        payload: { characterId: charId, data: char.data, sourceClient: CLIENT_ID },
      })
      _broadcastTimers.delete(charId)
    }, 100))
  }

  function cleanup() {
    for (const timer of _saveTimers.values()) clearTimeout(timer)
    _saveTimers.clear()
    for (const timer of _broadcastTimers.values()) clearTimeout(timer)
    _broadcastTimers.clear()
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
    luckEvents,
    loadAll, setActive, importCharacter, deleteCharacter,
    updateField, updateFieldForChar, adjustHp, adjustMoney, adjustStat, adjustMaxHp,
    addGearItem, addGearItemToChar, moveGearItem, updateGearItem, deleteGearItem, addAttack, updateAttack, deleteAttack,
    spendLuckToken, adjustLuck, setMaxLuck, clearAllInitiative,
    cleanup,
  }
})
