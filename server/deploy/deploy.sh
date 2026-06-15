#!/usr/bin/env bash
# Run on the droplet from /opt/hexmap/hex_map/server/deploy
set -euo pipefail

cd "$(dirname "$0")/.."
git pull
cd deploy
docker compose build
docker compose up -d
