# Deployment — production and staging droplets + Cloudflare

The Vue SPA and the Rust API run on DigitalOcean droplets behind **Cloudflare**.
Production and staging use the same host layout, but each environment has its own
droplet, Supabase project, GitHub Environment secrets, and domain.

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

## One-time setup per environment

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
   - Point the domain's nameservers at Cloudflare; add an **A record** for the production
     domain and another for `staging.<domain>` → the correct droplet IP, **proxied
     (orange cloud)**.
   - SSL/TLS mode → **Full (strict)**.
   - SSL/TLS → Origin Server → **Create Certificate** → save the cert to
     `/opt/hexmap/certs/origin.pem` and the key to `/opt/hexmap/certs/origin.key`.
   - Rules → **Cache Rule**: if URI path starts with `/api/` → **Bypass cache**
     (otherwise Cloudflare may cache `GET /api/...`).

4. **GHCR pull access** — the API image is published to GitHub Container Registry by CI.
   Set `API_IMAGE` in `/opt/hexmap/.env` (e.g. `ghcr.io/<owner>/hexmap-server:main`
   for production or `ghcr.io/<owner>/hexmap-server:staging` for staging, owner
   lowercase). CI deploys immutable commit-SHA tags via `API_IMAGE_OVERRIDE`, but the
   `.env` value is still the manual fallback. The droplet must be able to pull it:
   - If the repo/package is **private**, log in once on the droplet:
     ```bash
     echo <GHCR_PAT_with_read:packages> | docker login ghcr.io -u <github-user> --password-stdin
     ```
   - Or make the package **public** (Packages → settings → change visibility) — the image
     holds no secrets (env comes from `.env` at runtime).

5. **GitHub Environments + secrets** — create Environments named `production` and
   `staging`, then add the same secret names to each with environment-specific values:
   | secret | value |
   |---|---|
   | `DEPLOY_HOST` | droplet IP / hostname |
   | `DEPLOY_USER` | ssh user with write to `/opt/hexmap/www` + docker access |
   | `DEPLOY_SSH_KEY` | private key (matching an authorized key on the droplet) |
   | `VITE_SUPABASE_URL` | `https://<ref>.supabase.co` |
   | `VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY` | Supabase publishable/anon key |
   | `VITE_REALTIME_TRANSPORT` | `supabase` during rollout, then `rust` after migrations through `20260620000043` are applied |
   | `VITE_FARO_URL` | optional Grafana Faro collector URL |
   | `E2E_BASE_URL` | staging only, e.g. `https://staging.<domain>` |
   | `E2E_GM_EMAIL` / `E2E_GM_PASSWORD` | staging only |
   | `E2E_PLAYER1_EMAIL` / `E2E_PLAYER1_PASSWORD` | staging only |
   | `E2E_PLAYER2_EMAIL` / `E2E_PLAYER2_PASSWORD` | staging only |

   (Pushing the image uses the built-in `GITHUB_TOKEN` — no secret needed.)

## Deploys

Branch-to-environment mapping:

- `main` deploys to the `production` GitHub Environment and production droplet.
- `staging` deploys to the `staging` GitHub Environment and staging droplet.

Path-filtered, so each push only rebuilds what changed:

- **Frontend** (`.github/workflows/deploy-frontend.yml`) — fires on app-code changes:
  `npm run build` (with `VITE_API_BASE_URL=/api`) → `rsync dist/` → `/opt/hexmap/www`.
  Caddy serves it immediately, no restart.
- **Server** (`.github/workflows/deploy-server.yml`) — fires on `server/**` or `deploy/**`:
  builds the Docker image on GitHub's runners → pushes to GHCR → SSHes to the droplet,
  checks out the matching branch, then runs `deploy.sh` with `API_IMAGE_OVERRIDE` pinned
  to the commit SHA. The droplet pulls that exact image and restarts the stack.
- **E2E** — after a staging frontend or server deploy, Playwright runs against the staging
  URL when the staging E2E secrets are configured. It also runs on a nightly schedule.

Manual server deploy / rollback to a specific image still works:
`git -C /opt/hexmap/repo pull && API_IMAGE_OVERRIDE=ghcr.io/<owner>/hexmap-server:<sha> bash /opt/hexmap/repo/deploy/deploy.sh`
(or set `API_IMAGE=...:<sha>` in `.env` to pin an older build, then run it).

> Migrations are **not** auto-applied — the genesis backfills and the cutover RLS lock
> are run deliberately via `apply_sql`, never by the deploy pipeline.

## Supabase project cutover

The current Supabase projects were historically swapped: the staging-labeled project
holds live production data, and the production-labeled project holds dev data. Follow
[supabase-cutover.md](./supabase-cutover.md) for the backup, restore, validation,
rollback, and new staging setup steps. Do not reset the current live source project
until production has run successfully from the real production project for at least
14 days.

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
