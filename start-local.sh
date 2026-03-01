#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_PORT="${APP_PORT:-5500}"
PROXY_PORT="${PROXY_PORT:-3000}"
APP_URL="http://127.0.0.1:${APP_PORT}/"

APP_PID=""
PROXY_PID=""

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

port_in_use() {
  local port="$1"
  if command -v ss >/dev/null 2>&1; then
    ss -ltn "( sport = :${port} )" 2>/dev/null | tail -n +2 | grep -q .
    return
  fi
  if command -v lsof >/dev/null 2>&1; then
    lsof -iTCP:"${port}" -sTCP:LISTEN >/dev/null 2>&1
    return
  fi
  return 1
}

cleanup() {
  local exit_code=$?
  if [[ -n "${APP_PID}" ]] && kill -0 "${APP_PID}" 2>/dev/null; then
    kill "${APP_PID}" 2>/dev/null || true
  fi
  if [[ -n "${PROXY_PID}" ]] && kill -0 "${PROXY_PID}" 2>/dev/null; then
    kill "${PROXY_PID}" 2>/dev/null || true
  fi
  wait 2>/dev/null || true
  exit "${exit_code}"
}

trap cleanup INT TERM EXIT

require_cmd node
require_cmd python3

if port_in_use "${APP_PORT}"; then
  echo "App port ${APP_PORT} is already in use." >&2
  exit 1
fi

if port_in_use "${PROXY_PORT}"; then
  echo "Proxy port ${PROXY_PORT} is already in use." >&2
  exit 1
fi

cd "${ROOT_DIR}"

python3 -m http.server "${APP_PORT}" --bind 127.0.0.1 >/tmp/portfolio-tracker-2026-app.log 2>&1 &
APP_PID=$!

node server.js >/tmp/portfolio-tracker-2026-proxy.log 2>&1 &
PROXY_PID=$!

sleep 1

if ! kill -0 "${APP_PID}" 2>/dev/null; then
  echo "Static app server failed to start. See /tmp/portfolio-tracker-2026-app.log" >&2
  exit 1
fi

if ! kill -0 "${PROXY_PID}" 2>/dev/null; then
  echo "Proxy server failed to start. See /tmp/portfolio-tracker-2026-proxy.log" >&2
  exit 1
fi

if command -v xdg-open >/dev/null 2>&1; then
  xdg-open "${APP_URL}" >/dev/null 2>&1 || true
elif command -v open >/dev/null 2>&1; then
  open "${APP_URL}" >/dev/null 2>&1 || true
fi

echo "App server:   ${APP_URL}"
echo "Proxy server: http://127.0.0.1:${PROXY_PORT}"
echo "Logs:"
echo "  /tmp/portfolio-tracker-2026-app.log"
echo "  /tmp/portfolio-tracker-2026-proxy.log"
echo "Press Ctrl+C to stop both servers."

wait "${APP_PID}" "${PROXY_PID}"
