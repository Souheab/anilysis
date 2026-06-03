#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"

BACKEND_HOST="${BACKEND_HOST:-0.0.0.0}"
BACKEND_PORT="${BACKEND_PORT:-8000}"
FRONTEND_HOST="${FRONTEND_HOST:-0.0.0.0}"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"
export BACKEND_HOST BACKEND_PORT FRONTEND_HOST FRONTEND_PORT

backend_pid=""
frontend_pid=""

cleanup() {
  local exit_code=$?

  trap - EXIT INT TERM

  echo
  echo "Stopping development servers..."

  if [[ -n "${frontend_pid:-}" ]]; then
    kill -TERM "-$frontend_pid" 2>/dev/null || kill -TERM "$frontend_pid" 2>/dev/null || true
  fi

  if [[ -n "${backend_pid:-}" ]]; then
    kill -TERM "-$backend_pid" 2>/dev/null || kill -TERM "$backend_pid" 2>/dev/null || true
  fi

  wait "$frontend_pid" 2>/dev/null || true
  wait "$backend_pid" 2>/dev/null || true

  exit "$exit_code"
}

trap cleanup EXIT INT TERM

if [[ ! -f "$BACKEND_DIR/.venv/bin/activate" ]]; then
  echo "Missing Python virtual environment at $BACKEND_DIR/.venv" >&2
  echo "Create it first, then install backend/requirements.txt." >&2
  exit 1
fi

if [[ ! -d "$FRONTEND_DIR/node_modules" ]]; then
  echo "Missing frontend dependencies at $FRONTEND_DIR/node_modules" >&2
  echo "Run npm install in the frontend directory first." >&2
  exit 1
fi

echo "Starting backend on http://$BACKEND_HOST:$BACKEND_PORT"
setsid bash -c '
  set -Eeuo pipefail
  cd "$1"
  source .venv/bin/activate
  exec uvicorn app.main:app --reload --host "$BACKEND_HOST" --port "$BACKEND_PORT"
' bash "$BACKEND_DIR" &
backend_pid=$!

echo "Starting frontend on http://$FRONTEND_HOST:$FRONTEND_PORT"
setsid bash -c '
  set -Eeuo pipefail
  cd "$1"
  exec npm run dev -- --host "$FRONTEND_HOST" --port "$FRONTEND_PORT" --strictPort
' bash "$FRONTEND_DIR" &
frontend_pid=$!

echo
echo "Frontend: http://localhost:$FRONTEND_PORT"
echo "Backend:  http://localhost:$BACKEND_PORT"
echo "Press Ctrl-C to stop both servers."
echo

wait -n "$backend_pid" "$frontend_pid"
