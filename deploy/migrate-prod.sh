#!/usr/bin/env bash
# Applies the event-sourcing migration set to a target Supabase project, in order:
# the events table, all genesis backfills, the replica-identity changes, and the
# maps double-precision tweak. Everything is idempotent + additive (no projection
# data is modified). The cutover RLS write-lock (…40_lock_write_rls) is deliberately
# SKIPPED — that's the separate go-live step.
#
#   TARGET_DATABASE_URL="<connection>" bash deploy/migrate-prod.sh
#
# Use the project's SESSION-POOLER connection if running from a host without IPv6
# (the direct db.<ref>.supabase.co endpoint is IPv6-only).
set -euo pipefail

: "${TARGET_DATABASE_URL:?set TARGET_DATABASE_URL to the project to migrate}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/server"

shopt -s nullglob
for f in "$ROOT"/supabase/migrations/20260620*.sql; do
  base="$(basename "$f")"
  if [[ "$base" == *lock_write_rls* ]]; then
    echo "==> SKIP  $base   (cutover RLS lock — apply later, deliberately)"
    continue
  fi
  echo "==> apply $base"
  DATABASE_URL="$TARGET_DATABASE_URL" cargo run -q --example apply_sql -- "$f"
done

echo
echo "✅ event-sourcing migrations applied (RLS write-lock intentionally skipped)."
echo "   verify with:  DATABASE_URL=\"\$TARGET_DATABASE_URL\" cargo run --example migration_audit"
