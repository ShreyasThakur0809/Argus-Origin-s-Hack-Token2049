#!/usr/bin/env bash
# Start the dev stack: Next.js on :3000.
#
#   scripts/dev-start.sh          # web on :3000, data from hosted Render API
#   scripts/dev-start.sh --local  # also runs the marketplace backend on :4021
#                                 # and points the web app at it (no Render)
#
# Hosted mode additionally pings the Render services in the background so the
# first page load isn't stuck behind a free-tier cold start.
# Logs: .local/dev-*.log · PIDs: .local/dev-*.pid

set -u
cd "$(dirname "$0")/.."
mkdir -p .local

local_backend=false
[ "${1:-}" = "--local" ] && local_backend=true

wait_port() { for _ in $(seq 1 30); do sleep 1; lsof -ti ":$1" >/dev/null 2>&1 && return 0; done; return 1; }

if $local_backend; then
  if lsof -ti :4021 >/dev/null 2>&1; then
    echo "marketplace already on :4021"
  else
    nohup npm run server >.local/dev-server-4021.log 2>&1 &
    echo $! >.local/dev-server-4021.pid
    wait_port 4021 || { echo "marketplace failed — see .local/dev-server-4021.log" >&2; exit 1; }
  fi
fi

if lsof -ti :3000 >/dev/null 2>&1; then
  echo "web already on :3000"
else
  if $local_backend; then
    MARKETPLACE_URL=http://localhost:4021 nohup npm run web:dev >.local/dev-server-3000.log 2>&1 &
  else
    nohup npm run web:dev >.local/dev-server-3000.log 2>&1 &
  fi
  echo $! >.local/dev-server-3000.pid
  wait_port 3000 || { echo "web failed — see .local/dev-server-3000.log" >&2; exit 1; }
fi

if $local_backend; then
  echo "up: http://localhost:3000 (backend: local :4021)"
else
  ( curl -s --max-time 120 -o /dev/null https://query402-facilitator.onrender.com/supported || true
    curl -s --max-time 120 -o /dev/null https://query402-marketplace.onrender.com/health || true ) &
  echo "up: http://localhost:3000 (backend: Render, warming in background)"
fi
