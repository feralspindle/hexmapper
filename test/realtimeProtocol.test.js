import test from 'node:test'
import assert from 'node:assert/strict'

import {
  matchesRealtimeFilter,
  mergeRealtimeSnapshot,
  realtimeConnectionIsStale,
  realtimeOperation,
  realtimeSnapshotRefreshNeeded,
  REALTIME_TABLES,
} from '../src/lib/realtimeProtocol.js'

test('maps durable event types to Supabase-compatible operations', () => {
  assert.equal(realtimeOperation('chat_message.sent'), 'INSERT')
  assert.equal(realtimeOperation('hex_cell.upserted'), 'UPDATE')
  assert.equal(realtimeOperation('session_member.left'), 'DELETE')
})

test('maps aggregate names to existing projection tables', () => {
  assert.equal(REALTIME_TABLES.hex_cell, 'hex_cells')
  assert.equal(REALTIME_TABLES.dungeon_fog_cell, 'dungeon_fog_cells')
  assert.equal(REALTIME_TABLES.party_calendar_day, 'party_calendar_days')
})

test('applies equality filters and permits sparse delete payloads', () => {
  const mapId = 'c0ffee00-0000-4000-8000-000000000000'
  assert.equal(matchesRealtimeFilter({ map_id: mapId }, `map_id=eq.${mapId}`), true)
  assert.equal(matchesRealtimeFilter({ map_id: 'different' }, `map_id=eq.${mapId}`), false)
  assert.equal(matchesRealtimeFilter({ id: 'deleted-row' }, `map_id=eq.${mapId}`), true)
})

test('detects stale connections and long background suspensions', () => {
  assert.equal(realtimeConnectionIsStale(100_000, 150_000, 65_000), false)
  assert.equal(realtimeConnectionIsStale(100_000, 170_000, 65_000), true)
  assert.equal(realtimeConnectionIsStale(0, 170_000, 65_000), true)
  assert.equal(realtimeSnapshotRefreshNeeded(59_999, 60_000), false)
  assert.equal(realtimeSnapshotRefreshNeeded(60_000, 60_000), true)
})

test('merges a reconnect snapshot with rows received during the fetch', () => {
  const snapshot = [
    { id: 'old', created_at: '2026-06-20T10:00:00Z', total: 5 },
    { id: 'shared', created_at: '2026-06-20T10:01:00Z', total: 8 },
  ]
  const liveRows = [
    { id: 'new', created_at: '2026-06-20T10:02:00Z', total: 20 },
    { id: 'shared', created_at: '2026-06-20T10:01:00Z', total: 9 },
  ]

  assert.deepEqual(mergeRealtimeSnapshot(snapshot, liveRows, 2), [liveRows[0], liveRows[1]])
})
