#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PORT="${ATLAS_PORT:-8765}"
URL="http://127.0.0.1:${PORT}/"
RUNTIME_DIR="${XDG_RUNTIME_DIR:-/tmp}"
PID_FILE="${RUNTIME_DIR}/fedora-command-atlas-${UID}.pid"
LOG_FILE="${RUNTIME_DIR}/fedora-command-atlas-${UID}.log"

if ! command -v python3 >/dev/null 2>&1; then
  echo "Python 3 is required to run Fedora Command Atlas." >&2
  exit 1
fi

# Reuse this project's server if it is already serving on the selected port.
if [[ -f "$PID_FILE" ]] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
  if python3 - "$URL" <<'PY'
import sys, urllib.request
try:
    body = urllib.request.urlopen(sys.argv[1], timeout=1).read(8192)
    raise SystemExit(0 if b"Fedora Command Atlas" in body else 1)
except Exception:
    raise SystemExit(1)
PY
  then
    echo "Fedora Command Atlas is already running at ${URL}"
  else
    echo "The saved Atlas server process is not responding at ${URL}." >&2
    echo "Check ${LOG_FILE}, or choose another port with ATLAS_PORT=PORT." >&2
    exit 1
  fi
else
  if ! python3 - "$PORT" <<'PY'
import socket, sys
try:
    port = int(sys.argv[1])
    if not 1 <= port <= 65535: raise ValueError()
    with socket.socket() as s: s.bind(("127.0.0.1", port))
except (OSError, ValueError):
    raise SystemExit(1)
PY
  then
    echo "Port ${PORT} is unavailable. Choose another with ATLAS_PORT=PORT." >&2
    exit 1
  fi

  nohup python3 -m http.server "$PORT" --bind 127.0.0.1 --directory "$PROJECT_DIR" >"$LOG_FILE" 2>&1 </dev/null &
  echo "$!" > "$PID_FILE"

  ready=0
  for _ in {1..30}; do
    if python3 - "$URL" <<'PY'
import sys, urllib.request
try:
    body = urllib.request.urlopen(sys.argv[1], timeout=1).read(8192)
    raise SystemExit(0 if b"Fedora Command Atlas" in body else 1)
except Exception:
    raise SystemExit(1)
PY
    then
      ready=1
      break
    fi
    sleep 0.2
  done

  if [[ "$ready" -ne 1 ]]; then
    echo "The Atlas server did not start. See ${LOG_FILE}." >&2
    exit 1
  fi
  echo "Fedora Command Atlas server started at ${URL}"
fi

if command -v xdg-open >/dev/null 2>&1; then
  xdg-open "$URL" >/dev/null 2>&1 &
elif command -v gio >/dev/null 2>&1; then
  gio open "$URL" >/dev/null 2>&1 &
else
  echo "Could not find a browser opener. Open ${URL} in your browser."
fi
