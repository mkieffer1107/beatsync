#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

MODE="${1:-dev}"
PIDS=()

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

cleanup() {
  local exit_code=$?

  trap - EXIT INT TERM

  for pid in "${PIDS[@]:-}"; do
    if kill -0 "$pid" >/dev/null 2>&1; then
      kill "$pid" >/dev/null 2>&1 || true
    fi
  done

  wait >/dev/null 2>&1 || true
  exit "$exit_code"
}

start_process() {
  local name="$1"
  shift

  (
    cd "$ROOT_DIR"
    echo "[$name] starting"
    exec "$@"
  ) &

  PIDS+=("$!")
}

require_cmd bun
require_cmd caddy

case "$MODE" in
  dev)
    start_process server env SERVER_HOST="${SERVER_HOST:-127.0.0.1}" SERVER_PORT="${SERVER_PORT:-8080}" bun --cwd apps/server run dev
    start_process client env HOSTNAME="${HOSTNAME:-127.0.0.1}" PORT="${PORT:-3000}" bun --cwd apps/client run dev
    ;;
  start)
    start_process server env SERVER_HOST="${SERVER_HOST:-127.0.0.1}" SERVER_PORT="${SERVER_PORT:-8080}" bun --cwd apps/server run start
    start_process client env HOSTNAME="${HOSTNAME:-127.0.0.1}" PORT="${PORT:-3000}" bun --cwd apps/client run start
    ;;
  *)
    echo "Usage: $0 [dev|start]" >&2
    exit 1
    ;;
esac

start_process caddy caddy run --config "$ROOT_DIR/Caddyfile"

trap cleanup EXIT INT TERM
wait -n
