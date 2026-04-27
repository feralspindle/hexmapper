const PLAYER_COLORS = ['#8a1c1c', '#b8541c', '#5a6b3a', '#2c5266', '#6b3a5a', '#b89c2a']

export function playerColorFor(userId) {
  const hash = (userId ?? '').split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)
  return PLAYER_COLORS[hash % PLAYER_COLORS.length]
}
