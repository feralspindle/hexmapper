import { ref } from 'vue'

const visible = ref(true)

export function usePartyPanel() {
  function toggle() { visible.value = !visible.value }
  function close() { visible.value = false }
  function open() { visible.value = true }
  return { visible, toggle, close, open }
}
