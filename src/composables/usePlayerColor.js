import { useUserPrefsStore } from '@/stores/userPrefsStore.js'

const PALETTE_COLORS = {
  candle: ['#8a1c1c', '#b8541c', '#5a6b3a', '#2c5266', '#6b3a5a', '#b89c2a'],
  ember:  ['#c43a2a', '#e07a2a', '#d4a02a', '#7a2a3a', '#3a4a6a', '#5a3a2a'],
  moss:   ['#5a6b3a', '#3a5a4a', '#7a8a4a', '#3a4a6a', '#8a5a3a', '#6b3a5a'],
  ink:    ['#1a1410', '#3a2e22', '#5a4a3a', '#8a1c1c', '#2c5266', '#5a6b3a'],
}

export function playerColorFor(userId) {
  const prefs = useUserPrefsStore()
  const colors = PALETTE_COLORS[prefs.palette] ?? PALETTE_COLORS.candle
  const hash = (userId ?? '').split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)
  return colors[hash % colors.length]
}
