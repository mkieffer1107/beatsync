#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVER_ENV_FILE="$ROOT_DIR/apps/server/.env.production"
CLIENT_ENV_FILE="$ROOT_DIR/apps/client/.env.production"

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

load_env_file() {
  local file="$1"

  if [ ! -f "$file" ]; then
    echo "Missing required env file: $file" >&2
    exit 1
  fi

  echo "[env] loading $file"
  set -a
  # shellcheck disable=SC1090
  . "$file"
  set +a
}

require_cmd bun
require_cmd caddy

cd "$ROOT_DIR"

export NODE_ENV=production
load_env_file "$SERVER_ENV_FILE"
load_env_file "$CLIENT_ENV_FILE"

echo "[setup] installing workspace dependencies"
bun install

echo "[build] building client and server"
bun run build

echo "[caddy] validating config"
caddy validate --config "$ROOT_DIR/Caddyfile"

echo "[run] starting production LAN stack"
exec "$ROOT_DIR/scripts/run-lan-stack.sh" start
