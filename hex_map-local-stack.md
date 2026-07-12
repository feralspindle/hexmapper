# hex_map local stack

Three components, started in this order: **Supabase** (DB + auth) → **Rust backend** (`:8080`) → **Vite frontend** (`:5173`). All commands run from the repo root (`~/Documents/Projects/hex_map`).

Open the app at **http://localhost:5173** — not `127.0.0.1:5173`, because the backend's CORS is pinned to the `localhost` origin.

## Commands

`make up` is the whole thing. It starts Supabase (only if it's not already up), builds and starts the backend with `server/.env` sourced in, waits for `/api/healthz`, then starts Vite and waits for `:5173` — in that order. Backend and frontend run as native background processes; logs and pids live in `.dev-stack/` (gitignored). Only Supabase runs in Docker.

| command | what it does |
|---|---|
| `make up` | start all three in order, health-gated. re-running is safe (skips whatever's already up) |
| `make down` | stop frontend + backend, then `supabase stop` (keeps db data) |
| `make restart` | down then up |
| `make status` | check whether each of the three is up |
| `make logs` | tail backend + frontend logs |
| `make wipe` | stop everything and `supabase stop --no-backup` — wipes local data, fresh migrations + seed on next `up` |

The logic is `scripts/dev-stack.sh`; the Makefile is a thin wrapper. To run a piece by hand, `supabase start` / `supabase status`, `cargo run --manifest-path server/Cargo.toml` (source `server/.env` first: `set -a; . server/.env; set +a`), and `npm run dev`.

## Endpoints when running

| What | URL |
|---|---|
| App | http://localhost:5173 |
| Backend health | http://127.0.0.1:8080/api/healthz |
| Supabase API / auth | http://127.0.0.1:54321 |
| Postgres | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` |
| Studio | http://127.0.0.1:54323 |
| Mailpit (outbound email) | http://127.0.0.1:54324 |

`supabase status` prints these URLs plus the keys.

## Env files: local vs prod

Both `.env` (frontend) and `server/.env` (backend) are gitignored and must point at the **same** Supabase instance — the backend verifies JWTs against `{SUPABASE_URL}/auth/v1/.well-known/jwks.json`, so a mismatch makes every login fail verification. `make up` warns if the two urls don't match.

Local values:

```sh
# .env
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY=<printed by supabase start / supabase status>
VITE_API_BASE_URL=http://127.0.0.1:8080/api

# server/.env
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
SUPABASE_URL=http://127.0.0.1:54321
CORS_ALLOWED_ORIGIN=http://localhost:5173
```

The remote-pointing originals are backed up as `.env.prod-backup` and `server/.env.prod-backup`; swap them back to target the remote Supabase again. Vite reads `.env` only at startup, so after editing it, `make restart` (or restart Vite) for changes to take effect.

## Seeded logins

Email confirmation is off locally. All passwords are `HexmapE2E123`:

- `e2e-gm@example.test`
- `e2e-player1@example.test`
- `e2e-player2@example.test`

## If everything suddenly 401s or errors

1. `make status` — which of the three is down?
2. Logins failing verification usually means frontend and backend point at different Supabase instances — recheck both env files, then `make restart`.
3. `make logs` for backend/frontend output.
