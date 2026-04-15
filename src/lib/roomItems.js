export const ROOM_ITEM_TYPES = [
  { type: 'monster',  faClass: 'ra ra-monster-skull',       icon: '\uf55f', label: 'Monster' },
  { type: 'body',     faClass: 'ra ra-skull',               icon: '\uf57d', label: 'Dead Body' },
  { type: 'npc',      faClass: 'ra ra-hood',                icon: '\uf50a', label: 'NPC' },
  { type: 'gold',     faClass: 'ra ra-gold-bar',            icon: '\uf50e', label: 'Gold' },
  { type: 'treasure', faClass: 'fa-solid fa-box-open',       icon: '\uf49e', label: 'Treasure' },
  { type: 'weapon',   faClass: 'ra ra-crossed-swords',      icon: '\uf518', label: 'Weapon' },
  { type: 'potion',   faClass: 'ra ra-potion',              icon: '\uf545', label: 'Potion' },
  { type: 'scroll',   faClass: 'ra ra-scroll-unfurled',     icon: '\uf556', label: 'Scroll' },
  { type: 'key',      faClass: 'ra ra-key',                 icon: '\uf511', label: 'Key' },
  { type: 'trap',     faClass: 'ra ra-bear-trap',            icon: '\uf562', label: 'Trap' },
]

export function iconForType(type) {
  return ROOM_ITEM_TYPES.find(t => t.type === type)?.icon ?? '?'
}

export function faClassForType(type) {
  return ROOM_ITEM_TYPES.find(t => t.type === type)?.faClass ?? 'ra ra-diamond'
}
