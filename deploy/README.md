# Deployment — single droplet + Cloudflare

The Vue SPA and the Rust API run on **one DigitalOcean droplet** behind **Cloudflare**.
Same-origin: Caddy serves the SPA and reverse-proxies `/api/*` to the Rust server.
Supabase (Postgres/Auth/Realtime/Storage) stays remote.

```
Browser → Cloudflare (edge TLS, CDN, /api/* cache-bypass)
        → Caddy :443 (Cloudflare Origin cert)
            /api/* → api:8080   (Rust)
            /*     → /srv/www    (SPA, try_files → index.html)
        → Supabase (direct from the browser for Auth/Realtime/Storage)
```

## Droplet layout (data/secrets live outside git)

```
/opt/hexmap/
├── repo/     # git clone of this project  (deploy.sh runs from repo/deploy)
├── www/      # CI rsyncs the built SPA here  (NOT in git)
├── certs/    # origin.pem + origin.key  (Cloudflare Origin cert, NOT in git)
└── .env      # API + DOMAIN secrets  (from deploy/.env.example, NOT in git)
```

## One-time setup

1. **Droplet** — create in **the same region as your Supabase project** (commit latency
   is dominated by droplet↔Supabase RTT). 2 GB / amd64 / Ubuntu 24.04 LTS.

2. **Layout + Docker** — clone the repo, then run `bootstrap.sh` (installs Docker, creates
   `/opt/hexmap/{www,certs}`, scaffolds `.env`, adds the deploy user to the `docker` group):
   ```bash
   sudo git clone <repo-url> /opt/hexmap/repo     # your own git auth (token / gh / public)
   sudo bash /opt/hexmap/repo/deploy/bootstrap.sh
   sudo nano /opt/hexmap/.env                     # fill in DATABASE_URL, SUPABASE_URL, DOMAIN, API_IMAGE, ...
   ```

3. **Domain + Cloudflare**
   - Point the domain's nameservers at Cloudflare; add an **A record** for the apex (and/or
     a `staging` sub) → droplet IP, **proxied (orange cloud)**.
   - SSL/TLS mode → **Full (strict)**.
   - SSL/TLS → Origin Server → **Create Certificate** → save the cert to
     `/opt/hexmap/certs/origin.pem` and the key to `/opt/hexmap/certs/origin.key`.
   - Rules → **Cache Rule**: if URI path starts with `/api/` → **Bypass cache**
     (otherwise Cloudflare may cache `GET /api/...`).

4. **GHCR pull access** — the API image is published to GitHub Container Registry by CI.
   Set `API_IMAGE` in `/opt/hexmap/.env` (e.g. `ghcr.io/<owner>/hexmap-server:latest`,
   owner lowercase). The droplet must be able to pull it:
   - If the repo/package is **private**, log in once on the droplet:
     ```bash
     echo <GHCR_PAT_with_read:packages> | docker login ghcr.io -u <github-user> --password-stdin
     ```
   - Or make the package **public** (Packages → settings → change visibility) — the image
     holds no secrets (env comes from `.env` at runtime).

5. **GitHub repo secrets**, then push to `main` (the first push builds the image and runs
   the first deploy; or trigger the workflows manually):
   | secret | value |
   |---|---|
   | `DEPLOY_HOST` | droplet IP / hostname |
   | `DEPLOY_USER` | ssh user with write to `/opt/hexmap/www` + docker access |
   | `DEPLOY_SSH_KEY` | private key (matching an authorized key on the droplet) |
   | `VITE_SUPABASE_URL` | `https://<ref>.supabase.co` |
   | `VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY` | Supabase publishable/anon key |

   (Pushing the image uses the built-in `GITHUB_TOKEN` — no secret needed.)

## Deploys — automatic on push to `main` (Vercel-style)

Path-filtered, so each push only rebuilds what changed:

- **Frontend** (`.github/workflows/deploy-frontend.yml`) — fires on app-code changes:
  `npm run build` (with `VITE_API_BASE_URL=/api`) → `rsync dist/` → `/opt/hexmap/www`.
  Caddy serves it immediately, no restart.
- **Server** (`.github/workflows/deploy-server.yml`) — fires on `server/**` or `deploy/**`:
  builds the Docker image on GitHub's runners → pushes to GHCR → SSHes to the droplet,
  which runs `deploy.sh` (pull the new image + `docker compose up -d`). It also tries a
  best-effort `git pull` first to refresh compose/Caddyfile; if the droplet repo can't
  auth a pull, that's skipped and you `git pull` manually when you change those files.

Manual server deploy / rollback to a specific image still works:
`git -C /opt/hexmap/repo pull && bash /opt/hexmap/repo/deploy/deploy.sh` (or set
`API_IMAGE=…:<sha>` in `.env` to pin an older build, then run it).

> Migrations are **not** auto-applied — the genesis backfills and the cutover RLS lock
> are run deliberately via `apply_sql`, never by the deploy pipeline.

## Cutover sequencing (this deploy is Phase 8)

Strategy: **same Supabase project** for both stacks (no DB copy — the new server has
been validated against live prod data all along, and the schema changes are additive
and already applied). The old Vercel site and the new droplet run **in parallel against
one DB** until you're confident; the only thing that severs the old site is the RLS
write-lock, applied last and instantly reversible.

1. **Droplet up on a `staging.` subdomain**; build the frontend against it. Both the old
   Vercel site and the new site now talk to the same Supabase — no divergence, users stay
   logged in, Storage/images work.
2. **Phase 7 pass** on staging: every domain, two tabs, realtime sync. Do destructive
   testing in a **throwaway session** so you don't muddy real campaigns (same DB!).
3. **Snapshot right before the lock** (your safety net):
   ```bash
   supabase db dump -f pre_cutover_$(date +%Y%m%d).sql      # CLI, project already linked
   ```
   (Or trigger/download a backup in the dashboard; PITR if you're on Pro — note the timestamp.)
4. **Flip + lock:** point the apex domain at the droplet, then apply the write-lock:
   ```bash
   cd server && cargo run --example apply_sql -- ../supabase/migrations/20260620000040_lock_write_rls.sql
   ```
   This blocks direct client writes (so the old Vercel site goes read-only) while the
   Rust server (bypassrls) keeps writing. `member_write` on rooms/corridors is preserved —
   the lock is additive and doesn't touch existing policies.
5. **Watch.** If anything's wrong, instant rollback:
   ```bash
   cd server && cargo run --example apply_sql -- ../deploy/cutover-rollback-unlock-rls.sql
   ```
   (worst case, restore the snapshot from step 3).
6. **Drop Vercel last**, once you've lived on the new stack for a bit.

Note: `bug_reports` stays direct-write (not locked), so bug reporting keeps working from
the client against the same DB throughout.

## Notes / gotchas

- `DATABASE_URL` = Supabase **Session pooler** (`...pooler.supabase.com:5432`). **Not** the
  Direct endpoint (`db.<ref>.supabase.co` is IPv6-only → the Docker container can't reach it,
  crash-loops with "Network is unreachable"), and **not** the transaction pooler (`:6543`,
  which breaks multi-statement transactions + prepared statements).
- Auth uses **JWKS from `SUPABASE_URL`** (ES256) — there is no `SUPABASE_JWT_SECRET`.
- Realtime/Auth/Storage go from the browser **directly to `*.supabase.co`** (not through
  your domain), so they're unaffected by Cloudflare and must stay in the CSP `connect-src`.
- Enable the `alloy` service in `docker-compose.yml` only once Grafana Cloud + the §11
  app instrumentation (`/metrics`, OTLP) are in place.
