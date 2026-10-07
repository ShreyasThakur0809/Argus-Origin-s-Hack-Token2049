#!/usr/bin/env bash
# Stop whatever dev-start.sh started.

set -u
cd "$(dirname "$0")/.."

for f in .local/dev-server-*.pid; do
  [ -f "$f" ] && kill "$(cat "$f")" 2>/dev/null; rm -f "$f"
done
for port in 3000 4021; do
  lsof -ti ":$port" | xargs kill 2>/dev/null
done
for port in 3000 4021; do
  lsof -ti ":$port" >/dev/null 2>&1 && echo "port $port still busy" || true
done
echo "stopped"
