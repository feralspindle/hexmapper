import { watch } from 'vue'
import { useSessionStore } from '@/stores/sessionStore.js'
import { useMapStore } from '@/stores/mapStore.js'
import { useDiceStore } from '@/stores/diceStore.js'
import { useDiceStatsStore } from '@/stores/diceStatsStore.js'
import { useChatStore } from '@/stores/chatStore.js'
import { useOracleStore } from '@/stores/oracleStore.js'
import { useStatBlockStore } from '@/stores/statBlockStore.js'
import { useCharacterStore } from '@/stores/characterStore.js'
import { useUserPrefsStore } from '@/stores/userPrefsStore.js'
import { usePhotoStore } from '@/stores/photoStore.js'

// the session-wide service wiring both map surfaces (hex view, dungeon view)
// do identically: prefs + join, the dice/chat/oracle/characters/presence/photos
// init block, the play-mode store sync (oracle, stat blocks), and cleanup of
// the shared stores.
// surface-specific stores (hexStore, dungeonStore, activityStore) and
// presence-vs-full session cleanup stay in the views.
// alwaysOracle keeps the oracle store hydrated in every play mode (the dungeon
// stocking generator reads its tables); hex only needs it for the gm_less panel.
export function useSessionServices(sessionId, { alwaysOracle = false } = {}) {
  const sessionStore = useSessionStore()
  const mapStore = useMapStore()
  const diceStore = useDiceStore()
  const diceStatsStore = useDiceStatsStore()
  const chatStore = useChatStore()
  const oracleStore = useOracleStore()
  const statBlockStore = useStatBlockStore()
  const characterStore = useCharacterStore()
  const prefs = useUserPrefsStore()
  const photoStore = usePhotoStore()

  function syncPlayModeStores() {
    if (alwaysOracle || sessionStore.playMode === 'gm_less') {
      oracleStore.init(sessionId)
    } else {
      oracleStore.cleanup()
    }
    if (sessionStore.playMode === 'gm_less') {
      statBlockStore.init(sessionId)
    } else {
      statBlockStore.cleanup()
    }
  }

  watch(() => sessionStore.playMode, syncPlayModeStores)

  async function joinSession() {
    await prefs.load()
    if (sessionStore.sessionId !== sessionId) {
      await sessionStore.joinSession(sessionId)
    }
  }

  function initServices() {
    diceStore.init(sessionId)
    diceStatsStore.init(sessionId)
    chatStore.init(sessionId)
    syncPlayModeStores()
    characterStore.loadAll(sessionId)
    sessionStore.initPresence(sessionId)
    photoStore.init(sessionId)
  }

  function cleanupServices() {
    characterStore.cleanup()
    chatStore.cleanup()
    oracleStore.cleanup()
    statBlockStore.cleanup()
    mapStore.cleanup()
  }

  return { joinSession, initServices, cleanupServices }
}
