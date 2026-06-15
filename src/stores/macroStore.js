import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '@/lib/supabase'
import { apiClient, ApiError } from '@/lib/apiClient.js'
import { useAuthStore } from '@/stores/authStore.js'

export const useMacroStore = defineStore('macros', () => {
  const macros = ref([])
  let loaded = false

  async function init() {
    if (loaded) return
    const authStore = useAuthStore()
    if (!authStore.user) return
    loaded = true

    const { data } = await supabase
      .from('dice_macros')
      .select('*')
      .order('created_at', { ascending: true })

    if (data) macros.value = data
  }

  async function saveMacro(label, pending, modifier) {
    try {
      const data = await apiClient.post('/dice-macros', {
        label: label.trim(),
        pending,
        modifier: modifier ?? 0,
      })
      macros.value = [...macros.value, data]
    } catch (error) {
      console.error('saveMacro:', error instanceof ApiError ? error.message : error)
    }
  }

  async function deleteMacro(id) {
    macros.value = macros.value.filter(m => m.id !== id)
    try {
      await apiClient.delete(`/dice-macros/${id}`)
    } catch (error) {
      console.error('deleteMacro:', error instanceof ApiError ? error.message : error)
    }
  }

  function cleanup() {
    macros.value = []
    loaded = false
  }

  return { macros, init, saveMacro, deleteMacro, cleanup }
})
