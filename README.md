# Markdown Viewer

Desktop markdown reader built with Tauri (Rust backend + TypeScript frontend), with live file
watching, syntax highlighting, math rendering, and a Clean Architecture codebase.

## Status

**Internal Alpha**: `0.1.0-alpha.1`
**Repository**: `https://github.com/adrian-tiberius/markdown-viewer`

This project is an internal alpha tool. Expect active iteration and occasional breaking changes.

## Features

- Open markdown files from dialog or drag-and-drop.
- Live reload when the file changes on disk.
- Table of contents with active-section tracking and collapse/expand controls.
- `Performance Mode` for lower-cost rendering on heavy documents.
- `Safe Mode` fallback that shows raw markdown if rendering fails.
- Command palette quick-open across open tabs and recent documents.
- Single-instance handoff for markdown files opened via OS launch arguments.
- Diagnostics report export for support and debugging.
- Configurable typography/theme settings persisted in local storage.
- Word count and reading time with configurable counting rules.

## Tech Stack

- Frontend: TypeScript, Vite, Vitest
- Desktop runtime: Tauri v2
- Backend: Rust workspace with layered crates
- Markdown engine: `comrak`
- Syntax highlighting: `highlight.js`
- Math rendering: `katex`

## Project Layout

```text
.
|-- frontend/                 # TypeScript UI app
|   |-- src/domain            # Domain entities and invariants
|   |-- src/application       # Use-cases and app policies
|   |-- src/infrastructure    # Tauri/localStorage/rendering adapters
|   |-- src/presentation      # UI orchestration and rendering
|   `-- ARCHITECTURE.md
|-- src-tauri/                # Rust/Tauri app and workspace crates
|   |-- crates/domain         # Entities
|   |-- crates/application    # Use-cases + ports
|   |-- crates/presentation   # DTO/state adapters
|   |-- crates/infrastructure # FS, rendering, file watching adapters
|   |-- tests/clean_architecture_boundaries.rs
|   `-- ARCHITECTURE.md
|-- docs/                     # API, development, release, licensing docs
`-- scripts/                 # Verification scripts
```

## Prerequisites

- Node.js 20+
- `pnpm`
- Rust toolchain compatible with `rust-version = 1.77.2` in `src-tauri/Cargo.toml`
- Tauri CLI v2 (`cargo install tauri-cli --version '^2'`)
- Platform dependencies required by Tauri v2
  - Linux: WebKitGTK + build essentials
  - macOS: Xcode Command Line Tools
  - Windows: MSVC Build Tools + WebView2

## Getting Started

1. Install frontend dependencies:

```bash
pnpm --dir frontend install
```

2. Run full verification:

```bash
./scripts/verify.sh
```

3. Run desktop app in development mode:

```bash
cd src-tauri
cargo tauri dev
```

`tauri.conf.json` starts the frontend dev server automatically via:
`pnpm --dir frontend dev --host 127.0.0.1 --port 1420`.

## Build

Build production desktop bundles:

```bash
cd src-tauri
cargo tauri build
```

Build frontend only:

```bash
pnpm --dir frontend build
```

## Testing and Quality Gates

- Full local gate:

```bash
./scripts/verify.sh
```

- Fast check subset:

```bash
./scripts/test-all.sh
```

- Frontend E2E suite (Playwright):

```bash
pnpm --dir frontend e2e
```

CI enforces formatting, linting, unit/integration tests, cross-platform E2E tests, and build verification via `.github/workflows/ci.yml`.

## Architecture

This project follows Uncle Bob's Clean Architecture, enforced by automated boundary tests:

- Frontend boundary tests: `frontend/src/architecture.boundaries.test.ts`
- Rust boundary tests: `src-tauri/tests/clean_architecture_boundaries.rs`

Detailed architecture docs:

- `frontend/ARCHITECTURE.md`
- `src-tauri/ARCHITECTURE.md`

## Open Source Docs

- License: `LICENSE` (`AGPL-3.0-only`)
- Contributing: `CONTRIBUTING.md`
- Code of Conduct: `CODE_OF_CONDUCT.md`
- Security policy: `SECURITY.md`
- Support channels: `SUPPORT.md`
- Changelog: `CHANGELOG.md`
- Release guide: `docs/RELEASE.md`
- Third-party license audit: `docs/THIRD_PARTY_LICENSES.md`

## Integration Contract

Frontend communicates with Rust through Tauri commands/events. Full contract details:

- `docs/TAURI_API.md`

## Known Alpha Limitations

- Automatic updater channel/signing configuration is not finalized yet.
- Release signing/notarization is not configured by default.
- Private vulnerability reporting must be enabled on the hosting platform.
