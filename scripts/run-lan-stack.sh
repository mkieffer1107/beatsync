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

wait_for_any_exit() {
  local pid
  local status

  while true; do
    for pid in "${PIDS[@]:-}"; do
      if ! kill -0 "$pid" >/dev/null 2>&1; then
        status=0
        wait "$pid" || status=$?
        return "$status"
      fi
    done

    sleep 1
  done
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

start_bun_process() {
  local name="$1"
  local workdir="$2"
  shift 2

  (
    cd "$ROOT_DIR/$workdir"
    echo "[$name] starting in $workdir"
    exec "$@"
  ) &

  PIDS+=("$!")
}

ensure_caddy() {
  if caddy reload --config "$ROOT_DIR/Caddyfile" >/dev/null 2>&1; then
    echo "[caddy] reloaded existing process"
    return
  fi

  start_process caddy caddy run --config "$ROOT_DIR/Caddyfile"
}

require_cmd bun
require_cmd caddy

case "$MODE" in
  dev)
    start_bun_process server apps/server env SERVER_HOST="${SERVER_HOST:-127.0.0.1}" SERVER_PORT="${SERVER_PORT:-8080}" bun run dev
    start_bun_process client apps/client env HOSTNAME="${HOSTNAME:-127.0.0.1}" PORT="${PORT:-3000}" bun run dev
    ;;
  start)
    start_bun_process server apps/server env SERVER_HOST="${SERVER_HOST:-127.0.0.1}" SERVER_PORT="${SERVER_PORT:-8080}" bun run start
    start_bun_process client apps/client env HOSTNAME="${HOSTNAME:-127.0.0.1}" PORT="${PORT:-3000}" bun run start
    ;;
  *)
    echo "Usage: $0 [dev|start]" >&2
    exit 1
    ;;
esac

ensure_caddy

trap cleanup EXIT INT TERM
wait_for_any_exit
