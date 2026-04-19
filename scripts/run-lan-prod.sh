#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

require_cmd bun
require_cmd caddy

cd "$ROOT_DIR"

echo "[setup] installing workspace dependencies"
bun install

echo "[build] building client and server"
bun run build

echo "[caddy] validating config"
caddy validate --config "$ROOT_DIR/Caddyfile"

echo "[run] starting production LAN stack"
exec "$ROOT_DIR/scripts/run-lan-stack.sh" start
