#!/usr/bin/env bash

set -euo pipefail

BINARY_PATH="${1:-./src-tauri/target/release/markdown-viewer}"
SMOKE_SECONDS="${SMOKE_SECONDS:-10}"

if [[ ! -x "$BINARY_PATH" ]]; then
  echo "Desktop binary not found or not executable: $BINARY_PATH"
  exit 1
fi

if ! command -v Xvfb >/dev/null 2>&1; then
  echo "Xvfb is required for Linux desktop smoke tests."
  exit 1
fi

if ! command -v xdpyinfo >/dev/null 2>&1; then
  echo "xdpyinfo is required for Linux desktop smoke tests."
  exit 1
fi

Xvfb :99 -screen 0 1280x720x24 -ac +extension GLX +render -noreset &
XVFB_PID=$!
APP_PID=""

cleanup() {
  if [[ -n "$APP_PID" ]] && kill -0 "$APP_PID" 2>/dev/null; then
    kill "$APP_PID" 2>/dev/null || true
    wait "$APP_PID" 2>/dev/null || true
  fi

  if kill -0 "$XVFB_PID" 2>/dev/null; then
    kill "$XVFB_PID" 2>/dev/null || true
    wait "$XVFB_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

export DISPLAY=:99
export GDK_BACKEND=x11
unset WAYLAND_DISPLAY

for _ in $(seq 1 40); do
  if xdpyinfo -display "$DISPLAY" >/dev/null 2>&1; then
    break
  fi
  sleep 0.25
done

if ! xdpyinfo -display "$DISPLAY" >/dev/null 2>&1; then
  echo "Xvfb failed to initialize display $DISPLAY"
  exit 1
fi

"$BINARY_PATH" &
APP_PID=$!
sleep "$SMOKE_SECONDS"

if ! kill -0 "$APP_PID" 2>/dev/null; then
  echo "App exited early during Linux smoke test"
  wait "$APP_PID" || true
  exit 1
fi

kill "$APP_PID"
wait "$APP_PID" || true
