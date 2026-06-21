import { describe, test, expect } from 'vitest'
import {
  parseMarkers,
  serializeMarkers,
  MARKER_KINDS,
  GM_MARKER_KINDS,
  TERRAIN_TYPES,
} from './hexStore.js'

describe('hexStore marker (de)serialization', () => {
  test('parseMarkers returns [] for null/empty input', () => {
    expect(parseMarkers(null)).toEqual([])
    expect(parseMarkers('')).toEqual([])
  })

  test('parseMarkers passes through structured marker objects', () => {
    const raw = JSON.stringify([{ id: 'a', kind: 'town', label: 'Bree' }])
    expect(parseMarkers(raw)).toEqual([{ id: 'a', kind: 'town', label: 'Bree' }])
  })

  test('parseMarkers upgrades legacy string entries into objects', () => {
    const markers = parseMarkers(JSON.stringify(['dungeon']))
    expect(markers).toHaveLength(1)
    expect(markers[0]).toMatchObject({ kind: 'dungeon', label: '' })
    expect(markers[0].id).toBeTruthy()
  })

  test('parseMarkers treats a non-JSON legacy string as a single kind', () => {
    const markers = parseMarkers('city')
    expect(markers).toHaveLength(1)
    expect(markers[0]).toMatchObject({ kind: 'city', label: '' })
  })

  test('serializeMarkers round-trips with parseMarkers', () => {
    const markers = [{ id: 'x', kind: 'landmark', label: 'Old Tower' }]
    expect(parseMarkers(serializeMarkers(markers))).toEqual(markers)
  })

  test('serializeMarkers returns null for an empty list (so the column clears)', () => {
    expect(serializeMarkers([])).toBeNull()
  })

  test('marker and terrain catalogs expose stable ids', () => {
    expect(MARKER_KINDS.map(k => k.id)).toContain('dungeon')
    expect(GM_MARKER_KINDS.map(k => k.id)).toContain('trap')
    expect(TERRAIN_TYPES.map(t => t.id)).toContain('water')
    for (const t of TERRAIN_TYPES) {
      expect(t.color).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })
})
