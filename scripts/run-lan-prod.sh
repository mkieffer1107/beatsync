#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVER_ENV_FILE="$ROOT_DIR/apps/server/.env.production"
CLIENT_ENV_FILE="$ROOT_DIR/apps/client/.env.production"
DEFAULT_SINGLE_ROOM_ID="123456"
SINGLE_ROOM_FLAG_REQUESTED=0
SINGLE_ROOM_FLAG_ID=""

usage() {
  cat <<EOF
Usage: $0 [--single-room] [--single-room-id ROOM_ID]

Options:
  --single-room              Redirect the LAN root URL to /room/$DEFAULT_SINGLE_ROOM_ID.
  --single-room=ROOM_ID      Redirect the LAN root URL to the given 6-digit room.
  --single-room-id ROOM_ID   Same as --single-room=ROOM_ID.
EOF
}

validate_room_id() {
  [[ "${1:-}" =~ ^[0-9]{6}$ ]]
}

is_truthy() {
  case "$(printf "%s" "${1:-}" | tr "[:upper:]" "[:lower:]")" in
    1 | true | yes | on)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

parse_args() {
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --single-room)
        SINGLE_ROOM_FLAG_REQUESTED=1
        shift
        ;;
      --single-room=*)
        SINGLE_ROOM_FLAG_REQUESTED=1
        SINGLE_ROOM_FLAG_ID="${1#*=}"
        shift
        ;;
      --single-room-id)
        if [ "${2:-}" = "" ]; then
          echo "Missing value for --single-room-id" >&2
          usage >&2
          exit 1
        fi
        SINGLE_ROOM_FLAG_REQUESTED=1
        SINGLE_ROOM_FLAG_ID="$2"
        shift 2
        ;;
      -h | --help)
        usage
        exit 0
        ;;
      *)
        echo "Unknown option: $1" >&2
        usage >&2
        exit 1
        ;;
    esac
  done
}

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

parse_args "$@"

if [ "$SINGLE_ROOM_FLAG_ID" != "" ] && ! validate_room_id "$SINGLE_ROOM_FLAG_ID"; then
  echo "Invalid single-room ID: $SINGLE_ROOM_FLAG_ID. Expected a 6-digit numeric room code." >&2
  exit 1
fi

require_cmd bun
require_cmd caddy

cd "$ROOT_DIR"

export NODE_ENV=production
load_env_file "$SERVER_ENV_FILE"
load_env_file "$CLIENT_ENV_FILE"

if [ "$SINGLE_ROOM_FLAG_REQUESTED" -eq 1 ]; then
  export NEXT_PUBLIC_SINGLE_ROOM_MODE=1
  export NEXT_PUBLIC_SINGLE_ROOM_ID="${SINGLE_ROOM_FLAG_ID:-$DEFAULT_SINGLE_ROOM_ID}"
fi

if is_truthy "${NEXT_PUBLIC_SINGLE_ROOM_MODE:-}"; then
  export NEXT_PUBLIC_SINGLE_ROOM_MODE=1
  export NEXT_PUBLIC_SINGLE_ROOM_ID="${NEXT_PUBLIC_SINGLE_ROOM_ID:-$DEFAULT_SINGLE_ROOM_ID}"

  if ! validate_room_id "$NEXT_PUBLIC_SINGLE_ROOM_ID"; then
    echo "Invalid single-room ID: $NEXT_PUBLIC_SINGLE_ROOM_ID. Expected a 6-digit numeric room code." >&2
    exit 1
  fi

  echo "[mode] single-room mode enabled: / redirects to /room/$NEXT_PUBLIC_SINGLE_ROOM_ID"
fi

echo "[setup] installing workspace dependencies"
bun install

echo "[build] building client and server"
bun run build

echo "[caddy] validating config"
caddy validate --config "$ROOT_DIR/Caddyfile"

echo "[run] starting production LAN stack"
exec "$ROOT_DIR/scripts/run-lan-stack.sh" start
