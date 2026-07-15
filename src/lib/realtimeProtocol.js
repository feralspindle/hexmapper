export const REALTIME_TABLES = {
  character: 'characters',
  chat_message: 'chat_messages',
  dice_roll: 'dice_rolls',
  dice_roll_annotation: 'dice_roll_annotations',
  dungeon: 'dungeons',
  dungeon_activity: 'dungeon_activity',
  dungeon_cell_note: 'dungeon_cell_notes',
  dungeon_corridor: 'dungeon_corridors',
  dungeon_element_note: 'dungeon_element_notes',
  dungeon_fog_cell: 'dungeon_fog_cells',
  dungeon_icon: 'dungeon_icons',
  dungeon_room: 'dungeon_rooms',
  dungeon_token: 'dungeon_tokens',
  hex_cell: 'hex_cells',
  hex_note: 'hex_notes',
  map: 'maps',
  oracle_roll: 'oracle_rolls',
  oracle_table: 'oracle_tables',
  oracle_table_row: 'oracle_table_rows',
  party_bank_ledger: 'party_bank_ledger',
  party_calendar_day: 'party_calendar_days',
  party_calendar_settings: 'party_calendar_settings',
  party_quest: 'party_quests',
  party_session_note: 'party_session_notes',
  party_vault_activity: 'party_vault_activity',
  party_vault_container: 'party_vault_containers',
  party_vault_item: 'party_vault_items',
  party_vault_loot: 'party_vault_loot',
  photo_broadcast: 'photo_broadcasts',
  reference_photo: 'reference_photos',
  session: 'sessions',
  session_member: 'session_members',
}

export function realtimeOperation(event) {
  const suffix = event.split('.').at(-1)
  if (suffix === 'deleted' || suffix === 'left') return 'DELETE'
  if (['created', 'joined', 'sent', 'rolled', 'recorded', 'revealed'].includes(suffix)) return 'INSERT'
  return 'UPDATE'
}

// A row missing the filtered column only matches when `lenientMissing` is set.
// Delete payloads are sparse (often `{}` plus injected ids) and their handlers key
// removals by id, so cross-context delivery is a no-op — but applying an
// insert/update payload without its scoping column would bleed data across
// maps/dungeons, so those must not match.
export function matchesRealtimeFilter(row, filter, lenientMissing = false) {
  if (!filter) return true
  const match = /^([a-zA-Z0-9_]+)=eq\.(.+)$/.exec(filter)
  if (!match) return true
  const value = row[match[1]]
  if (value == null) return lenientMissing
  return String(value) === match[2]
}

export function realtimeConnectionIsStale(lastMessageAt, now, timeoutMs) {
  return lastMessageAt <= 0 || now - lastMessageAt > timeoutMs
}

export function realtimeSnapshotRefreshNeeded(hiddenForMs, thresholdMs) {
  return hiddenForMs >= thresholdMs
}

export function accessTokenNeedsRefresh(expiresAtSeconds, nowMs, marginSeconds) {
  if (!expiresAtSeconds) return false
  return expiresAtSeconds - nowMs / 1000 <= marginSeconds
}

export function connectionWasStable(readyAtMs, nowMs, stableAfterMs) {
  return readyAtMs != null && nowMs - readyAtMs >= stableAfterMs
}

export function snapshotRefreshDelay(lastStartedAtMs, nowMs, minIntervalMs) {
  if (lastStartedAtMs == null) return 0
  const elapsed = nowMs - lastStartedAtMs
  return elapsed >= minIntervalMs ? 0 : minIntervalMs - elapsed
}

// counted set of keys whose optimistic writes are still in flight. while a
// key is pending, realtime echoes for it (ours or another client's) carry a
// value staler than what we've already applied locally, so stores skip them.
// counts (not booleans) so overlapping writes to one key release correctly
export function pendingKeys() {
  const counts = new Map()
  return {
    begin(keys) {
      for (const key of keys) counts.set(key, (counts.get(key) ?? 0) + 1)
    },
    end(keys) {
      for (const key of keys) {
        const count = counts.get(key) ?? 0
        if (count <= 1) counts.delete(key)
        else counts.set(key, count - 1)
      }
    },
    has(key) { return counts.has(key) },
    count(key) { return counts.get(key) ?? 0 },
    keys() { return counts.keys() },
    clear() { counts.clear() },
  }
}

export function mergeRealtimeSnapshot(snapshot, liveRows, limit) {
  const rows = new Map(snapshot.map(row => [row.id, row]))
  for (const row of liveRows) rows.set(row.id, { ...rows.get(row.id), ...row })
  return [...rows.values()]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, limit)
}
