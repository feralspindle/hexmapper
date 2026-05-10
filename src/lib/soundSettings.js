import { ref } from 'vue'

const STORAGE_KEY = 'dm.soundEnabled'
export const soundEnabled = ref(localStorage.getItem(STORAGE_KEY) !== 'false')

export function toggleSound() {
  soundEnabled.value = !soundEnabled.value
  localStorage.setItem(STORAGE_KEY, String(soundEnabled.value))
}
