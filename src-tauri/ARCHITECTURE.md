# Clean Architecture Contract

This project follows Uncle Bob's Clean Architecture with explicit crate boundaries:

- `markdown_viewer_domain` (Entities)
- `markdown_viewer_application` (Use Cases + Ports)
- `markdown_viewer_presentation` (Interface Adapters for API/DTO/state)
- `markdown_viewer_infrastructure` (Framework/Driver adapters: filesystem, renderer, watcher)
- `app` (`src-tauri/src/lib.rs`) as composition root and Tauri runtime wiring

## Dependency Rule

Dependencies must always point inward:

- `domain` depends on no local crates.
- `application` depends only on `domain`.
- `presentation` depends only on `application`.
- `infrastructure` depends on `application` and `domain`.
- `app` can depend on all outer layers to wire runtime behavior.

Framework crates (`tauri`, `rfd`, `notify`, `comrak`) must not appear in inner layers (`domain`, `application`, `presentation`).
Core layers (`domain`, `application`) must stay free of direct I/O/runtime imports such as
`std::fs`, `std::io`, `std::net`, `std::thread`, or `tokio::{fs,io,net,task}`.

## Enforcement

`src-tauri/tests/clean_architecture_boundaries.rs` enforces the crate-level dependency graph,
blocks framework imports in inner layers, and prevents direct I/O/runtime imports in core layers.
Dependency checks cover `dependencies`, `dev-dependencies`, `build-dependencies`, and
target-specific dependency sections (including renamed packages via Cargo's `package = "..."`
syntax).
