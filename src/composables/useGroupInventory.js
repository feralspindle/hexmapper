import { ref } from 'vue'

const visible = ref(false)

export function useGroupInventory() {
  function toggle() { visible.value = !visible.value }
  function close() { visible.value = false }
  return { visible, toggle, close }
}
