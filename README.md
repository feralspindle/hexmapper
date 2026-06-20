# TTRPG Campaign Mapping Tool

a real-time multiplayer campaign management tool for tabletop RPG groups. Share a URL to invite players — no accounts required for guests.

Live at [squeak.guru](https://squeak.guru) but signups are currently closed

## Features

**Hex Map** — SVG-based overland map with flat-top hexes and axial coordinates. terrain painting, fog of war, hex notes, markers, and pan/zoom. GM-controlled fog reveal 

**Dungeon Mapper** — canvas-based collaborative dungeon mapper with a drawing FSM (rooms via click-drag, corridors via click-click). Per-room fog of war, annotations, and a dice section.

**Party Notebook** — quest log with goals, rewards, and completion tracking. session notes with per-player ownership.

**Party Vault** — pending loot pool with claim, split, assign, and store actions. party bank with gold/silver/copper ledger. group storage containers with slot tracking.

**Character System** — rollable character sheets with stats, inventory, and luck tokens (shadowdark specific). active character selection visible to all players. dice roller with macros, sound effects, and roll history

**Chat** — in-session party chat 

**Calendar** — in-world campaign calendar

**Real-time sync** — state syncs across connected clients through the Rust WebSocket server, with Supabase Realtime available during rollout


## Auth model

as of now the session UUID in the URL is the invite link & sharing it grants access. players authenticate via Supabase (Discord OAuth or magic link. again, as of now). the session owner is the GM & all other participants are players

## Project structure

```
src/                    Vue 3 frontend
  views/                HexMapView, DungeonView, HomeView, …
  components/           hex/, dungeon/, common/
  stores/               Pinia stores (one per domain)
  composables/          shared logic
  lib/                  supabase client, apiClient, dice sounds

server/                 Rust API server (Axum)
  src/
    domains/            notebook, vault, dungeon, map, dice, session, …
    auth.rs             JWT validation (Supabase JWKS / ES256)
    authz.rs            authorization helpers (session membership, ownership)
    error.rs            AppError → HTTP status mapping

deploy/                 DigitalOcean deployment
  docker-compose.yml    api + caddy + alloy
  Caddyfile             TLS termination + SPA + /api proxy
  deploy.sh             pull image + restart stack
  bootstrap.sh          one-time droplet setup
```

## Running locally

**Prerequisites:** Node 20+, Rust stable, Supabase

```bash
# Frontend
cp .env.example .env        # fill in VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY
npm install
npm run dev                 # http://localhost:5173

# API server
cp server/.env.example server/.env   # fill in DATABASE_URL, SUPABASE_URL, CORS_ALLOWED_ORIGIN
cd server
cargo run                   # http://localhost:8080
```

The frontend `VITE_API_BASE_URL` defaults to `http://localhost:8080/api` in development.
Set `VITE_REALTIME_TRANSPORT=rust` after applying the realtime notification migration;
use `supabase` to retain the previous transport during rollout.

The short version:

1. Fork, set the GitHub secrets listed in `deploy/README.md`
2. Push to `main` — CI builds the Rust image, pushes it to GHCR, and SSHes the droplet to pull and restart
3. Frontend changes (`src/**`) trigger a separate workflow that builds and rsyncs `dist/` without touching the server container

## License

MIT
