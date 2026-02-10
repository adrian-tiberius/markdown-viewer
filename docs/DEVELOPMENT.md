# Development Guide

## Quick Workflow

1. Install dependencies:

```bash
pnpm --dir frontend install
```

2. Run all tests:

```bash
./scripts/test-all.sh
```

For full alpha-quality validation (format, lint, tests, and builds), run:

```bash
./scripts/verify.sh
```

3. Start desktop dev app:

```bash
cd src-tauri
cargo tauri dev
```

## Layering Rules

### Frontend (`frontend/src`)

- `domain`: pure entities/invariants, no browser or Tauri dependencies.
- `application`: use-cases and app-level policies, no DOM/Tauri access.
- `domain` and `application`: no external package/style/asset imports; depend only on local layer modules.
- `infrastructure`: adapters to external systems (Tauri API, local storage).
- `presentation`: UI/DOM orchestration and view concerns.
- `main.ts`: composition root only.

Enforced by: `frontend/src/architecture.boundaries.test.ts`.

### Rust (`src-tauri/crates`)

- `domain`: entities and core business rules.
- `application`: use-cases and trait ports.
- `presentation`: DTO/state adapters for command boundaries.
- `infrastructure`: concrete adapters (filesystem, markdown renderer, file watcher).
- `src-tauri/src/lib.rs`: composition root and Tauri command wiring.

Enforced by: `src-tauri/tests/clean_architecture_boundaries.rs`.

## Adding New Functionality

### Frontend flow

1. Add/update domain types in `frontend/src/domain`.
2. Add use-case logic in `frontend/src/application`.
3. Extend adapter port interfaces in `frontend/src/application/ports.ts` if needed.
4. Implement adapters in `frontend/src/infrastructure`.
5. Wire behavior in `frontend/src/presentation`.
6. Keep startup wiring in `frontend/src/main.ts` minimal.

### Rust flow

1. Add domain entities/rules in `src-tauri/crates/domain`.
2. Add use-cases and ports in `src-tauri/crates/application`.
3. Add adapter DTO/state mappings in `src-tauri/crates/presentation`.
4. Implement concrete adapters in `src-tauri/crates/infrastructure`.
5. Wire commands/events in `src-tauri/src/lib.rs`.

## Testing Strategy

- Unit tests live beside source files for each layer.
- Architecture tests are mandatory quality gates.
- Run both stacks together before changes are finalized:

```bash
./scripts/test-all.sh
```

## Common Commands

- Full verification gate:

```bash
./scripts/verify.sh
```

- Frontend tests:

```bash
pnpm --dir frontend test
```

- Frontend lint/typecheck:

```bash
pnpm --dir frontend lint
```

- Frontend watch tests:

```bash
pnpm --dir frontend test:watch
```

- Rust tests:

```bash
cargo test --workspace --manifest-path src-tauri/Cargo.toml
```

- Frontend build only:

```bash
pnpm --dir frontend build
```

- Desktop production build:

```bash
cd src-tauri
cargo tauri build
```

- Linux desktop runtime smoke test (release binary):

```bash
cargo build --release --manifest-path src-tauri/Cargo.toml
./scripts/smoke-desktop-linux.sh ./src-tauri/target/release/app
```
