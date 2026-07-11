import { computed } from 'vue'
import { useMapStore } from '@/stores/mapStore.js'

// ancestor chain for the topbar breadcrumb, collapsed to
// first / … / last when deep. `leaf` optionally appends a final
// segment (the dungeon topbar adds the dungeon name)
export function useMapBreadcrumb(leaf = null) {
  const mapStore = useMapStore()

  const visibleAncestors = computed(() => {
    const chain = mapStore.ancestorChain()
    if (chain.length <= 2) return chain
    return [chain[0], { ellipsis: true }, chain[chain.length - 1]]
  })

  const fullBreadcrumbPath = computed(() => {
    const parts = mapStore.ancestorChain().map((a) => a.name)
    parts.push(mapStore.activeMap?.name ?? '')
    const extra = typeof leaf === 'function' ? leaf() : null
    if (extra) parts.push(extra)
    return parts.join(' / ')
  })

  return { visibleAncestors, fullBreadcrumbPath }
}
