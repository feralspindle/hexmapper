import { describe, test, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { TERRAIN_TYPES } from './hexStore.js'

const GENERATE_RS = resolve(process.cwd(), 'server/src/domains/hex/generate.rs')

function rustStringList(source, constName) {
  const match = source.match(new RegExp(`const ${constName}[^;]+;`, 's'))
  expect(match, `${constName} not found in generate.rs`).toBeTruthy()
  return [...match[0].matchAll(/"([a-z]+)"/g)].map(m => m[1])
}

describe('terrain id contract between server generation and TERRAIN_TYPES', () => {
  const source = readFileSync(GENERATE_RS, 'utf8')
  const frontendIds = TERRAIN_TYPES.map(t => t.id)

  test('server TERRAIN_IDS matches TERRAIN_TYPES exactly', () => {
    expect(rustStringList(source, 'TERRAIN_IDS')).toEqual(frontendIds)
  })

  test('server fallback terrain only uses known ids', () => {
    const fallbackIds = rustStringList(source, 'FALLBACK_TERRAIN')
    expect(fallbackIds.length).toBeGreaterThan(0)
    for (const id of fallbackIds) {
      expect(frontendIds).toContain(id)
    }
  })
})
