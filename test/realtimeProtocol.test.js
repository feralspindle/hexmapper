import { describe, test, expect } from 'vitest'

import {
  matchesRealtimeFilter,
  mergeRealtimeSnapshot,
  realtimeConnectionIsStale,
  realtimeOperation,
  realtimeSnapshotRefreshNeeded,
  REALTIME_TABLES,
} from '../src/lib/realtimeProtocol.js'

describe('realtimeProtocol', () => {
  test('maps durable event types to Supabase-compatible operations', () => {
    expect(realtimeOperation('chat_message.sent')).toBe('INSERT')
    expect(realtimeOperation('hex_cell.upserted')).toBe('UPDATE')
    expect(realtimeOperation('session_member.left')).toBe('DELETE')
  })

  test('maps aggregate names to existing projection tables', () => {
    expect(REALTIME_TABLES.hex_cell).toBe('hex_cells')
    expect(REALTIME_TABLES.dungeon_fog_cell).toBe('dungeon_fog_cells')
    expect(REALTIME_TABLES.party_calendar_day).toBe('party_calendar_days')
    expect(REALTIME_TABLES.dungeon_icon).toBe('dungeon_icons')
    expect(REALTIME_TABLES.dungeon_cell_note).toBe('dungeon_cell_notes')
  })

  test('applies equality filters strictly, with leniency reserved for sparse delete payloads', () => {
    const mapId = 'c0ffee00-0000-4000-8000-000000000000'
    expect(matchesRealtimeFilter({ map_id: mapId }, `map_id=eq.${mapId}`)).toBe(true)
    expect(matchesRealtimeFilter({ map_id: 'different' }, `map_id=eq.${mapId}`)).toBe(false)
    expect(matchesRealtimeFilter({ id: 'updated-row' }, `map_id=eq.${mapId}`)).toBe(false)
    expect(matchesRealtimeFilter({ id: 'deleted-row' }, `map_id=eq.${mapId}`, true)).toBe(true)
    expect(matchesRealtimeFilter({ map_id: 'different' }, `map_id=eq.${mapId}`, true)).toBe(false)
  })

  test('detects stale connections and long background suspensions', () => {
    expect(realtimeConnectionIsStale(100_000, 150_000, 65_000)).toBe(false)
    expect(realtimeConnectionIsStale(100_000, 170_000, 65_000)).toBe(true)
    expect(realtimeConnectionIsStale(0, 170_000, 65_000)).toBe(true)
    expect(realtimeSnapshotRefreshNeeded(59_999, 60_000)).toBe(false)
    expect(realtimeSnapshotRefreshNeeded(60_000, 60_000)).toBe(true)
  })

  test('merges a reconnect snapshot with rows received during the fetch', () => {
    const snapshot = [
      { id: 'old', created_at: '2026-06-20T10:00:00Z', total: 5 },
      { id: 'shared', created_at: '2026-06-20T10:01:00Z', total: 8, display_name: 'Rook' },
    ]
    const liveRows = [
      { id: 'new', created_at: '2026-06-20T10:02:00Z', total: 20 },
      { id: 'shared', created_at: '2026-06-20T10:01:00Z', total: 9 },
    ]

    expect(mergeRealtimeSnapshot(snapshot, liveRows, 2)).toEqual([
      liveRows[0],
      { ...snapshot[1], ...liveRows[1] },
    ])
  })
})
