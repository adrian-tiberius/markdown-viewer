# Third-Party License Audit

Last audited: 2026-02-08

## Project license decision

This project is released under **AGPL-3.0-only**.

Reasoning:

- Frontend dependencies are permissive (`MIT`, `Apache-2.0`, `BSD-*`, `ISC`,
  `CC0-1.0`, `MIT-0`, `BlueOak-1.0.0`).
- Rust dependencies are permissive or weak copyleft (`MPL-2.0` in transitive
  crates, no GPL dependencies detected).
- No dependency was identified as a blocker for AGPLv3 distribution.
- AGPLv3 matches the project goal of requiring publication of modifications
  when software is distributed or offered as a network service.

## Observations

- Some Rust transitive crates are `MPL-2.0`. This does not block AGPLv3 licensing
  for this repository, but distribution still requires honoring third-party
  license notices.
- Workspace crates should all carry explicit license metadata.

## Reproduce the audit

### Rust

```bash
cargo metadata --manifest-path src-tauri/Cargo.toml --format-version 1 > /tmp/mdv-cargo-metadata.json
jq -r '.packages[] | [.name,.version, (.license // "NO_LICENSE_FIELD")] | @tsv' /tmp/mdv-cargo-metadata.json
```

### Frontend

```bash
pnpm --dir frontend licenses list --json
```
