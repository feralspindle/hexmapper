import { useSessionStore } from '@/stores/sessionStore.js'
import { useCharacterStore } from '@/stores/characterStore.js'

export function useGMLabel() {
  const sessionStore = useSessionStore()
  const characterStore = useCharacterStore()

  function gmName(userId, displayName, characterId = null) {
    if (!displayName) return displayName
    if (userId && userId === sessionStore.sessionOwnerId) {
      if (characterId) {
        const char = characterStore.characters.find(c => c.id === characterId)
        if (char?.data?.name) return `${char.data.name} (GM NPC)`
      }
      return `${displayName} (GM)`
    }
    return displayName
  }

  return { gmName }
}
