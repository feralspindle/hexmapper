import { ref } from 'vue'

const lootEvents = ref([])

export function useLootToast() {
  function push(data) {
    lootEvents.value = [...lootEvents.value, { id: crypto.randomUUID(), ...data }]
  }
  return { lootEvents, push }
}
