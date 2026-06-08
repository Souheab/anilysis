#!/usr/bin/env bash
set -Eeuo pipefail

backend_pid=""
nginx_pid=""

shutdown() {
  local exit_code=$?
  trap - EXIT INT TERM

  if [[ -n "${backend_pid:-}" ]]; then
    kill -TERM "$backend_pid" 2>/dev/null || true
    wait "$backend_pid" 2>/dev/null || true
  fi

  if [[ -n "${nginx_pid:-}" ]]; then
    kill -TERM "$nginx_pid" 2>/dev/null || true
    wait "$nginx_pid" 2>/dev/null || true
  fi

  exit "$exit_code"
}

trap shutdown EXIT INT TERM

cd /app/backend
uvicorn app.main:app --host "$BACKEND_HOST" --port "$BACKEND_PORT" &
backend_pid=$!

nginx -g "daemon off;" &
nginx_pid=$!

wait -n "$backend_pid" "$nginx_pid"
