# Supabase production cutover runbook

This runbook fixes the historical project swap:

- `LIVE_SOURCE`: the current Supabase project named/treated as staging, but holding live production data.
- `PROD_TARGET`: the current Supabase project named/treated as production, but holding dev data.
- `NEW_STAGING`: a newly created Supabase project for future staging/dev data.

Do not reset or reseed `LIVE_SOURCE` until production has run successfully from `PROD_TARGET` for at least 14 days.

## 1. Prepare

1. Create `NEW_STAGING` in Supabase.
2. Create a second droplet for staging with the same bootstrap process as production.
3. Add a proxied Cloudflare DNS record such as `staging.<domain>` to the staging droplet.
4. Configure Supabase Auth redirect allowlists:
   - Production Supabase: production domain only.
   - New staging Supabase: staging domain and local dev URLs.
5. In GitHub, create Environments named `production` and `staging`.
6. Add the same secret names to both environments, with environment-specific values:
   - `DEPLOY_HOST`
   - `DEPLOY_USER`
   - `DEPLOY_SSH_KEY`
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY`
   - `VITE_REALTIME_TRANSPORT`
   - `VITE_FARO_URL`
   - `E2E_BASE_URL` for staging only
   - `E2E_GM_EMAIL` for staging only
   - `E2E_GM_PASSWORD` for staging only
   - `E2E_PLAYER1_EMAIL` for staging only
   - `E2E_PLAYER1_PASSWORD` for staging only
   - `E2E_PLAYER2_EMAIL` for staging only
   - `E2E_PLAYER2_PASSWORD` for staging only

## 2. Back up both existing projects

Take fresh backups immediately before the cutover window.

```bash
mkdir -p backups

supabase link --project-ref <live-source-ref>
supabase db dump --linked -f backups/live-source-pre-cutover.sql

supabase link --project-ref <prod-target-ref>
supabase db dump --linked -f backups/prod-target-dev-data-pre-overwrite.sql
```

Also export or snapshot Storage bucket objects from `LIVE_SOURCE`:

```bash
supabase storage ls --experimental --linked
supabase storage cp --experimental --linked --recursive ss:///session-maps ./backups/storage/session-maps
supabase storage cp --experimental --linked --recursive ss:///dungeon-images ./backups/storage/dungeon-images
supabase storage cp --experimental --linked --recursive ss:///reference-photos ./backups/storage/reference-photos
supabase storage cp --experimental --linked --recursive ss:///bug-screenshots ./backups/storage/bug-screenshots
```

## 3. Rehearse restore

Before touching `PROD_TARGET`, restore the live backup into a disposable Supabase project and validate:

```sql
select count(*) from auth.users;
select count(*) from public.sessions;
select count(*) from public.session_members;
select count(*) from public.maps;
select count(*) from public.hex_cells;
select count(*) from public.events;
select bucket_id, count(*) from storage.objects group by bucket_id order by bucket_id;
```

Then point a temporary app environment at the rehearsal project and verify login, campaign load, realtime, and image loading.

## 4. Cut over production

1. Put the current production site into maintenance mode at Cloudflare or stop the API/container.
2. Take one final backup of `LIVE_SOURCE`.
3. Reset/overwrite `PROD_TARGET`.
4. Restore the live database into `PROD_TARGET`, preserving `auth`, `public`, and `storage` metadata.
5. Copy Storage objects from `LIVE_SOURCE` into `PROD_TARGET`.
6. Validate row counts and spot-check representative campaigns before changing app secrets.
7. Update the production droplet `/opt/hexmap/.env`:
   - `DATABASE_URL` points to the `PROD_TARGET` session pooler.
   - `SUPABASE_URL` points to `PROD_TARGET`.
   - `DOMAIN` remains the production domain.
   - `API_IMAGE` can stay on any valid GHCR image; CI deploys by SHA via `API_IMAGE_OVERRIDE`.
8. Push or manually dispatch the `main` deploy workflows.
9. Reopen production traffic.

Rollback default: point production secrets/DNS back to `LIVE_SOURCE` and redeploy. Keep `LIVE_SOURCE` untouched until rollback is no longer needed.

## 5. Bring up staging

1. Apply migrations to `NEW_STAGING`.
2. Seed synthetic users:

```bash
supabase link --project-ref <new-staging-ref>
supabase db push --linked
psql "<new-staging-session-or-direct-url>" -f supabase/seed.sql
```

3. Set staging GitHub Environment secrets to match the seeded users, or replace the seeded passwords and store the replacements:
   - `E2E_GM_EMAIL=e2e-gm@example.test`
   - `E2E_PLAYER1_EMAIL=e2e-player1@example.test`
   - `E2E_PLAYER2_EMAIL=e2e-player2@example.test`
4. Configure `/opt/hexmap/.env` on the staging droplet with `NEW_STAGING` database/auth values and `DOMAIN=staging.<domain>`.
5. Push to the `staging` branch or manually dispatch the deploy workflows from that branch.
6. Confirm the staging E2E workflow passes.
