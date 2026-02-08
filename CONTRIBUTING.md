# Contributing

Thanks for contributing to Markdown Viewer.

## Development Setup

1. Install prerequisites listed in `README.md`.
2. Install frontend dependencies:

```bash
pnpm --dir frontend install
```

3. Run the full local verification suite:

```bash
./scripts/verify.sh
```

## Architecture Rules

This project enforces Clean Architecture boundaries on both stacks.

- Frontend boundaries: `frontend/src/architecture.boundaries.test.ts`
- Rust boundaries: `src-tauri/tests/clean_architecture_boundaries.rs`

Before opening a pull request, confirm both suites pass.

## Pull Request Checklist

- Keep dependency direction compliant with architecture docs.
- Add tests for any behavior change.
- Update docs if API, architecture, or developer workflow changed.
- Add a changelog entry in `CHANGELOG.md` under `Unreleased`.
- Ensure `./scripts/verify.sh` passes locally.

## Commit and PR Scope

Prefer small, focused pull requests with a clear change intent.

## Questions

Use `SUPPORT.md` for support and reporting paths.
