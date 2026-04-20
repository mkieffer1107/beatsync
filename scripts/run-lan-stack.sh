#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

MODE="${1:-dev}"
PIDS=()

looks_like_bind_host() {
  case "${1:-}" in
    0.0.0.0 | 127.0.0.1 | localhost | :: | ::1)
      return 0
      ;;
    [0-9]*.[0-9]*.[0-9]*.[0-9]*)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

resolve_client_bind_host() {
  if [ -n "${CLIENT_HOSTNAME:-}" ]; then
    printf "%s" "$CLIENT_HOSTNAME"
    return
  fi

  if [ -n "${CLIENT_BIND_HOST:-}" ]; then
    printf "%s" "$CLIENT_BIND_HOST"
    return
  fi

  if [ -n "${BEATSYNC_CLIENT_HOST:-}" ]; then
    printf "%s" "$BEATSYNC_CLIENT_HOST"
    return
  fi

  # Some shells export HOSTNAME automatically (for example, "raspberrypi"),
  # which breaks the intended loopback default for the LAN proxy stack.
  if looks_like_bind_host "${HOSTNAME:-}"; then
    printf "%s" "$HOSTNAME"
    return
  fi

  printf "127.0.0.1"
}

resolve_client_bind_port() {
  if [ -n "${CLIENT_PORT:-}" ]; then
    printf "%s" "$CLIENT_PORT"
    return
  fi

  printf "%s" "${PORT:-3000}"
}

resolve_proxy_upstream() {
  local host="$1"
  local port="$2"

  case "$host" in
    "" | 0.0.0.0 | 127.0.0.1 | localhost | :: | ::1)
      printf "127.0.0.1:%s" "$port"
      ;;
    *)
      printf "%s:%s" "$host" "$port"
      ;;
  esac
}

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

SERVER_BIND_HOST="${SERVER_HOST:-127.0.0.1}"
SERVER_BIND_PORT="${SERVER_PORT:-8080}"
CLIENT_BIND_HOST="$(resolve_client_bind_host)"
CLIENT_BIND_PORT="$(resolve_client_bind_port)"

export BEATSYNC_SERVER_UPSTREAM="${BEATSYNC_SERVER_UPSTREAM:-$(resolve_proxy_upstream "$SERVER_BIND_HOST" "$SERVER_BIND_PORT")}"
export BEATSYNC_CLIENT_UPSTREAM="${BEATSYNC_CLIENT_UPSTREAM:-$(resolve_proxy_upstream "$CLIENT_BIND_HOST" "$CLIENT_BIND_PORT")}"

case "$MODE" in
  dev)
    start_bun_process server apps/server env SERVER_HOST="$SERVER_BIND_HOST" SERVER_PORT="$SERVER_BIND_PORT" bun run dev
    start_bun_process client apps/client env HOSTNAME="$CLIENT_BIND_HOST" PORT="$CLIENT_BIND_PORT" bun run dev
    ;;
  start)
    start_bun_process server apps/server env SERVER_HOST="$SERVER_BIND_HOST" SERVER_PORT="$SERVER_BIND_PORT" bun run start
    start_bun_process client apps/client env HOSTNAME="$CLIENT_BIND_HOST" PORT="$CLIENT_BIND_PORT" bun run start
    ;;
  *)
    echo "Usage: $0 [dev|start]" >&2
    exit 1
    ;;
esac

ensure_caddy

trap cleanup EXIT INT TERM
wait_for_any_exit
