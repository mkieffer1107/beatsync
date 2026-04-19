#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CLIENT_PORT="${CLIENT_PORT:-3000}"
SERVER_PORT="${SERVER_PORT:-8080}"
MODE="local"
APP_MODE="dev"
STORAGE_ROOT="${BEATSYNC_STORAGE_ROOT:-$HOME/.vibe/storage}"

usage() {
  cat <<'EOF'
Usage:
  ./scripts/run-local-mac.sh [--lan] [--dev|--prod] [--storage-dir /path/to/storage]

Modes:
  default   Run locally on this Mac only
  --lan     Bind the client for LAN access and publish URLs using this Mac's LAN IP
  --dev     Use Next/Bun dev servers
  --prod    Build and run production servers

Environment overrides:
  CLIENT_PORT=3000
  SERVER_PORT=8080
  BEATSYNC_STORAGE_ROOT=$HOME/.vibe/storage
EOF
}

find_lan_ip() {
  local primary_if
  primary_if="$(route get default 2>/dev/null | awk '/interface:/{print $2; exit}')"

  if [[ -n "${primary_if}" ]]; then
    ipconfig getifaddr "${primary_if}" 2>/dev/null && return 0
  fi

  ipconfig getifaddr en0 2>/dev/null && return 0
  ipconfig getifaddr en1 2>/dev/null && return 0
  return 1
}

check_command() {
  local name="$1"
  if ! command -v "$name" >/dev/null 2>&1; then
    echo "Missing required command: $name" >&2
    exit 1
  fi
}

warn_if_missing() {
  local name="$1"
  if ! command -v "$name" >/dev/null 2>&1; then
    echo "Warning: $name is not on PATH. Uploads may work, but YouTube imports will fail until it is installed." >&2
  fi
}

resolve_ytdlp_binary() {
  if [[ -n "${YTDLP_BINARY:-}" ]]; then
    printf '%s\n' "$YTDLP_BINARY"
    return 0
  fi

  local candidate
  for candidate in \
    "$HOME/.vibe/yt-dlp-master-env/bin/yt-dlp" \
    "$HOME/.vibe/yt-dlp-env/bin/yt-dlp" \
    "$HOME/.local/bin/yt-dlp" \
    "/opt/homebrew/bin/yt-dlp" \
    "/usr/local/bin/yt-dlp"
  do
    if [[ -x "$candidate" ]]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done

  if command -v yt-dlp >/dev/null 2>&1; then
    command -v yt-dlp
    return 0
  fi

  return 1
}

free_port() {
  local port="$1"
  local pids
  local pid

  pids="$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"
  if [[ -z "$pids" ]]; then
    return 0
  fi

  echo "Port $port is already in use. Stopping existing listener(s)..."
  lsof -nP -iTCP:"$port" -sTCP:LISTEN || true

  for pid in $pids; do
    kill "$pid" >/dev/null 2>&1 || true
  done

  for _ in {1..20}; do
    if ! lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.25
  done

  pids="$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"
  if [[ -n "$pids" ]]; then
    echo "Port $port did not close after SIGTERM. Forcing shutdown..."
    for pid in $pids; do
      kill -9 "$pid" >/dev/null 2>&1 || true
    done
  fi
}

wait_for_http() {
  local url="$1"
  local label="$2"
  local attempt

  for attempt in {1..60}; do
    if curl -fsS "$url" >/dev/null 2>&1; then
      echo "$label is ready at $url"
      return 0
    fi
    sleep 0.5
  done

  echo "Timed out waiting for $label at $url" >&2
  return 1
}

cleanup() {
  local exit_code=$?

  if [[ -n "${CLIENT_PID:-}" ]] && kill -0 "${CLIENT_PID}" >/dev/null 2>&1; then
    kill "${CLIENT_PID}" >/dev/null 2>&1 || true
  fi

  if [[ -n "${SERVER_PID:-}" ]] && kill -0 "${SERVER_PID}" >/dev/null 2>&1; then
    kill "${SERVER_PID}" >/dev/null 2>&1 || true
  fi

  wait "${CLIENT_PID:-}" >/dev/null 2>&1 || true
  wait "${SERVER_PID:-}" >/dev/null 2>&1 || true

  exit "$exit_code"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --lan)
      MODE="lan"
      APP_MODE="prod"
      shift
      ;;
    --dev)
      APP_MODE="dev"
      shift
      ;;
    --prod)
      APP_MODE="prod"
      shift
      ;;
    --storage-dir)
      STORAGE_ROOT="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

check_command bun
check_command curl
warn_if_missing ffmpeg
warn_if_missing ffprobe
warn_if_missing yt-dlp

if [[ "$MODE" == "lan" ]]; then
  PUBLIC_HOST="$(find_lan_ip)" || {
    echo "Could not determine a LAN IP for this Mac. Try running without --lan or set up networking first." >&2
    exit 1
  }
  CLIENT_BIND_HOST="0.0.0.0"
else
  PUBLIC_HOST="localhost"
  CLIENT_BIND_HOST="127.0.0.1"
fi

mkdir -p "$STORAGE_ROOT"
free_port "$CLIENT_PORT"
free_port "$SERVER_PORT"

cd "$ROOT_DIR"

if [[ ! -d node_modules ]]; then
  echo "Installing dependencies with bun install..."
  bun install
fi

export LOCAL_STORAGE_ROOT="$STORAGE_ROOT"
export PUBLIC_BASE_URL="http://${PUBLIC_HOST}:${SERVER_PORT}"
export NEXT_PUBLIC_API_URL="http://${PUBLIC_HOST}:${SERVER_PORT}"
export NEXT_PUBLIC_WS_URL="ws://${PUBLIC_HOST}:${SERVER_PORT}/ws"

if resolved_ytdlp_binary="$(resolve_ytdlp_binary)"; then
  export YTDLP_BINARY="$resolved_ytdlp_binary"
fi

if [[ -z "${YTDLP_COOKIES_FROM_BROWSER:-}" && -z "${YTDLP_COOKIES_FILE:-}" && -d "/Applications/Google Chrome.app" ]]; then
  export YTDLP_COOKIES_FROM_BROWSER="chrome"
fi

trap cleanup INT TERM EXIT

echo "Starting Beatsync on macOS..."
echo "Mode: $MODE"
echo "App mode: $APP_MODE"
echo "Storage: $LOCAL_STORAGE_ROOT"
echo "Server URL: $PUBLIC_BASE_URL"
echo "Client URL: http://${PUBLIC_HOST}:${CLIENT_PORT}"
if [[ -n "${YTDLP_COOKIES_FROM_BROWSER:-}" ]]; then
  echo "YouTube cookies: browser=${YTDLP_COOKIES_FROM_BROWSER}"
elif [[ -n "${YTDLP_COOKIES_FILE:-}" ]]; then
  echo "YouTube cookies: file=${YTDLP_COOKIES_FILE}"
else
echo "YouTube cookies: disabled"
fi
if [[ -n "${YTDLP_BINARY:-}" ]]; then
  echo "yt-dlp binary: ${YTDLP_BINARY}"
fi
echo

if [[ "$APP_MODE" == "prod" ]]; then
  echo "Building production bundles..."
  bun run build
fi

if [[ "$APP_MODE" == "prod" ]]; then
  (
    cd "$ROOT_DIR/apps/server"
    exec bun run start
  ) &
else
  (
    cd "$ROOT_DIR/apps/server"
    exec bun run dev
  ) &
fi
SERVER_PID=$!

wait_for_http "$PUBLIC_BASE_URL" "Server"

if [[ "$APP_MODE" == "prod" ]]; then
  (
    cd "$ROOT_DIR/apps/client"
    exec env HOSTNAME="$CLIENT_BIND_HOST" PORT="$CLIENT_PORT" bun run start
  ) &
else
  (
    cd "$ROOT_DIR/apps/client"
    exec bun run dev -- --hostname "$CLIENT_BIND_HOST" --port "$CLIENT_PORT"
  ) &
fi
CLIENT_PID=$!

wait_for_http "http://${PUBLIC_HOST}:${CLIENT_PORT}" "Client"

echo
echo "Beatsync is running."
echo "Client URL (this Mac): http://${PUBLIC_HOST}:${CLIENT_PORT}"
if [[ "$MODE" == "lan" ]]; then
  echo
  echo "Share this URL with other devices on your network:"
  echo "  http://${PUBLIC_HOST}:${CLIENT_PORT}"
fi
echo "Press Ctrl-C to stop both server and client."

while true; do
  if ! kill -0 "$SERVER_PID" >/dev/null 2>&1; then
    wait "$SERVER_PID"
    break
  fi

  if ! kill -0 "$CLIENT_PID" >/dev/null 2>&1; then
    wait "$CLIENT_PID"
    break
  fi

  sleep 1
done
