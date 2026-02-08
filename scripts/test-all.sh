#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "[1/2] Running frontend unit tests"
pnpm --dir "$ROOT_DIR/frontend" test

echo "[2/2] Running Rust workspace tests"
cargo test --workspace --manifest-path "$ROOT_DIR/src-tauri/Cargo.toml"
