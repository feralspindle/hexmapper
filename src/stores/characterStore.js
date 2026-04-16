import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore.js'

let _saveTimer = null

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
  const characters = ref([])
  const activeId = ref(null)
  const loading = ref(false)
  const saving = ref(false)
  const currentSessionId = ref(null)

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

    const { data, error } = await supabase
      .from('characters')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true })

    loading.value = false

    if (error) { console.error('characterStore.loadAll:', error.message); return }
    characters.value = data ?? []

    const storageKey = `char_active_${authStore.user.id}_${sessionId}`
    const savedId = localStorage.getItem(storageKey)
    if (savedId && characters.value.find(c => c.id === savedId)) {
      activeId.value = savedId
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
    _scheduleSave()
  }

  function adjustHp(delta) {
    if (!character.value) return
    const max = character.value.maxHitPoints ?? 0
    const next = Math.max(0, Math.min(max, (character.value.currentHp ?? 0) + delta))
    updateField('currentHp', next)
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

  async function _save() {
    if (!activeCharacter.value) return
    saving.value = true
    const { error } = await supabase
      .from('characters')
      .update({ data: activeCharacter.value.data })
      .eq('id', activeCharacter.value.id)
    saving.value = false
    if (error) console.error('characterStore._save:', error.message)
  }

  function _scheduleSave() {
    if (_saveTimer) clearTimeout(_saveTimer)
    _saveTimer = setTimeout(_save, 800)
  }

  function cleanup() {
    if (_saveTimer) { clearTimeout(_saveTimer); _saveTimer = null }
    characters.value = []
    activeId.value = null
    currentSessionId.value = null
  }

  return {
    characters, activeId, activeCharacter, character,
    currentSessionId, canEditActiveCharacter, myCharacters, otherCharacters,
    loading, saving,
    loadAll, setActive, importCharacter, deleteCharacter,
    updateField, adjustHp, adjustMoney,
    addGearItem, updateGearItem, deleteGearItem, updateAttack, deleteAttack,
    cleanup,
  }
})
