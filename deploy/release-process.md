# Release Process

How code gets from a feature branch to squeak.guru. Complements
[README.md](README.md) (infra layout) and the deploy workflows in
`.github/workflows/`.

## The one-line version

A release is a **staging-branch SHA whose full staging pipeline — including
Playwright E2E — is green**, fast-forwarded to `main`. Prod deploys exactly the
commit staging tested; nothing lands on `main` any other way.

## Environments

| Env | Branch | Deploys via | Verified by |
|---|---|---|---|
| Dev | local | `vite` / `cargo run` | pre-push hook (`scripts/test-all.sh`) |
| Staging | `staging` | push → deploy workflows | test suites → migrate → smoke → **Playwright E2E** |
| Production | `main` | push → deploy workflows | test suites → migrate → smoke → manual check |

## Normal release flow

1. **Feature work** — branch off `staging`, open a PR into `staging`.
   `ci.yml` runs the frontend, backend, and pgTAP suites on the PR.
2. **Merge to `staging`** — the deploy workflows take it to
   https://staging.squeak.guru automatically, ending with the E2E suite
   against the live staging site.
3. **Bake** — let it sit on staging until you've clicked through anything the
   E2E suite doesn't cover (at minimum after storage/auth/schema changes:
   log in, load a map image, make one write).
4. **Promote** — fast-forward `main` to the tested SHA:

   ```sh
   git fetch origin
   gh run list --commit "$(git rev-parse origin/staging)" --json conclusion   # all green?
   git push origin origin/staging:main
   ```

   Fast-forward only. If the push is rejected as non-fast-forward, `main` has
   something `staging` doesn't — reconcile first, never force-push.
5. **Watch prod deploy** — migrate runs before the new image starts
   (schema leads code); the smoke job gates on `GET /` = 200 and
   `/api/healthz` = ok against https://squeak.guru.
6. **Tag it** — once smoke is green:

   ```sh
   git tag v$(date +%Y.%m.%d) <sha> && git push origin --tags
   gh release create v$(date +%Y.%m.%d) --generate-notes
   ```

   Add a `.2` suffix for a second release the same day. Tags are the rollback
   vocabulary — every prod deploy should be reachable by tag.

## Release rules

- **Game-night freeze.** No prod promotions in the 24h before a game session
  unless the release *is* the fix for game night. Staging deploys are always
  allowed. (Learned the hard way, 2026-07-03.)
- **One promotion at a time.** Don't push to `main` while a prod deploy run is
  in flight — the concurrency group cancels the older run, which can strand a
  deploy between migrate and restart.
- **Promote, don't cherry-pick.** `main` only ever moves to a SHA that is (or
  was) `staging`'s head with a green pipeline. If you need only part of what's
  on staging, fix staging, don't hand-assemble main.
- **E2E stays staging-only.** Prod has no synthetic accounts on purpose; prod
  verification is smoke + the manual check in step 3.

## Database rules

- **Forward-only.** Never edit a migration after it has been applied anywhere;
  to undo, write a new reverting migration.
- **Nothing hand-run on a live DB.** Every schema change is a file in
  `supabase/migrations/`. Hand-run SQL desyncs the migration history table and
  blocks the next `db push` (April 2026 drift, July 2026 history mismatch).
- **Expand-contract.** Schema must stay compatible with the *previous* app
  version: additive change ships first, the destructive half ships only after
  no deployed code references the old shape. This is what makes app-level
  rollback safe while the DB stays forward-only.

## Hotfixes

Same pipeline, compressed: commit the fix on `staging`, let the full staging
run (incl. E2E) go green, promote. The staging pipeline is the fastest safe
path — skipping it is only justified when staging itself is the thing that's
broken, in which case push to `main` directly and sync `staging` immediately
after.

## Rollback

The DB never rolls back (see expand-contract above); the app does.

- **Server, fastest path** — every image is in GHCR tagged by commit SHA:

  ```sh
  ssh deploy@<prod-droplet>
  cd /opt/hexmap/repo
  API_IMAGE_OVERRIDE=ghcr.io/feralspindle/hexmap-server:<old-sha> bash deploy/deploy.sh
  ```

- **Server or frontend, clean path** — re-run the deploy workflow at the last
  good tag (rebuilds the frontend with prod env vars; migrate is a no-op since
  the DB is already ahead):

  ```sh
  gh workflow run deploy-server.yml --ref v2026.07.04
  gh workflow run deploy-frontend.yml --ref v2026.07.04
  ```

- **Frontend caveat** — `deploy-frontend.yml` rsyncs with `--delete`, so the
  droplet keeps no previous build; the workflow-at-tag route is the only
  frontend rollback. PWA clients may also need a hard refresh to drop the
  cached service worker.

After any rollback, `main` still points at the bad SHA — follow up with a
forward fix through staging rather than moving `main` backwards.

## Not yet implemented (hardening backlog)

- **One-time history convergence.** `main` currently carries `Merge branch
  'staging'` merge commits, so step 4's fast-forward will be rejected until the
  branches converge once (merge `main` into `staging`, verify the trees match,
  release from there).
- **Image promotion.** Prod currently *rebuilds* the image from the promoted
  SHA. Once promotion is fast-forward, `build-push-deploy` can check GHCR for
  an existing `:sha` image and retag instead of rebuilding — then prod runs the
  literal artifact staging tested. (Frontend is exempt: it must rebuild per
  env to bake in `VITE_*`.)
- **Auto-tagging.** A post-smoke job on `main` could create the tag + release
  automatically, removing step 6.
- **Promotion enforcement.** Branch protection would enforce the green-checks
  rule server-side; until then the `gh run list` check in step 4 (or a
  `scripts/promote.sh` wrapping it) is the gate, in the same spirit as the
  pre-push hook.
