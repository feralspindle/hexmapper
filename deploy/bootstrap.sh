#!/usr/bin/env bash
# One-time droplet setup for the hex_map stack (fresh Ubuntu 24.04).
# Installs Docker, lays out /opt/hexmap, scaffolds .env, and grants the deploy user
# docker access. Idempotent — safe to re-run.
#
# Run AFTER cloning the repo to /opt/hexmap/repo:
#   git clone <repo-url> /opt/hexmap/repo        # your own git auth (token / gh / public)
#   sudo bash /opt/hexmap/repo/deploy/bootstrap.sh
#
# Then: edit /opt/hexmap/.env, `docker login ghcr.io` (if the package is private),
# and push to main (or run the deploy workflows) to ship.
set -euo pipefail

BASE=/opt/hexmap
REPO_DIR="$BASE/repo"
# The user CI ssh's in as (and that the SPA is rsync'd to). Defaults to whoever
# invoked sudo, or root on a default DO droplet.
DEPLOY_USER="${DEPLOY_USER:-${SUDO_USER:-root}}"

[ "$(id -u)" -eq 0 ] || { echo "run as root:  sudo bash $0"; exit 1; }
[ -d "$REPO_DIR/.git" ] || { echo "!! clone the repo to $REPO_DIR first (see header)"; exit 1; }
echo "==> deploy user: $DEPLOY_USER"

# --- 1. Docker -------------------------------------------------------------
if command -v docker >/dev/null 2>&1; then
  echo "==> docker present: $(docker --version)"
else
  echo "==> installing Docker (get.docker.com)"
  curl -fsSL https://get.docker.com | sh
fi
systemctl enable --now docker
docker compose version >/dev/null 2>&1 || { echo "!! docker compose plugin missing"; exit 1; }

# --- 2. docker group for the deploy user -----------------------------------
if [ "$DEPLOY_USER" != "root" ] && ! id -nG "$DEPLOY_USER" | grep -qw docker; then
  usermod -aG docker "$DEPLOY_USER"
  echo "==> added $DEPLOY_USER to the docker group (log out/in for it to take effect)"
fi

# --- 3. directory layout ---------------------------------------------------
mkdir -p "$BASE/www" "$BASE/certs"
chown -R "$DEPLOY_USER":"$DEPLOY_USER" "$BASE/www"   # CI rsyncs the SPA here
# CI (deploy-server.yml) SSHes in as $DEPLOY_USER and runs `git fetch/checkout/pull`
# in the repo. If it was cloned by root, git aborts with "dubious ownership" and the
# deploy user can't write .git anyway — so hand the clone to the deploy user.
chown -R "$DEPLOY_USER":"$DEPLOY_USER" "$REPO_DIR"

# --- 4. .env scaffold ------------------------------------------------------
if [ -f "$BASE/.env" ]; then
  echo "==> $BASE/.env exists (leaving as-is)"
else
  cp "$REPO_DIR/deploy/.env.example" "$BASE/.env"
  chown "$DEPLOY_USER":"$DEPLOY_USER" "$BASE/.env"
  chmod 600 "$BASE/.env"
  echo "==> created $BASE/.env from example — EDIT IT before deploying"
fi

# --- 5. cert sanity --------------------------------------------------------
if [ -f "$BASE/certs/origin.pem" ] && [ -f "$BASE/certs/origin.key" ]; then
  chmod 600 "$BASE/certs/origin.key" || true
  echo "==> Cloudflare origin cert present ✓"
else
  echo "!! missing $BASE/certs/origin.{pem,key} — add the Cloudflare Origin cert before deploying"
fi

cat <<EOF

setup complete. next:
  1) edit $BASE/.env
       DOMAIN, API_IMAGE (ghcr.io/<owner>/hexmap-server:latest),
       DATABASE_URL (Supabase direct or session-mode connection),
       SUPABASE_URL, CORS_ALLOWED_ORIGIN (=https://<domain>), PORT=8080
  2) docker login ghcr.io        # only if the GHCR package is private
  3) push to main (or run the Deploy workflows) — first push builds the image + deploys

note: the droplet's repo clone is only used for compose/Caddyfile. If you change those,
      run:  git -C $REPO_DIR pull && bash $REPO_DIR/deploy/deploy.sh
EOF
