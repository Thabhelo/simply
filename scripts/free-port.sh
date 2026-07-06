#!/usr/bin/env bash
# Free the default Vite port before starting dev (avoid 5174 fallback).
set -euo pipefail
PORT="${1:-5173}"
PIDS="$(lsof -ti :"$PORT" 2>/dev/null || true)"
if [[ -n "$PIDS" ]]; then
  echo "Freeing port $PORT (PIDs: $(echo "$PIDS" | tr '\n' ' '))"
  kill $PIDS 2>/dev/null || true
  sleep 0.3
fi
