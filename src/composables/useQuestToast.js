import { ref } from 'vue'

const questEvents = ref([])

export function useQuestToast() {
  function push(data) {
    questEvents.value = [...questEvents.value, { id: crypto.randomUUID(), ...data }]
  }
  return { questEvents, push }
}
