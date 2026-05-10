import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '@/lib/supabase'
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
    const authStore = useAuthStore()
    const { data, error } = await supabase
      .from('dice_macros')
      .insert({ user_id: authStore.user.id, label: label.trim(), pending, modifier: modifier ?? 0 })
      .select()
      .single()

    if (!error && data) macros.value = [...macros.value, data]
  }

  async function deleteMacro(id) {
    macros.value = macros.value.filter(m => m.id !== id)
    await supabase.from('dice_macros').delete().eq('id', id)
  }

  function cleanup() {
    macros.value = []
    loaded = false
  }

  return { macros, init, saveMacro, deleteMacro, cleanup }
})
