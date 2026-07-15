#!/usr/bin/env bash
# Run the pgTAP suite in supabase/tests/database without docker or the supabase
# cli: embedded postgres + scripts/supabase-compat.sql + the real migrations +
# pgtap installed as a normal extension. Used by test-all.sh when the supabase
# stack isn't running; CI still runs the suite from scratch via supabase.
#
# Setup problems (no network for the one-time downloads) warn and exit 0 so the
# pre-push hook isn't blocked by a machine that can't build the env; actual
# test failures always fail.

set -uo pipefail
ROOT=$(git rev-parse --show-toplevel)
ENV="$ROOT/scripts/verify-env.sh"
DB=hexmap_pgtap
PG_PORT=${HEXMAP_VERIFY_PG_PORT:-55432}
export PGHOST=127.0.0.1 PGPORT=$PG_PORT PGUSER=postgres

if ! "$ENV" ensure-pg || ! "$ENV" install-pgtap; then
  echo "    could not set up the local pgTAP env — skipping (CI still runs the suite)"
  exit 0
fi

if ! "$ENV" fresh-db "$DB"; then
  echo "pgTAP: migrations failed to apply — that is a real failure"
  exit 1
fi

failures=0
for t in "$ROOT"/supabase/tests/database/*.test.sql; do
  out=$(psql -d "$DB" -v ON_ERROR_STOP=1 -q -f "$t" 2>&1)
  rc=$?
  not_ok=$(echo "$out" | grep -cE "^[[:space:]]*not ok" || true)
  ok=$(echo "$out" | grep -cE "^[[:space:]]*ok [0-9]" || true)
  if [ $rc -ne 0 ] || [ "$not_ok" -gt 0 ]; then
    failures=$((failures + 1))
    echo "not ok  $(basename "$t")"
    echo "$out" | grep -E "^[[:space:]]*not ok|ERROR" | sed 's/^[[:space:]]*/        /' | head -10
  else
    echo "ok      $(basename "$t") ($ok asserts)"
  fi
done

psql -d postgres -qc "drop database if exists $DB" >/dev/null 2>&1
if [ "$failures" -gt 0 ]; then
  echo "pgTAP: $failures file(s) failing"
  exit 1
fi
