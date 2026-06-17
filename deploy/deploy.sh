#!/usr/bin/env bash
# Server deploy: pull the latest API image (built by CI, published to GHCR) and
# restart the stack. The frontend ships separately (CI rsyncs dist/ -> /opt/hexmap/www).
# CI runs `git -C /opt/hexmap/repo pull` before calling this, so compose/Caddyfile are
# current; for a manual run, pull first too:
#   git -C /opt/hexmap/repo pull && bash /opt/hexmap/repo/deploy/deploy.sh
set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/hexmap/repo}"
ENV_FILE="${ENV_FILE:-/opt/hexmap/.env}"

[ -f "$ENV_FILE" ] || { echo "missing $ENV_FILE (copy deploy/.env.example and fill it in)"; exit 1; }

cd "$REPO_DIR/deploy"

echo "==> pulling latest api image"
docker compose --env-file "$ENV_FILE" pull api

echo "==> recreating changed services"
docker compose --env-file "$ENV_FILE" up -d

# pick up Caddyfile edits without a full restart (no-op if unchanged).
# Path must match the container's run command (--config /etc/caddy/conf/Caddyfile);
# /etc/caddy/Caddyfile is the image's stock :80-only default and would clobber TLS.
docker compose --env-file "$ENV_FILE" exec -T caddy caddy reload --config /etc/caddy/conf/Caddyfile --adapter caddyfile 2>/dev/null || true

echo "==> pruning dangling images"
docker image prune -f >/dev/null

echo "==> status"
docker compose --env-file "$ENV_FILE" ps
echo "done. tail logs with:  docker compose -f $REPO_DIR/deploy/docker-compose.yml logs -f api"
