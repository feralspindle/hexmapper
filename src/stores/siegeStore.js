import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '@/lib/supabase'
import { createSessionChannel } from '@/lib/sessionChannel.js'
import { apiClient, ApiError } from '@/lib/apiClient.js'
import { useDiceStore } from '@/stores/diceStore.js'

export const useSiegeStore = defineStore('siege', () => {
  const weapons   = ref([])
  const firingId  = ref(null)
  const lastError = ref(null)
  const session   = createSessionChannel()

  async function refresh(generation = session.generation) {
    const sessionId = session.key
    if (!sessionId) return
    const { data } = await supabase
      .from('siege_weapons')
      .select('*')
      .eq('session_id', sessionId)
      .order('sort_order', { ascending: true })
    if (!session.isCurrent(generation) || !data) return
    weapons.value = data
  }

  async function init(sessionId) {
    if (session.key === sessionId) return
    cleanup()
    const generation = session.begin(sessionId)

    await refresh(generation)
    if (!session.isCurrent(generation)) return

    session.open(`siege:${sessionId}`, { sessionId, refresh }, ch => ch
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'siege_weapons', filter: `session_id=eq.${sessionId}` },
        e => {
          if (e.eventType === 'INSERT') {
            if (!weapons.value.find(w => w.id === e.new.id)) weapons.value.push(e.new)
          } else if (e.eventType === 'UPDATE') {
            const idx = weapons.value.findIndex(w => w.id === e.new.id)
            if (idx !== -1) weapons.value[idx] = e.new
          } else if (e.eventType === 'DELETE') {
            weapons.value = weapons.value.filter(w => w.id !== e.old.id)
          }
        },
      ))
  }

  function _syncWeapon(row) {
    if (!row) return
    const idx = weapons.value.findIndex(w => w.id === row.id)
    if (idx !== -1) weapons.value[idx] = row
    else weapons.value.push(row)
  }

  function _error(where, error) {
    const message = error instanceof ApiError ? error.message : String(error)
    console.error(`siege ${where}:`, message)
    lastError.value = message
    return null
  }

  function _clearError() {
    lastError.value = null
  }

  async function createWeapon(payload) {
    try {
      const data = await apiClient.post('/siege-weapons', {
        session_id: session.key,
        ...payload,
      }, 'create_siege_weapon')
      _syncWeapon(data)
      _clearError()
      return data
    } catch (error) {
      return _error('create', error)
    }
  }

  async function updateWeapon(id, patch) {
    try {
      const data = await apiClient.patch(`/siege-weapons/${id}`, patch, 'update_siege_weapon')
      _syncWeapon(data)
      _clearError()
      return data
    } catch (error) {
      return _error('update', error)
    }
  }

  async function deleteWeapon(id) {
    weapons.value = weapons.value.filter(w => w.id !== id)
    try {
      await apiClient.delete(`/siege-weapons/${id}`, 'delete_siege_weapon')
    } catch (error) {
      _error('delete', error)
    }
  }

  async function joinCrew(id, characterId) {
    try {
      const data = await apiClient.post(`/siege-weapons/${id}/crew`, {
        character_id: characterId,
        action: 'join',
      }, 'siege_crew')
      _syncWeapon(data)
      _clearError()
      return data
    } catch (error) {
      return _error('crew join', error)
    }
  }

  async function leaveCrew(id, characterId) {
    try {
      const data = await apiClient.post(`/siege-weapons/${id}/crew`, {
        character_id: characterId,
        action: 'leave',
      }, 'siege_crew')
      _syncWeapon(data)
      _clearError()
      return data
    } catch (error) {
      return _error('crew leave', error)
    }
  }

  async function reload(id) {
    try {
      const data = await apiClient.post(`/siege-weapons/${id}/reload`, {}, 'reload_siege')
      _syncWeapon(data)
      _clearError()
      return data
    } catch (error) {
      return _error('reload', error)
    }
  }

  async function damage(id, amount) {
    try {
      const data = await apiClient.post(`/siege-weapons/${id}/damage`, { amount }, 'damage_siege')
      _syncWeapon(data)
      _clearError()
      return data
    } catch (error) {
      return _error('damage', error)
    }
  }

  // fire rolls attack + damage server-side in one transaction. rolls come back
  // in the response and are injected into the dice store (the realtime echo
  // skips the actor's own rows)
  async function fire(id) {
    if (firingId.value) return null
    firingId.value = id
    try {
      const data = await apiClient.post(`/siege-weapons/${id}/fire`, {}, 'fire_siege')
      _syncWeapon(data.weapon)
      _clearError()
      useDiceStore().ingestRolls([data.attack, data.damage])
      return data
    } catch (error) {
      return _error('fire', error)
    } finally {
      firingId.value = null
    }
  }

  function cleanup() {
    session.close()
    weapons.value   = []
    firingId.value  = null
    lastError.value = null
  }

  return {
    weapons, firingId, lastError, init, refresh,
    createWeapon, updateWeapon, deleteWeapon,
    joinCrew, leaveCrew, reload, damage, fire,
    cleanup,
  }
})
