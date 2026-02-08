#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "[1/5] Frontend install check"
pnpm --dir "$ROOT_DIR/frontend" install --frozen-lockfile

echo "[2/5] Frontend typecheck + tests"
pnpm --dir "$ROOT_DIR/frontend" lint
pnpm --dir "$ROOT_DIR/frontend" test

echo "[3/5] Frontend production build"
pnpm --dir "$ROOT_DIR/frontend" build

echo "[4/5] Rust formatting + lint"
cargo fmt --all --check --manifest-path "$ROOT_DIR/src-tauri/Cargo.toml"
cargo clippy --workspace --manifest-path "$ROOT_DIR/src-tauri/Cargo.toml" -- -D warnings

echo "[5/5] Rust tests"
cargo test --workspace --manifest-path "$ROOT_DIR/src-tauri/Cargo.toml"
