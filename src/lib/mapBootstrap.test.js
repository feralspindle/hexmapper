import { describe, expect, test } from 'vitest'
import { mapBootstrapAction } from './mapBootstrap.js'

describe('mapBootstrapAction', () => {
  test('failed read blocks instead of proceeding', () => {
    expect(mapBootstrapAction({ mapsLoaded: false, mapsCount: 0, activeMapId: null, isGM: true })).toBe('blocked')
  })

  test('empty read with an active map set blocks — never auto-creates over an existing world', () => {
    expect(mapBootstrapAction({ mapsLoaded: true, mapsCount: 0, activeMapId: 'map-1', isGM: true })).toBe('blocked')
    expect(mapBootstrapAction({ mapsLoaded: true, mapsCount: 0, activeMapId: 'map-1', isGM: false })).toBe('blocked')
  })

  test('player in a brand-new session waits for the GM', () => {
    expect(mapBootstrapAction({ mapsLoaded: true, mapsCount: 0, activeMapId: null, isGM: false })).toBe('wait')
  })

  test('player with an active map initializes it', () => {
    expect(mapBootstrapAction({ mapsLoaded: true, mapsCount: 3, activeMapId: 'map-1', isGM: false })).toBe('init')
  })

  test('GM in a genuinely new session creates the first map', () => {
    expect(mapBootstrapAction({ mapsLoaded: true, mapsCount: 0, activeMapId: null, isGM: true })).toBe('create')
  })

  test('GM with maps but no active map adopts the first', () => {
    expect(mapBootstrapAction({ mapsLoaded: true, mapsCount: 2, activeMapId: null, isGM: true })).toBe('adopt_first')
  })

  test('GM with maps and an active map initializes it', () => {
    expect(mapBootstrapAction({ mapsLoaded: true, mapsCount: 2, activeMapId: 'map-1', isGM: true })).toBe('init')
  })
})
