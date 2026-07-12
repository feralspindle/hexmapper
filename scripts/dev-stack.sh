#!/usr/bin/env bash
# local dev stack orchestration: supabase -> rust backend (:8080) -> vite frontend (:5173)
# see hex_map-local-stack.md for the manual commands this wraps.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

RUN_DIR="$REPO_ROOT/.dev-stack"
mkdir -p "$RUN_DIR"

BACKEND_PID="$RUN_DIR/backend.pid"
FRONTEND_PID="$RUN_DIR/frontend.pid"
BACKEND_LOG="$RUN_DIR/backend.log"
FRONTEND_LOG="$RUN_DIR/frontend.log"

BACKEND_PORT=8080
FRONTEND_PORT=5173
SUPABASE_API="http://127.0.0.1:54321"
BACKEND_HEALTH="http://127.0.0.1:${BACKEND_PORT}/api/healthz"
FRONTEND_URL="http://localhost:${FRONTEND_PORT}"

say()  { printf '\033[1;36m▸ %s\033[0m\n' "$*"; }
ok()   { printf '\033[1;32m✓ %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m! %s\033[0m\n' "$*" >&2; }
die()  { printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

port_pid() { lsof -ti ":$1" 2>/dev/null || true; }

# frontend and backend must point at the same supabase, or every login fails jwt
# verification against {SUPABASE_URL}/auth/v1/.well-known/jwks.json.
check_env_match() {
  [ -f .env ] || { warn ".env missing (frontend). copy .env.example and fill it in."; return; }
  [ -f server/.env ] || { warn "server/.env missing (backend)."; return; }
  local front back
  front="$(grep -E '^VITE_SUPABASE_URL=' .env | head -1 | cut -d= -f2- | tr -d '"'"'"' ')"
  back="$(grep -E '^SUPABASE_URL=' server/.env | head -1 | cut -d= -f2- | tr -d '"'"'"' ')"
  if [ -n "$front" ] && [ -n "$back" ] && [ "$front" != "$back" ]; then
    warn "supabase url mismatch: frontend=$front backend=$back — logins will fail jwt verification"
  fi
}

wait_for() { # url, label, timeout_seconds, [expect_body]
  local url="$1" label="$2" timeout="$3" expect="${4:-}" start body
  start=$(date +%s)
  while true; do
    if [ -n "$expect" ]; then
      body="$(curl -fsS "$url" 2>/dev/null || true)"
      [ "$body" = "$expect" ] && { ok "$label up"; return 0; }
    else
      curl -fsS -o /dev/null "$url" 2>/dev/null && { ok "$label up"; return 0; }
    fi
    if [ $(( $(date +%s) - start )) -ge "$timeout" ]; then
      die "$label did not come up within ${timeout}s (see log)"
    fi
    sleep 1
  done
}

start_supabase() {
  if supabase status >/dev/null 2>&1; then
    ok "supabase already running"
  else
    say "starting supabase (applies migrations + seed on first boot)"
    supabase start
  fi
}

start_backend() {
  if [ -n "$(port_pid $BACKEND_PORT)" ]; then
    ok "backend already listening on :$BACKEND_PORT"
    return
  fi
  [ -f server/.env ] || die "server/.env missing — backend can't start"
  say "building backend (first build is slow, later ones are cached)"
  cargo build --manifest-path server/Cargo.toml
  say "starting backend on :$BACKEND_PORT (logging to $BACKEND_LOG)"
  # the binary doesn't read server/.env itself, so source it into this subshell.
  ( set -a; . server/.env; set +a
    exec cargo run --manifest-path server/Cargo.toml ) >"$BACKEND_LOG" 2>&1 &
  echo $! >"$BACKEND_PID"
  wait_for "$BACKEND_HEALTH" "backend" 120 "ok"
}

start_frontend() {
  if [ -n "$(port_pid $FRONTEND_PORT)" ]; then
    ok "frontend already listening on :$FRONTEND_PORT"
    return
  fi
  say "starting frontend on :$FRONTEND_PORT (logging to $FRONTEND_LOG)"
  npm run dev >"$FRONTEND_LOG" 2>&1 &
  echo $! >"$FRONTEND_PID"
  wait_for "$FRONTEND_URL" "frontend" 60
}

stop_proc() { # pidfile, port, label
  local pidfile="$1" port="$2" label="$3" pid
  pid=""
  [ -f "$pidfile" ] && pid="$(cat "$pidfile" 2>/dev/null || true)"
  [ -z "$pid" ] && pid="$(port_pid "$port")"
  if [ -n "$pid" ]; then
    say "stopping $label ($pid)"
    kill $pid 2>/dev/null || true
  else
    ok "$label not running"
  fi
  rm -f "$pidfile"
}

cmd_up() {
  check_env_match
  start_supabase
  start_backend
  start_frontend
  echo
  ok "stack up"
  echo "  app:      $FRONTEND_URL   (use localhost, not 127.0.0.1 — backend cors is pinned to it)"
  echo "  backend:  $BACKEND_HEALTH"
  echo "  studio:   http://127.0.0.1:54323"
  echo "  mailpit:  http://127.0.0.1:54324"
  echo
  echo "  seeded logins (password HexmapE2E123): e2e-gm@ / e2e-player1@ / e2e-player2@example.test"
  echo "  logs:     make logs   |   stop: make down"
}

cmd_down() {
  stop_proc "$FRONTEND_PID" "$FRONTEND_PORT" "frontend"
  stop_proc "$BACKEND_PID"  "$BACKEND_PORT"  "backend"
  say "stopping supabase (keeps db data — use 'make wipe' to reset)"
  supabase stop || true
  ok "stack down"
}

cmd_status() {
  if supabase status >/dev/null 2>&1; then ok "supabase running"; else warn "supabase down"; fi
  if [ "$(curl -fsS "$BACKEND_HEALTH" 2>/dev/null || true)" = "ok" ]; then ok "backend up"; else warn "backend down"; fi
  if curl -fsS -o /dev/null "$FRONTEND_URL" 2>/dev/null; then ok "frontend up"; else warn "frontend down"; fi
}

cmd_logs() {
  local logs=()
  [ -f "$BACKEND_LOG" ]  && logs+=("$BACKEND_LOG")
  [ -f "$FRONTEND_LOG" ] && logs+=("$FRONTEND_LOG")
  [ ${#logs[@]} -eq 0 ] && die "no logs yet — start the stack first"
  tail -n 40 -f "${logs[@]}"
}

cmd_wipe() {
  stop_proc "$FRONTEND_PID" "$FRONTEND_PORT" "frontend"
  stop_proc "$BACKEND_PID"  "$BACKEND_PORT"  "backend"
  warn "wiping all local supabase data (fresh migrations + seed on next up)"
  supabase stop --no-backup || true
  ok "supabase data wiped"
}

case "${1:-up}" in
  up)      cmd_up ;;
  down)    cmd_down ;;
  restart) cmd_down; echo; cmd_up ;;
  status)  cmd_status ;;
  logs)    cmd_logs ;;
  wipe)    cmd_wipe ;;
  *) die "unknown command: ${1:-} (use up|down|restart|status|logs|wipe)" ;;
esac
