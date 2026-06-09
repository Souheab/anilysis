#!/usr/bin/env bash
set -Eeuo pipefail

backend_pid=""
nginx_pid=""

is_verbose() {
  case "${VERBOSE_LOGS:-0}" in
    1 | true | TRUE | yes | YES | on | ON)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

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
uvicorn_args=(--host "$BACKEND_HOST" --port "$BACKEND_PORT")

if is_verbose; then
  uvicorn "${uvicorn_args[@]}" app.main:app &
else
  uvicorn "${uvicorn_args[@]}" --log-level warning --no-access-log app.main:app >/dev/null 2>&1 &
fi
backend_pid=$!

if is_verbose; then
  nginx -g "daemon off;" &
else
  nginx -g "daemon off;" >/dev/null 2>&1 &
fi
nginx_pid=$!

app_url="http://localhost:8080"
app_link=$'\e]8;;'"$app_url"$'\a'"$app_url"$'\e]8;;\a'
printf '\nAnime Six Degrees is being served at %s\n\n' "$app_link"

wait -n "$backend_pid" "$nginx_pid"
