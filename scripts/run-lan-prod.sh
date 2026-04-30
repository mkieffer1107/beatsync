#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVER_ENV_FILE="$ROOT_DIR/apps/server/.env.production"
CLIENT_ENV_FILE="$ROOT_DIR/apps/client/.env.production"
DEFAULT_SINGLE_ROOM_ID="123456"
SINGLE_ROOM_FLAG_REQUESTED=0
SINGLE_ROOM_FLAG_ID=""
ADMIN_ALL_FLAG_REQUESTED=0
OPEN_SITE_FLAG_REQUESTED=0

usage() {
  cat <<EOF
Usage: $0 [--single-room] [--single-room-id ROOM_ID] [--admin-all] [--open-site]

Options:
  --single-room              Redirect the LAN root URL to /room/$DEFAULT_SINGLE_ROOM_ID.
  --single-room=ROOM_ID      Redirect the LAN root URL to the given 6-digit room.
  --single-room-id ROOM_ID   Same as --single-room=ROOM_ID.
  --admin-all                Make every joining client an admin.
  --open-site                Open Chromium to the single room and auto-start the room UI.
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
      --admin-all)
        ADMIN_ALL_FLAG_REQUESTED=1
        shift
        ;;
      --open-site)
        OPEN_SITE_FLAG_REQUESTED=1
        shift
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

resolve_chromium_bin() {
  if [ -n "${CHROMIUM_BIN:-}" ]; then
    if [ -x "$CHROMIUM_BIN" ]; then
      printf "%s" "$CHROMIUM_BIN"
      return
    fi

    if command -v "$CHROMIUM_BIN" >/dev/null 2>&1; then
      command -v "$CHROMIUM_BIN"
      return
    fi

    return 1
  fi

  local candidate
  for candidate in /usr/lib/chromium/chromium chromium-browser chromium google-chrome-stable google-chrome; do
    if [ -x "$candidate" ]; then
      printf "%s" "$candidate"
      return
    fi

    if command -v "$candidate" >/dev/null 2>&1; then
      command -v "$candidate"
      return
    fi
  done

  return 1
}

resolve_site_base_url() {
  if [ -n "${BEATSYNC_SITE_URL:-}" ]; then
    printf "%s" "${BEATSYNC_SITE_URL%/}"
    return
  fi

  printf "http://%s" "${BEATSYNC_DOMAIN:-vibe.mathnasium.pro}"
}

close_keyring_prompts() {
  pkill -u "$(id -u)" -f "gcr-prompter" >/dev/null 2>&1 || true
}

watch_for_keyring_prompts() {
  (
    local attempt=1
    while [ "$attempt" -le 20 ]; do
      close_keyring_prompts
      attempt=$((attempt + 1))
      sleep 0.5
    done
  ) &
}

open_site_when_ready() {
  local url="$1"
  local browser_bin="$2"
  local display="${DISPLAY:-:0}"
  local xdg_runtime_dir="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
  local browser_log="${TMPDIR:-/tmp}/beatsync-open-site-chromium.log"
  local chromium_user_data_dir="${CHROMIUM_USER_DATA_DIR:-${TMPDIR:-/tmp}/beatsync-chromium-profile-$(id -u)}"

  (
    echo "[open-site] waiting for $url"

    mkdir -p "$chromium_user_data_dir"

    local attempt=1
    while [ "$attempt" -le 90 ]; do
      if curl -fsSL -o /dev/null "$url"; then
        echo "[open-site] opening $url"
        close_keyring_prompts
        watch_for_keyring_prompts

        local browser_args=(
          --ozone-platform=x11
          --disable-gpu
          --disable-dev-shm-usage
          --no-first-run
          --disable-session-crashed-bubble
          --password-store=basic
          "--user-data-dir=$chromium_user_data_dir"
        )

        if [ -n "${CHROMIUM_FLAGS:-}" ]; then
          local extra_browser_args=()
          # shellcheck disable=SC2206
          extra_browser_args=($CHROMIUM_FLAGS)
          browser_args+=("${extra_browser_args[@]}")
        fi

        browser_args+=(--new-window "$url")

        DISPLAY="$display" XDG_RUNTIME_DIR="$xdg_runtime_dir" "$browser_bin" "${browser_args[@]}" >"$browser_log" 2>&1 || {
          echo "[open-site] failed to launch Chromium with $browser_bin" >&2
          sed -n "1,80p" "$browser_log" >&2
        }
        return
      fi

      attempt=$((attempt + 1))
      sleep 1
    done

    echo "[open-site] timed out waiting for $url" >&2
  ) &
}

parse_args "$@"

if [ "$SINGLE_ROOM_FLAG_ID" != "" ] && ! validate_room_id "$SINGLE_ROOM_FLAG_ID"; then
  echo "Invalid single-room ID: $SINGLE_ROOM_FLAG_ID. Expected a 6-digit numeric room code." >&2
  exit 1
fi

if [ "$OPEN_SITE_FLAG_REQUESTED" -eq 1 ] && [ "$SINGLE_ROOM_FLAG_REQUESTED" -ne 1 ]; then
  echo "--open-site requires --single-room or --single-room=ROOM_ID." >&2
  usage >&2
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

if [ "$ADMIN_ALL_FLAG_REQUESTED" -eq 1 ]; then
  export ADMIN_ALL=1
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

if is_truthy "${ADMIN_ALL:-}"; then
  export ADMIN_ALL=1
  echo "[mode] admin-all mode enabled: every joining client is an admin"
fi

OPEN_SITE_URL=""
OPEN_SITE_BROWSER_BIN=""

if [ "$OPEN_SITE_FLAG_REQUESTED" -eq 1 ]; then
  require_cmd curl
  OPEN_SITE_BROWSER_BIN="$(resolve_chromium_bin)" || {
    echo "Missing Chromium browser. Install chromium-browser/chromium or set CHROMIUM_BIN." >&2
    exit 1
  }

  OPEN_SITE_URL="$(resolve_site_base_url)/room/$NEXT_PUBLIC_SINGLE_ROOM_ID?autostart=1"
  echo "[mode] open-site enabled: Chromium will open $OPEN_SITE_URL"
fi

echo "[setup] installing workspace dependencies"
bun install

echo "[build] building client and server"
bun run build

echo "[caddy] validating config"
caddy validate --config "$ROOT_DIR/Caddyfile"

echo "[run] starting production LAN stack"
if [ "$OPEN_SITE_URL" != "" ]; then
  open_site_when_ready "$OPEN_SITE_URL" "$OPEN_SITE_BROWSER_BIN"
fi

exec "$ROOT_DIR/scripts/run-lan-stack.sh" start
