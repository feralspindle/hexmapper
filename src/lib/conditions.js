// Common conditions get a fixed icon and color; anything else (a custom status
// like "in hell") falls back to a generic badge with a color hashed from its
// name, so two custom conditions stay visually distinct.

export const COMMON_CONDITIONS = [
  { name: 'poisoned',    faClass: 'ra ra-poison-cloud',    color: '#7cb342' },
  { name: 'paralyzed',   faClass: 'ra ra-lightning-bolt',  color: '#fdd835' },
  { name: 'asleep',      faClass: 'ra ra-hourglass',       color: '#7986cb' },
  { name: 'unconscious', faClass: 'ra ra-broken-skull',    color: '#e53935' },
  { name: 'blinded',     faClass: 'ra ra-eye-shield',      color: '#8d6e63' },
  { name: 'charmed',     faClass: 'ra ra-hearts',          color: '#ec407a' },
  { name: 'frightened',  faClass: 'ra ra-aura',            color: '#ab47bc' },
  { name: 'stunned',     faClass: 'ra ra-player-dodge',    color: '#ffa726' },
  { name: 'restrained',  faClass: 'ra ra-daggers',         color: '#78909c' },
  { name: 'invisible',   faClass: 'ra ra-hood',            color: '#b0bec5' },
  { name: 'cursed',      faClass: 'ra ra-skull',           color: '#6d4c41' },
  { name: 'diseased',    faClass: 'ra ra-biohazard',       color: '#9e9d24' },
]

const CUSTOM_COLORS = ['#ef5350', '#42a5f5', '#66bb6a', '#ffca28', '#26c6da', '#ff7043', '#9ccc65', '#5c6bc0']

export function conditionBadge(name) {
  const key = String(name ?? '').trim().toLowerCase()
  const preset = COMMON_CONDITIONS.find(c => c.name === key)
  if (preset) return { ...preset, name: key, custom: false }
  let hash = 0
  for (let i = 0; i < key.length; i += 1) hash = (hash * 31 + key.charCodeAt(i)) >>> 0
  return {
    name: key,
    faClass: 'ra ra-burning-embers',
    color: CUSTOM_COLORS[hash % CUSTOM_COLORS.length],
    custom: true,
  }
}

export function normalizeCondition(name) {
  return String(name ?? '').trim().toLowerCase().slice(0, 40)
}
