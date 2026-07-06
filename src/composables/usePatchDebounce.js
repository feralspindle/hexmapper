// Debounces saves per item id while merging patches, so a quick edit to a
// second field can't drop the first field's still-pending patch.
export function createPatchDebouncer(save, delay = 600) {
  const timers = new Map()
  const patches = new Map()

  function push(id, patch) {
    clearTimeout(timers.get(id))
    const merged = { ...(patches.get(id) ?? {}), ...patch }
    patches.set(id, merged)
    timers.set(id, setTimeout(() => {
      timers.delete(id)
      patches.delete(id)
      save(id, merged)
    }, delay))
  }

  function flush() {
    for (const timer of timers.values()) clearTimeout(timer)
    const pending = [...patches.entries()]
    timers.clear()
    patches.clear()
    for (const [id, patch] of pending) save(id, patch)
  }

  return { push, flush }
}
