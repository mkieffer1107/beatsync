#!/usr/bin/env bash

set -euo pipefail

DOMAIN="${1:-vibe.mathnasium.pro}"
ROUTER_IP="$(ip route 2>/dev/null | awk '/default/ { print $3; exit }')"

section() {
  printf '\n== %s ==\n' "$1"
}

maybe_run() {
  local label="$1"
  shift

  echo "-- $label"
  if "$@"; then
    return 0
  fi

  echo "(command failed)"
}

section "Domain"
echo "Domain: $DOMAIN"
echo "Router IP: ${ROUTER_IP:-unknown}"

section "Processes"
maybe_run "Caddy processes" sh -c "ps aux | grep '[c]addy'"
maybe_run "Next.js / Bun listeners" sh -c "ss -ltnp | grep -E ':80|:3000|:8080|:2019'"

section "Local Proxy Check"
maybe_run "Frontend through Caddy via Host header" curl -I -H "Host: $DOMAIN" http://127.0.0.1/
maybe_run "Frontend HTML preview through Caddy" sh -c "curl -s -H 'Host: $DOMAIN' http://127.0.0.1/ | head -n 5"

section "DNS"
maybe_run "System resolver" getent hosts "$DOMAIN"

if command -v nslookup >/dev/null 2>&1; then
  maybe_run "nslookup via system DNS" nslookup "$DOMAIN"

  if [ -n "${ROUTER_IP:-}" ]; then
    maybe_run "nslookup via router DNS" nslookup "$DOMAIN" "$ROUTER_IP"
  fi
else
  echo "-- nslookup not installed"
fi
