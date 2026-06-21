import { describe, test, expect } from 'vitest'
import { ROOM_ITEM_TYPES, iconForType, faClassForType } from './roomItems.js'

describe('roomItems', () => {
  test('every item type has a unique id, label, icon, and fa class', () => {
    const types = ROOM_ITEM_TYPES.map(t => t.type)
    expect(new Set(types).size).toBe(types.length)
    for (const t of ROOM_ITEM_TYPES) {
      expect(t.type).toBeTruthy()
      expect(t.label).toBeTruthy()
      expect(t.icon).toBeTruthy()
      expect(t.faClass).toBeTruthy()
    }
  })

  test('iconForType resolves a known type and falls back to "?"', () => {
    const gold = ROOM_ITEM_TYPES.find(t => t.type === 'gold')
    expect(iconForType('gold')).toBe(gold.icon)
    expect(iconForType('nonsense')).toBe('?')
  })

  test('faClassForType resolves a known type and falls back to a default glyph', () => {
    expect(faClassForType('monster')).toBe('ra ra-monster-skull')
    expect(faClassForType('nonsense')).toBe('ra ra-diamond')
  })
})
