import { watch } from 'vue'
import { realtime } from '@/lib/realtime.js'
import { useAuthStore } from '@/stores/authStore.js'

// one presence channel: publishes this client's identity, keeps a deduped
// member list, and re-publishes when the signed-in user changes. dungeon adds
// editing_* through extraFields; session adds a join toast through onJoin.
export function createPresenceChannel({
  channelName,
  sessionId,
  clientId,
  members,
  extraFields = () => ({}),
  onSync,
  onJoin,
}) {
  const authStore = useAuthStore()

  const payload = () => ({
    user_id:      authStore.user?.id ?? null,
    _clientId:    clientId,
    display_name: authStore.displayName ?? 'Adventurer',
    avatar_url:   authStore.avatarUrl ?? null,
    ...extraFields(),
  })

  const channel = realtime.channel(channelName, {
    sessionId,
    config: { presence: { key: authStore.user?.id ?? clientId } },
  })

  const track = () => channel.track(payload())

  const sync = () => {
    const state = channel.presenceState()
    const latest = Object.values(state).map(e => e.at(-1)).filter(Boolean)
    const byUser = new Map()
    for (const p of latest) byUser.set(p.user_id ?? p._clientId, p)
    members.value = [...byUser.values()]
  }

  channel
    .on('presence', { event: 'sync' }, () => { sync(); onSync?.() })
    .on('presence', { event: 'join' }, (ev) => { sync(); onJoin?.(ev?.newPresences ?? []) })
    .on('presence', { event: 'leave' }, sync)
    .subscribe(status => { if (status === 'SUBSCRIBED') track() })

  const stopAuthWatch = watch(
    () => authStore.user?.id,
    (userId, prev) => { if (userId && userId !== prev) track() },
  )

  return { channel, track, stopAuthWatch }
}
