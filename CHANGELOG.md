# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog and this project follows Semantic
Versioning for release tags.

## [Unreleased]

### Added

- In-app update check command wired through Tauri updater plugin (foundation for release update channels).
- Workspace quick-open commands in the command palette using open tabs and recent documents.
- Single-instance markdown open handoff via launch argument event + startup path consumption command.

### Changed

- Default desktop capability now includes updater permissions.
- Known limitation wording updated to reflect updater channel/signing setup still pending.
- Unsupported external link protocols are now explicitly blocked with user-visible feedback.

### Fixed

- No changes yet.

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

[Unreleased]: https://github.com/adrian-tiberius/markdown-viewer/compare/v0.1.0-alpha.1...HEAD
[0.1.0-alpha.1]: https://github.com/adrian-tiberius/markdown-viewer/releases/tag/v0.1.0-alpha.1
