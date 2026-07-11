import { apiClient, ApiError } from '@/lib/apiClient.js'

// start/pause/reset actions that POST { action } to `${base()}/torch`. the
// optimistic state change lives in `apply` because session tracks the torch as
// refs and dungeon as fields on the dungeon row; `pendingFor` names the keys to
// guard against the realtime echo while the write is in flight (session only).
export function createTorchControls({ base, intent, apply, pendingFor, pending }) {
  const run = (action) => async () => {
    const b = base()
    if (b == null) return
    apply?.(action)
    const keys = pendingFor?.(action) ?? []
    if (keys.length) pending.begin(keys)
    try {
      await apiClient.post(`${b}/torch`, { action }, intent(action))
    } catch (err) {
      console.error(`torch ${action}:`, err instanceof ApiError ? err.message : err)
    } finally {
      if (keys.length) pending.end(keys)
    }
  }
  return { torchStart: run('start'), torchPause: run('pause'), torchReset: run('reset') }
}
