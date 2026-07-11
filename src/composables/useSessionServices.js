import { watch } from 'vue'
import { useSessionStore } from '@/stores/sessionStore.js'
import { useMapStore } from '@/stores/mapStore.js'
import { useDiceStore } from '@/stores/diceStore.js'
import { useChatStore } from '@/stores/chatStore.js'
import { useOracleStore } from '@/stores/oracleStore.js'
import { useCharacterStore } from '@/stores/characterStore.js'
import { useUserPrefsStore } from '@/stores/userPrefsStore.js'
import { usePhotoStore } from '@/stores/photoStore.js'

// the session-wide service wiring both map surfaces (hex view, dungeon view)
// do identically: prefs + join, the dice/chat/oracle/characters/presence/photos
// init block, the play-mode -> oracle sync, and cleanup of the shared stores.
// surface-specific stores (hexStore, dungeonStore, activityStore) and
// presence-vs-full session cleanup stay in the views.
export function useSessionServices(sessionId) {
  const sessionStore = useSessionStore()
  const mapStore = useMapStore()
  const diceStore = useDiceStore()
  const chatStore = useChatStore()
  const oracleStore = useOracleStore()
  const characterStore = useCharacterStore()
  const prefs = useUserPrefsStore()
  const photoStore = usePhotoStore()

  function syncOracleStore() {
    if (sessionStore.playMode === 'gm_less') {
      oracleStore.init(sessionId)
    } else {
      oracleStore.cleanup()
    }
  }

  watch(() => sessionStore.playMode, syncOracleStore)

  async function joinSession() {
    await prefs.load()
    if (sessionStore.sessionId !== sessionId) {
      await sessionStore.joinSession(sessionId)
    }
  }

  function initServices() {
    diceStore.init(sessionId)
    chatStore.init(sessionId)
    syncOracleStore()
    characterStore.loadAll(sessionId)
    sessionStore.initPresence(sessionId)
    photoStore.init(sessionId)
  }

  function cleanupServices() {
    characterStore.cleanup()
    chatStore.cleanup()
    oracleStore.cleanup()
    mapStore.cleanup()
  }

  return { joinSession, initServices, cleanupServices, syncOracleStore }
}
