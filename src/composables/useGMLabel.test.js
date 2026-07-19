import { describe, test, expect, beforeEach, vi } from 'vitest'

const stores = vi.hoisted(() => ({ session: {}, character: {} }))

vi.mock('@/stores/sessionStore.js', () => ({
  useSessionStore: () => stores.session,
}))
vi.mock('@/stores/characterStore.js', () => ({
  useCharacterStore: () => stores.character,
}))

import { useGMLabel } from './useGMLabel.js'

describe('useGMLabel', () => {
  beforeEach(() => {
    stores.session = { sessionOwnerId: 'gm-user', hasGM: true }
    stores.character = { characters: [{ id: 'npc-1', data: { name: 'Barkeep' } }] }
  })

  test('tags the session owner with (GM)', () => {
    const { gmName } = useGMLabel()
    expect(gmName('gm-user', 'Hannah')).toBe('Hannah (GM)')
  })

  test('uses the NPC character name when the GM speaks as a character', () => {
    const { gmName } = useGMLabel()
    expect(gmName('gm-user', 'Hannah', 'npc-1')).toBe('Barkeep (GM NPC)')
  })

  test('falls back to (GM) when the character is unknown', () => {
    const { gmName } = useGMLabel()
    expect(gmName('gm-user', 'Hannah', 'missing-char')).toBe('Hannah (GM)')
  })

  test('leaves regular players untouched', () => {
    const { gmName } = useGMLabel()
    expect(gmName('player-1', 'Robin')).toBe('Robin')
    expect(gmName('player-1', 'Robin', 'npc-1')).toBe('Robin')
  })

  test('leaves the owner untagged in gm_less sessions', () => {
    stores.session.hasGM = false
    const { gmName } = useGMLabel()
    expect(gmName('gm-user', 'Hannah')).toBe('Hannah')
    expect(gmName('gm-user', 'Hannah', 'npc-1')).toBe('Hannah')
  })

  test('passes through empty display names', () => {
    const { gmName } = useGMLabel()
    expect(gmName('gm-user', null)).toBeNull()
    expect(gmName('gm-user', '')).toBe('')
  })
})
