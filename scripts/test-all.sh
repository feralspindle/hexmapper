#!/usr/bin/env bash
# Full local test suite — everything CI gates on that can run on this machine.
# Used by the pre-push hook and available directly as `npm run test:all`.
#
# The Rust integration tests need a throwaway Postgres; when the local supabase
# stack is up we create a scratch database on it (never the dev DB — the tests
# drop tables). Without it they skip, exactly as they do in a bare `cargo test`.

set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

PG_HOST="${HEXMAP_PG_HOST:-127.0.0.1}"
PG_PORT="${HEXMAP_PG_PORT:-54322}"
SCRATCH_DB=hexmap_prepush_scratch

pg() {
  PGPASSWORD=postgres psql -h "$PG_HOST" -p "$PG_PORT" -U postgres -d postgres "$@"
}

echo "==> frontend unit tests (vitest)"
npx vitest run

echo "==> frontend build check (vite build)"
npm run build

echo "==> e2e spec collection check (playwright --list)"
npx playwright test --list >/dev/null

echo "==> backend tests (cargo test)"
if pg -c 'select 1' >/dev/null 2>&1; then
  pg -c "drop database if exists ${SCRATCH_DB};" -c "create database ${SCRATCH_DB};" >/dev/null
  trap 'pg -c "drop database if exists ${SCRATCH_DB};" >/dev/null 2>&1 || true' EXIT
  (cd server && DATABASE_URL="postgresql://postgres:postgres@${PG_HOST}:${PG_PORT}/${SCRATCH_DB}" cargo test)
else
  echo "    local supabase Postgres not reachable — DB-backed integration tests will skip (CI still runs them)"
  (cd server && cargo test)
fi

echo "==> database tests (pgTAP)"
if supabase status >/dev/null 2>&1; then
  supabase test db
else
  echo "    supabase stack not running — skipping pgTAP suite (CI still runs it from scratch)"
fi

echo "==> all suites passed"
