import { describe, expect, test } from 'vitest'
import { findSpellEntry, knownSpellNames, spellDescription, spellSummaryFields } from './spells.js'

describe('spell helpers', () => {
  test('combines legacy spell text and spell-tagged bonuses without duplicates', () => {
    expect(knownSpellNames({
      spellsKnown: 'Light, Antimagic Shell\nSleep',
      bonuses: [
        { sourceCategory: 'Spell', bonusName: 'Light' },
        { sourceType: 'Spell', sourceName: 'Fireball' },
        { sourceCategory: 'Talent', bonusName: 'Alert' },
      ],
    })).toEqual(['Light', 'Antimagic Shell', 'Sleep', 'Fireball'])
  })

  test('matches compendium spell names without case sensitivity', () => {
    const spell = { name: 'Antimagic Shell', data: { tier: 5 } }
    expect(findSpellEntry([spell], 'ANTIMAGIC SHELL')).toBe(spell)
  })

  test('extracts the standard facts and description', () => {
    const data = { tier: 5, class: 'wizard', duration: 'Focus', range: 'Self', effect: 'A cube of null-magic appears.' }
    expect(spellSummaryFields(data)).toEqual([
      { label: 'tier', value: 5 },
      { label: 'class', value: 'wizard' },
      { label: 'duration', value: 'Focus' },
      { label: 'range', value: 'Self' },
    ])
    expect(spellDescription(data)).toBe('A cube of null-magic appears.')
  })
})
