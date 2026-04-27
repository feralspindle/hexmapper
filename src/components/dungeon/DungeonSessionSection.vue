<template>
  <div class="ds-panel-section flex-grow" :class="{ collapsed: !open }">
    <div class="ds-section-head" @click="open = !open">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" style="flex:0 0 auto">
        <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
      </svg>
      <h3>Session</h3>
      <span class="ds-meta">{{ activeTab }}</span>
      <svg class="ds-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <path d="M6 9l6 6 6-6"/>
      </svg>
    </div>

    <div class="ds-section-tabs">
      <button class="ds-section-tab" :class="{ active: activeTab === 'Chat' }" @click.stop="activeTab = 'Chat'">Chat</button>
      <button class="ds-section-tab" :class="{ active: activeTab === 'Activity' }" @click.stop="activeTab = 'Activity'">Activity</button>
    </div>


    <div v-show="activeTab === 'Chat'" style="display:flex;flex-direction:column;flex:1;min-height:0">
      <div ref="chatLogEl" style="flex:1;overflow-y:auto;padding:10px 14px;display:flex;flex-direction:column;gap:8px;min-height:0">
        <div v-if="!chatStore.messages.length" style="font-family:var(--font-body);font-style:italic;font-size:13px;color:var(--ink-mute);text-align:center;padding:16px 0">
          No messages yet
        </div>
        <div
          v-for="msg in chatStore.messages"
          :key="msg.id"
          class="ds-chat-msg"
          :class="msg.id?.toString().startsWith('pending-') ? 'opacity-50' : ''"
          :style="{ '--msg-color': msgColor(msg.user_id) }"
        >
          <div class="ds-chat-meta">
            <span class="ds-chat-who">{{ gmName(msg.user_id, msg.display_name) }}</span>
            <span v-if="msg.created_at" class="ds-chat-when">{{ timeAgo(msg.created_at) }}</span>
          </div>
          <span class="ds-chat-body">{{ msg.body }}</span>
        </div>
      </div>

      <div style="display:flex;gap:6px;padding:8px 12px;border-top:1px solid var(--rule);flex-shrink:0">
        <input
          v-model="draft"
          type="text"
          placeholder="Message… (Enter)"
          maxlength="500"
          class="ds-input"
          style="flex:1;padding:6px 8px;font-style:normal;font-size:13px"
          @keydown.enter.prevent="send"
        />
        <button class="ds-btn tiny" :disabled="!draft.trim()" @click="send">Send</button>
      </div>
    </div>

    <div v-show="activeTab === 'Activity'" style="flex:1;overflow-y:auto;padding:10px 14px;min-height:0">
      <div v-if="!activityStore.activities.length" style="font-family:var(--font-body);font-style:italic;font-size:13px;color:var(--ink-mute);text-align:center;padding:16px 0">
        No activity yet
      </div>
      <div
        v-for="item in activityStore.activities"
        :key="item.id"
        class="ds-activity-item"
        :style="{ '--act-color': actColor(item.userId) }"
      >
        <div style="flex:1;min-width:0">
          <span class="ds-activity-who">{{ item.who }}</span>
          <span class="ds-activity-verb"> {{ item.verb }} </span>
          <span class="ds-activity-what">{{ item.what }}</span>
        </div>
        <span class="ds-activity-when">{{ timeAgo(item.at) }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { useChatStore } from '@/stores/chatStore.js'
import { useActivityStore } from '@/stores/activityStore.js'
import { useAuthStore } from '@/stores/authStore.js'
import { useGMLabel } from '@/composables/useGMLabel.js'
import { playerColorFor } from '@/composables/usePlayerColor.js'

const chatStore     = useChatStore()
const activityStore = useActivityStore()
const authStore     = useAuthStore()
const { gmName }    = useGMLabel()

const open      = ref(true)
const activeTab = ref('Chat')
const draft     = ref('')
const chatLogEl = ref(null)

function send() {
  const body = draft.value.trim()
  if (!body) return
  draft.value = ''
  chatStore.sendMessage(body)
}

watch(() => chatStore.messages.length, () => nextTick(() => {
  if (chatLogEl.value) chatLogEl.value.scrollTop = chatLogEl.value.scrollHeight
}), { immediate: true })

function msgColor(userId) { return playerColorFor(userId) }
function actColor(userId) { return playerColorFor(userId) }

const now = ref(Date.now())
let tick = null
onMounted(() => { tick = setInterval(() => { now.value = Date.now() }, 15000) })
onUnmounted(() => clearInterval(tick))

function timeAgo(ts) {
  const diff = now.value - new Date(ts).getTime()
  if (diff < 10000) return 'just now'
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  return `${Math.floor(diff / 3600000)}h ago`
}
</script>
