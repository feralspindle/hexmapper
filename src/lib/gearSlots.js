export const GEM_NAMES = ['emerald', 'pearl', 'ruby', 'sapphire', 'diamond']

export function isGemItem(item) {
  const name = (item?.name ?? '').toLowerCase()
  return GEM_NAMES.some(g => name.includes(g))
}

export function calcGearItemSlots(item) {
  if (isGemItem(item)) return Math.ceil((item.quantity ?? 1) / 10)
  return (item.slots ?? 0) * (item.quantity ?? 1)
}
