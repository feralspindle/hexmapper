#!/usr/bin/env bash
# Local verify environment: throwaway postgres (user-space, no docker) with the
# real migrations applied, a fake supabase auth endpoint, and the rust server
# on top. One command up, one command down, pid files so leftovers from a
# previous run can't squat on the ports.
#
#   scripts/verify-env.sh start        # pg + migrations + auth stub + server
#   scripts/verify-env.sh stop
#   scripts/verify-env.sh status
#   scripts/verify-env.sh seed         # gm/player users + a session, prints tokens
#   scripts/verify-env.sh token <user-uuid> [name]
#   scripts/verify-env.sh psql [args]  # psql into the env db
#
# Lower-level subcommands (used by test-db-local.sh): ensure-pg, fresh-db <name>,
# install-pgtap. Ports/dirs override via HEXMAP_VERIFY_{HOME,PG_PORT,AUTH_PORT,API_PORT}.

set -euo pipefail
ROOT=$(git rev-parse --show-toplevel)
VHOME=${HEXMAP_VERIFY_HOME:-$HOME/.cache/hexmap-verify}
PG_PORT=${HEXMAP_VERIFY_PG_PORT:-55432}
AUTH_PORT=${HEXMAP_VERIFY_AUTH_PORT:-55321}
API_PORT=${HEXMAP_VERIFY_API_PORT:-8091}
DB=hexmap_verify
PGTAP_VERSION=1.3.3

PGPKG=$VHOME/pgbin/node_modules/@embedded-postgres/linux-$(uname -m | sed 's/aarch64/arm64/;s/x86_64/x64/')
PGBIN=$PGPKG/native/bin
PGDATA=$VHOME/pgdata
export PGHOST=127.0.0.1 PGPORT=$PG_PORT PGUSER=postgres

mkdir -p "$VHOME"

ensure_pg() {
  if [ ! -x "$PGBIN/initdb" ]; then
    echo "==> installing embedded postgres (one-time)"
    npm install --prefix "$VHOME/pgbin" "@embedded-postgres/linux-$(uname -m | sed 's/aarch64/arm64/;s/x86_64/x64/')" >/dev/null
  fi
  if [ ! -d "$PGDATA" ]; then
    "$PGBIN/initdb" -D "$PGDATA" -U postgres --auth=trust -E UTF8 >/dev/null
  fi
  if ! "$PGBIN/pg_ctl" -D "$PGDATA" status >/dev/null 2>&1; then
    "$PGBIN/pg_ctl" -D "$PGDATA" -l "$VHOME/pg.log" -o "-p $PG_PORT -k $VHOME" start >/dev/null
  fi
}

# drop + recreate a database, then compat shim + every real migration in order
fresh_db() {
  local db=$1 out
  psql -d postgres -qc "drop database if exists $db" >/dev/null 2>&1 || true
  psql -d postgres -qc "create database $db" >/dev/null
  if ! out=$(psql -d "$db" -v ON_ERROR_STOP=1 -q -f "$ROOT/scripts/supabase-compat.sql" 2>&1); then
    echo "supabase-compat.sql failed:"; echo "$out" | tail -5; return 1
  fi
  local f
  for f in "$ROOT"/supabase/migrations/*.sql; do
    if ! out=$(psql -d "$db" -v ON_ERROR_STOP=1 -q -f "$f" 2>&1); then
      echo "migration failed: $(basename "$f")"; echo "$out" | tail -5; return 1
    fi
  done
}

install_pgtap() {
  local extdir="$PGPKG/native/share/postgresql/extension"
  [ -f "$extdir/pgtap--$PGTAP_VERSION.sql" ] && return 0
  local zip="$VHOME/pgtap-$PGTAP_VERSION.zip"
  if [ ! -f "$zip" ]; then
    echo "==> fetching pgtap $PGTAP_VERSION"
    curl -fsSL -o "$zip" "https://github.com/theory/pgtap/archive/refs/tags/v$PGTAP_VERSION.zip" || {
      echo "could not download pgtap (no network?)"; rm -f "$zip"; return 1
    }
  fi
  rm -rf "$VHOME/pgtap-$PGTAP_VERSION"
  unzip -oq "$zip" -d "$VHOME"
  mkdir -p "$extdir"
  sed -e 's/__VERSION__/1.3/g' -e 's/__OS__/linux/g' \
    "$VHOME/pgtap-$PGTAP_VERSION/sql/pgtap.sql.in" > "$extdir/pgtap--$PGTAP_VERSION.sql"
  cp "$VHOME/pgtap-$PGTAP_VERSION/pgtap.control" "$extdir/"
}

alive() { [ -f "$1" ] && kill -0 "$(cat "$1")" 2>/dev/null; }

stop_pidfile() {
  if alive "$1"; then kill "$(cat "$1")" 2>/dev/null || true; fi
  rm -f "$1"
}

start_auth() {
  alive "$VHOME/auth.pid" && return 0
  HEXMAP_VERIFY_HOME=$VHOME nohup node "$ROOT/scripts/verify-auth.mjs" serve "$AUTH_PORT" \
    > "$VHOME/auth.log" 2>&1 &
  echo $! > "$VHOME/auth.pid"
  sleep 0.3
  curl -fsS -m 3 "http://127.0.0.1:$AUTH_PORT/auth/v1/.well-known/jwks.json" >/dev/null || {
    echo "auth stub failed to start (see $VHOME/auth.log)"; return 1
  }
}

start_server() {
  if alive "$VHOME/server.pid"; then
    echo "server already running (pid $(cat "$VHOME/server.pid"))"; return 0
  fi
  echo "==> building server"
  (cd "$ROOT/server" && cargo build --quiet)
  local bin="${CARGO_TARGET_DIR:-$ROOT/server/target}/debug/hexmap-server"
  DATABASE_URL="postgresql://postgres@127.0.0.1:$PG_PORT/$DB" \
  SUPABASE_URL="http://127.0.0.1:$AUTH_PORT" \
  CORS_ALLOWED_ORIGIN="http://localhost:5173" \
  PORT=$API_PORT RUST_LOG=${RUST_LOG:-info} \
    nohup "$bin" > "$VHOME/server.log" 2>&1 &
  echo $! > "$VHOME/server.pid"
  local i
  for i in $(seq 1 20); do
    curl -fsS -m 1 "http://127.0.0.1:$API_PORT/api/healthz" >/dev/null 2>&1 && return 0
    sleep 0.5
  done
  echo "server failed to start (see $VHOME/server.log)"; return 1
}

cmd_start() {
  # a running server holds pool connections that would block the drop
  stop_pidfile "$VHOME/server.pid"
  ensure_pg
  echo "==> fresh $DB (compat + all migrations)"
  fresh_db "$DB"
  start_auth
  start_server
  echo
  echo "verify env up:"
  echo "  db       postgresql://postgres@127.0.0.1:$PG_PORT/$DB"
  echo "  api      http://127.0.0.1:$API_PORT/api  (origin: http://localhost:5173)"
  echo "  ws       ws://127.0.0.1:$API_PORT/api/realtime  (origin header required)"
  echo "  auth     http://127.0.0.1:$AUTH_PORT"
  echo "  logs     $VHOME/{server,auth,pg}.log"
  echo
  echo "next: scripts/verify-env.sh seed"
}

cmd_seed() {
  local gm=11111111-1111-1111-1111-111111111111
  local pl=22222222-2222-2222-2222-222222222222
  local ses=33333333-3333-3333-3333-333333333333
  psql -d "$DB" -v ON_ERROR_STOP=1 -q <<SQL
insert into auth.users (id, email) values
  ('$gm', 'verify-gm@example.test'), ('$pl', 'verify-player@example.test')
on conflict do nothing;
insert into sessions (id, name, owner_id) values ('$ses', 'verify session', '$gm')
on conflict do nothing;
insert into session_members (session_id, user_id) values ('$ses', '$pl')
on conflict do nothing;
SQL
  echo "SESSION_ID=$ses"
  echo "GM_ID=$gm"
  echo "PLAYER_ID=$pl"
  echo "GM_TOKEN=$(HEXMAP_VERIFY_HOME=$VHOME node "$ROOT/scripts/verify-auth.mjs" mint $gm GM)"
  echo "PLAYER_TOKEN=$(HEXMAP_VERIFY_HOME=$VHOME node "$ROOT/scripts/verify-auth.mjs" mint $pl Player)"
}

cmd_stop() {
  stop_pidfile "$VHOME/server.pid"
  stop_pidfile "$VHOME/auth.pid"
  if "$PGBIN/pg_ctl" -D "$PGDATA" status >/dev/null 2>&1; then
    "$PGBIN/pg_ctl" -D "$PGDATA" stop >/dev/null
  fi
  echo "verify env down"
}

cmd_status() {
  if [ -x "$PGBIN/pg_ctl" ] && "$PGBIN/pg_ctl" -D "$PGDATA" status >/dev/null 2>&1; then
    echo "pg      up  :$PG_PORT"
  else
    echo "pg      down"
  fi
  alive "$VHOME/auth.pid"   && echo "auth    up  :$AUTH_PORT (pid $(cat "$VHOME/auth.pid"))"   || echo "auth    down"
  alive "$VHOME/server.pid" && echo "server  up  :$API_PORT (pid $(cat "$VHOME/server.pid"))" || echo "server  down"
}

case "${1:-}" in
  start)        cmd_start ;;
  stop)         cmd_stop ;;
  status)       cmd_status ;;
  seed)         cmd_seed ;;
  token)        shift; HEXMAP_VERIFY_HOME=$VHOME exec node "$ROOT/scripts/verify-auth.mjs" mint "$@" ;;
  psql)         shift; exec psql -d "$DB" "$@" ;;
  ensure-pg)    ensure_pg ;;
  fresh-db)     ensure_pg; fresh_db "${2:?usage: fresh-db <name>}" ;;
  install-pgtap) install_pgtap ;;
  *)            sed -n '2,16p' "$0"; exit 1 ;;
esac
