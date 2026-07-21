import { ref } from 'vue'

const visible = ref(false)

export function useJournalPanel() {
  function toggle() { visible.value = !visible.value }
  function open() { visible.value = true }
  function close() { visible.value = false }

  return { visible, toggle, open, close }
}
