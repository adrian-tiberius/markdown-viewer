# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog and this project follows Semantic
Versioning for release tags.

## [Unreleased]

## [0.1.0-alpha.6] - 2026-02-16

### Changed

- Reader measure-width limits now derive from the active window viewport, not oversized layout bounds.
- App version metadata is aligned to `0.1.0-alpha.6` across desktop/frontend manifests.

### Fixed

- Main app shell sizing now tracks the current window size instead of static `100vh` behavior.

## [0.1.0-alpha.5] - 2026-02-14

### Added

- Frontend Playwright E2E harness and local runner scripts were added.
- Deterministic `?runtime=e2e` runtime adapters were added for reproducible browser test flows.
- Critical user workflow E2E coverage was added (document lifecycle, link permissions, workspace updates).
- CI now runs Playwright E2E tests across Linux, macOS, and Windows.
- Desktop bundle now registers markdown file associations (`.md`, `.markdown`, `.mdown`, `.mkd`, `.mkdn`) so installed builds can open these files directly.

### Changed

- Viewer UI binder internals were split into smaller methods for lower coupling and easier maintenance.
- App version metadata is aligned to `0.1.0-alpha.5` across desktop/frontend manifests.

### Fixed

- Preserved UNC host components in file-link resolution for Windows network paths.
- Watcher fallback shutdown flow is now non-blocking.

## [0.1.0-alpha.4] - 2026-02-10

### Added

- In-app update check command wired through the Tauri updater plugin (foundation for release update channels).
- Workspace quick-open commands in the command palette using open tabs and recent documents.
- Single-instance markdown open handoff via launch argument event + startup path consumption command.
- Linux desktop smoke script added and wired into CI for every push/PR run.
- Diagnostics report export command added for troubleshooting and support workflows.

### Changed

- Default desktop capability now includes updater permissions.
- Render chunking thresholds were extracted into tested application-level performance budget policies.
- Release workflow now publishes updater `latest.json` to GitHub Releases and signs updater artifacts via Tauri updater keys.
- Known limitation wording updated to reflect updater channel/signing setup still pending.

### Fixed

- Unsupported external link protocols are now explicitly blocked with user-visible feedback.

### Known Limitations

- Automatic updater channel/signing configuration is not finalized yet.
- Release signing/notarization is not configured by default.

## [0.1.0-alpha.3] - 2026-02-10

### Added

- Workspace productivity workflows, including find navigation, recent-document
  tracking, keyboard shortcuts, and command palette integration.
- Persisted workspace session UX for restoring active document context.
- Journey regression coverage for core viewer flows.

### Changed

- Viewer architecture was restructured into clearer controllers/use-cases to
  better enforce Clean Architecture boundaries across frontend and Rust
  workspaces.
- Development and architecture docs were updated to reflect the new boundaries
  and runtime composition.

### Fixed

- Workspace persistence behavior was hardened to reduce session consistency
  issues.
- Document render consistency was improved for path/link edge cases.

## [0.1.0-alpha.2] - 2026-02-10

### Added

- In-window markdown tabs and tab switching workflow.
- Linked-file access restrictions with custom permission dialogs.
- Collapsible sidebars and dynamic measure width controls.
- Release asset cleanup script for removing stale GitHub release artifacts after
  tag reruns.

### Changed

- Viewer flows were aligned with Clean Architecture boundaries in application,
  infrastructure, and presentation layers.
- Release workflow handling and runbook guidance were tightened for release
  asset hygiene.

### Fixed

- Link navigation behavior was hardened across local fixture edge cases,
  including nested paths and spaced filenames.

## [0.1.0-alpha.1] - 2026-02-09

### Added

- Initial public alpha release of the desktop markdown viewer.
- Tauri desktop app with TypeScript frontend and Rust backend.
- Markdown rendering with syntax highlighting and math support.
- Live file watching, drag-and-drop loading, and persistent viewer settings.
- Table of contents navigation, reading metrics, and performance mode.
- `Safe Mode` fallback that preserves readability on rendering failures.
- Clean Architecture boundaries enforced with automated tests in frontend and
  Rust workspaces.
- CI verification workflow plus tagged alpha release workflow that builds
  Linux, macOS, and Windows bundles, smoke-tests binaries, and publishes
  checksums.

### Known Limitations

- Automatic updates are not configured.
- Code-signing and notarization are not configured.

[Unreleased]: https://github.com/adrian-tiberius/markdown-viewer/compare/v0.1.0-alpha.6...HEAD
[0.1.0-alpha.6]: https://github.com/adrian-tiberius/markdown-viewer/releases/tag/v0.1.0-alpha.6
[0.1.0-alpha.5]: https://github.com/adrian-tiberius/markdown-viewer/releases/tag/v0.1.0-alpha.5
[0.1.0-alpha.4]: https://github.com/adrian-tiberius/markdown-viewer/releases/tag/v0.1.0-alpha.4
[0.1.0-alpha.3]: https://github.com/adrian-tiberius/markdown-viewer/releases/tag/v0.1.0-alpha.3
[0.1.0-alpha.2]: https://github.com/adrian-tiberius/markdown-viewer/releases/tag/v0.1.0-alpha.2
[0.1.0-alpha.1]: https://github.com/adrian-tiberius/markdown-viewer/releases/tag/v0.1.0-alpha.1
