import { ref } from 'vue'

// latest gm dungeon entry, players keep it until they join or dismiss
const invite = ref(null)

export function usePartyFollow() {
  function push(data) {
    invite.value = { ...data }
  }
  function dismiss() {
    invite.value = null
  }
  return { invite, push, dismiss }
}
