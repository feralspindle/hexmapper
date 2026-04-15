import { useSessionStore } from '@/stores/sessionStore.js'

export function useGMLabel() {
  const sessionStore = useSessionStore()

  function gmName(userId, displayName) {
    if (!displayName) return displayName
    if (userId && userId === sessionStore.sessionOwnerId) {
      return `${displayName} (GM)`
    }
    return displayName
  }

  return { gmName }
}
