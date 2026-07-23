import { describe, expect, test } from 'vitest'
import { characterTalents, talentSummaryFields } from './talents.js'

const klara = {
  levels: [
    {
      level: 1,
      talentRolledDesc: '+2 to Strength, Dexterity, or Charisma stat',
      talentRolledName: 'StatBonus',
      Rolled12TalentOrTwoStatPoints: '',
      Rolled12ChosenTalentDesc: '',
      Rolled12ChosenTalentName: '',
    },
  ],
  ambitionTalentLevel: {
    level: 1,
    talentRolledDesc: '',
    talentRolledName: '',
    Rolled12ChosenTalentDesc: '',
    Rolled12ChosenTalentName: '',
  },
  bonuses: [
    { sourceType: 'Ancestry', sourceName: 'Half-Orc', sourceCategory: 'Trait', gainedAtLevel: 1, name: 'Mighty', bonusName: 'Plus1AttackAndDamageMelee', bonusTo: 'All Melee Weapons', bonusAmount: 1 },
    { sourceType: 'Class', sourceName: 'Paladin', sourceCategory: 'Ability', gainedAtLevel: 1, name: 'NamedBlade', bonusName: 'Plus0MagicWeapon', bonusTo: 'Bastard Sword', bonusAmount: 0 },
    { sourceType: 'Class', sourceName: 'Paladin', sourceCategory: 'Talent', gainedAtLevel: 1, name: 'StatBonus', bonusTo: 'CHA:+2', bonusName: 'StatBonus' },
  ],
}

describe('talent helpers', () => {
  test('merges imported bonuses with rolled talent descriptions', () => {
    const talents = characterTalents(klara)
    expect(talents.map(t => t.name)).toEqual(['Mighty', 'NamedBlade', 'StatBonus'])
    const statBonus = talents[2]
    expect(statBonus.description).toBe('+2 to Strength, Dexterity, or Charisma stat')
    expect(statBonus.bonusIndex).toBe(2)
    expect(talentSummaryFields(statBonus)).toEqual([
      { label: 'type', value: 'Talent' },
      { label: 'source', value: 'Paladin (Class)' },
      { label: 'level', value: 1 },
      { label: 'bonus', value: 'CHA:+2' },
    ])
  })

  test('formats signed bonus amounts', () => {
    const talents = characterTalents(klara)
    expect(talentSummaryFields(talents[0])).toContainEqual({ label: 'bonus', value: 'All Melee Weapons +1' })
    expect(talentSummaryFields(talents[1])).toContainEqual({ label: 'bonus', value: 'Bastard Sword +0' })
  })

  test('excludes spell-tagged bonuses and blank rolled slots', () => {
    const talents = characterTalents({
      bonuses: [{ sourceCategory: 'Spell', bonusName: 'Light' }],
      levels: [{ level: 2, talentRolledName: '', talentRolledDesc: '' }],
    })
    expect(talents).toEqual([])
  })

  test('keeps rolled talents that have no matching bonus entry', () => {
    const talents = characterTalents({
      levels: [{ level: 3, talentRolledName: 'ADV on initiative', talentRolledDesc: 'Roll initiative with advantage' }],
      ambitionTalentLevel: { level: 1, talentRolledName: 'Backstab', talentRolledDesc: '+1 backstab dice' },
    })
    expect(talents).toHaveLength(2)
    expect(talents[0]).toMatchObject({ name: 'ADV on initiative', description: 'Roll initiative with advantage', level: 3, bonusIndex: null })
    expect(talentSummaryFields(talents[1])).toContainEqual({ label: 'level', value: '1 (Ambition)' })
  })

  test('labels manual talents added from the sheet', () => {
    const talents = characterTalents({
      bonuses: [{ bonusName: 'Keen Senses', sourceName: 'Manual', sourceCategory: 'Manual', gainedAtLevel: 2 }],
    })
    expect(talents[0].name).toBe('Keen Senses')
    expect(talentSummaryFields(talents[0])).toEqual([
      { label: 'type', value: 'Manual' },
      { label: 'source', value: 'Manual' },
      { label: 'level', value: 2 },
    ])
  })
})
