import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore.js'

export const useChatStore = defineStore('chat', () => {
  const messages      = ref([])
  const latestMessage = ref(null)

  let channel     = null
  let _sessionId  = null

  async function init(sessionId) {
    _sessionId = sessionId

    const { data } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true })
      .limit(100)

    if (data) messages.value = data

    if (channel) supabase.removeChannel(channel)
    channel = supabase
      .channel(`session:${sessionId}:chat`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `session_id=eq.${sessionId}` },
        ({ new: row }) => {
          if (messages.value.some(m => m.id === row.id)) return
          messages.value = [...messages.value, row]
          if (messages.value.length > 100) messages.value = messages.value.slice(-100)
          latestMessage.value = row
        },
      )
      .subscribe()
  }

  async function sendMessage(body) {
    const authStore = useAuthStore()
    if (!body.trim() || !_sessionId) return

    const tempId  = `pending-${crypto.randomUUID()}`
    const tempMsg = {
      id:           tempId,
      session_id:   _sessionId,
      user_id:      authStore.user?.id,
      display_name: authStore.displayName,
      body:         body.trim(),
      created_at:   new Date().toISOString(),
    }
    messages.value = [...messages.value, tempMsg]

    const { data, error } = await supabase
      .from('chat_messages')
      .insert({
        session_id:   _sessionId,
        user_id:      authStore.user?.id,
        display_name: authStore.displayName,
        body:         body.trim(),
      })
      .select()
      .single()

    if (error) {
      console.error('sendMessage:', error.message)
      messages.value = messages.value.filter(m => m.id !== tempId)
    } else {
      messages.value = messages.value.map(m => m.id === tempId ? data : m)
      latestMessage.value = data
    }
  }

  function cleanup() {
    if (channel) { supabase.removeChannel(channel); channel = null }
    messages.value      = []
    latestMessage.value = null
    _sessionId          = null
  }

  return { messages, latestMessage, init, sendMessage, cleanup }
})
