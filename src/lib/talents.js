import { knownSpellNames } from './spells.js'

function bonusEffect(bonus) {
  if (!bonus?.bonusTo) return ''
  if (bonus.bonusAmount == null) return String(bonus.bonusTo)
  const amount = Number(bonus.bonusAmount)
  return `${bonus.bonusTo} ${amount >= 0 ? '+' : ''}${amount}`
}

export function characterTalents(character) {
  const talents = []
  const byKey = new Map()
  const upsert = name => {
    const trimmed = String(name ?? '').trim()
    const key = trimmed.toLowerCase()
    if (!key) return null
    let talent = byKey.get(key)
    if (!talent) {
      talent = { name: trimmed, description: '', effects: [], bonusIndex: null }
      byKey.set(key, talent)
      talents.push(talent)
    }
    return talent
  }

  ;(character?.bonuses ?? []).forEach((bonus, index) => {
    if (knownSpellNames({ bonuses: [bonus] }).length) return
    const talent = upsert(bonus.name ?? bonus.bonusName ?? bonus.sourceName)
    if (!talent) return
    talent.bonusIndex ??= index
    talent.category ??= bonus.sourceCategory
    talent.source ??= bonus.sourceName
    talent.sourceType ??= bonus.sourceType
    talent.level ??= bonus.gainedAtLevel
    const effect = bonusEffect(bonus)
    if (effect) talent.effects.push(effect)
  })

  const levelEntries = [
    ...(character?.levels ?? []),
    ...(character?.ambitionTalentLevel ? [{ ...character.ambitionTalentLevel, ambition: true }] : []),
  ]
  for (const entry of levelEntries) {
    const rolled = [
      [entry?.talentRolledName, entry?.talentRolledDesc],
      [entry?.Rolled12ChosenTalentName, entry?.Rolled12ChosenTalentDesc],
    ]
    for (const [name, desc] of rolled) {
      const description = String(desc ?? '').trim()
      const talent = upsert(String(name ?? '').trim() || description)
      if (!talent) continue
      if (description && !talent.description) talent.description = description
      talent.level ??= entry.level
      if (entry.ambition) talent.ambition = true
    }
  }

  return talents
}

export function talentSummaryFields(talent) {
  const source = talent.source
    ? talent.sourceType && talent.sourceType !== talent.source
      ? `${talent.source} (${talent.sourceType})`
      : talent.source
    : null
  return [
    talent.category ? { label: 'type', value: talent.category } : null,
    source ? { label: 'source', value: source } : null,
    talent.level != null ? { label: 'level', value: talent.ambition ? `${talent.level} (Ambition)` : talent.level } : null,
    talent.effects.length ? { label: 'bonus', value: talent.effects.join(', ') } : null,
  ].filter(Boolean)
}
