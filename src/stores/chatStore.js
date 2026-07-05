import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '@/lib/supabase'
import { realtime } from '@/lib/realtime.js'
import { mergeRealtimeSnapshot } from '@/lib/realtimeProtocol.js'
import { apiClient, ApiError } from '@/lib/apiClient.js'
import { useAuthStore } from '@/stores/authStore.js'
import { playChatSound } from '@/lib/diceSound.js'

export const useChatStore = defineStore('chat', () => {
  const messages      = ref([])
  const latestMessage = ref(null)

  let channel     = null
  let _sessionId  = null

  async function _fetchLatest(sessionId) {
    const { data } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false })
      .limit(100)
    return data
  }

  async function refresh() {
    const sessionId = _sessionId
    if (!sessionId) return
    const data = await _fetchLatest(sessionId)
    if (!data || _sessionId !== sessionId) return
    messages.value = mergeRealtimeSnapshot(data, messages.value, 100)
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
  }

  async function init(sessionId) {
    _sessionId = sessionId

    const data = await _fetchLatest(sessionId)
    if (data && _sessionId === sessionId) {
      messages.value = [...data].sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    }

    if (channel) realtime.removeChannel(channel)
    channel = realtime
      .channel(`session:${sessionId}:chat`, { sessionId, onReconnect: () => refresh() })
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `session_id=eq.${sessionId}` },
        ({ new: row }) => {
          if (messages.value.some(m => m.id === row.id)) return
          messages.value = [...messages.value, row]
          if (messages.value.length > 100) messages.value = messages.value.slice(-100)
          latestMessage.value = row
          playChatSound()
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

    try {
      const data = await apiClient.post('/chat-messages', {
        session_id: _sessionId,
        body:       body.trim(),
      }, 'send_chat')
      messages.value = messages.value.map(m => m.id === tempId ? data : m)
      latestMessage.value = data
      playChatSound()
    } catch (error) {
      const message = error instanceof ApiError ? error.message : error
      console.error('sendMessage:', message)
      messages.value = messages.value.filter(m => m.id !== tempId)
    }
  }

  function cleanup() {
    if (channel) { realtime.removeChannel(channel); channel = null }
    messages.value      = []
    latestMessage.value = null
    _sessionId          = null
  }

  return { messages, latestMessage, init, refresh, sendMessage, cleanup }
})
