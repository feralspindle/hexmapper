import { ref } from 'vue'

const visible   = ref(false)
const activeTab = ref('quests')

export function usePartyNotebook() {
  function toggle() { visible.value = !visible.value }
  function open(tab) { if (tab) activeTab.value = tab; visible.value = true }
  function close() { visible.value = false }
  return { visible, activeTab, toggle, open, close }
}
