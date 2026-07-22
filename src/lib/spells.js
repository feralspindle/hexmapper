function spellNameFromBonus(bonus) {
  const category = String(bonus?.sourceCategory ?? '').toLowerCase()
  const type = String(bonus?.sourceType ?? '').toLowerCase()
  if (!category.includes('spell') && !type.includes('spell')) return null
  return bonus.bonusName ?? bonus.name ?? bonus.sourceName ?? null
}

export function knownSpellNames(character) {
  const names = []
  const raw = character?.spellsKnown
  if (Array.isArray(raw)) {
    for (const spell of raw) names.push(typeof spell === 'string' ? spell : spell?.name)
  } else if (raw && String(raw).trim().toLowerCase() !== 'none') {
    names.push(...String(raw).split(/[\n,;]+/))
  }
  for (const bonus of character?.bonuses ?? []) names.push(spellNameFromBonus(bonus))
  const seen = new Set()
  return names
    .map(name => String(name ?? '').trim())
    .filter(name => {
      const key = name.toLowerCase()
      if (!key || seen.has(key)) return false
      seen.add(key)
      return true
    })
}

export function findSpellEntry(entries, name) {
  const key = String(name ?? '').trim().toLowerCase()
  return entries.find(entry => String(entry.name ?? '').trim().toLowerCase() === key) ?? null
}

export function spellSummaryFields(data = {}) {
  const aliases = {
    tier: ['tier'],
    class: ['class', 'classes'],
    duration: ['duration'],
    range: ['range'],
  }
  return Object.entries(aliases).map(([label, keys]) => {
    const key = keys.find(candidate => data[candidate] != null && data[candidate] !== '')
    return key ? { label, value: data[key] } : null
  }).filter(Boolean)
}

export function spellDescription(data = {}) {
  for (const key of ['description', 'effect', 'text', 'details', 'body']) {
    if (data[key]) return String(data[key])
  }
  return ''
}
