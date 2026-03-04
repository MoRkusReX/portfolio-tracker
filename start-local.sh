#!/usr/bin/env bash
# Starts the single local server and prints both local and LAN URLs for browser access.
set -euo pipefail

# Resolves the project directory regardless of the current shell location.
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Configures the port exposed by the local app server.
APP_PORT="${APP_PORT:-5500}"
# Configures the bind host used by the Node server.
HOST="${HOST:-0.0.0.0}"
# Stores the local loopback URL that is opened automatically.
APP_URL="http://127.0.0.1:${APP_PORT}/"
# Tracks the background server process for cleanup.
SERVER_PID=""

# Verifies a required executable exists before the script continues.
require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

# Checks whether a TCP port is already occupied.
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

# Stops the background server process when the script exits.
cleanup() {
  local exit_code=$?
  if [[ -n "${SERVER_PID}" ]] && kill -0 "${SERVER_PID}" 2>/dev/null; then
    kill "${SERVER_PID}" 2>/dev/null || true
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

cd "${ROOT_DIR}"

PORT="${APP_PORT}" HOST="${HOST}" node server.js >/tmp/portfolio-tracker-2026-server.log 2>&1 &
SERVER_PID=$!

sleep 1

if ! kill -0 "${SERVER_PID}" 2>/dev/null; then
  echo "Server failed to start. See /tmp/portfolio-tracker-2026-server.log" >&2
  exit 1
fi

if command -v xdg-open >/dev/null 2>&1; then
  xdg-open "${APP_URL}" >/dev/null 2>&1 || true
elif command -v open >/dev/null 2>&1; then
  open "${APP_URL}" >/dev/null 2>&1 || true
fi

echo "App server:   ${APP_URL}"
if command -v hostname >/dev/null 2>&1; then
  LAN_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
  if [[ -n "${LAN_IP:-}" ]]; then
    echo "Phone/LAN:    http://${LAN_IP}:${APP_PORT}/"
  fi
fi
echo "Logs:"
echo "  /tmp/portfolio-tracker-2026-server.log"
echo "Press Ctrl+C to stop the server."

wait "${SERVER_PID}"
