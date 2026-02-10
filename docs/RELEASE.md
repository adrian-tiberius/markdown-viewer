# Open Source Release Runbook

Use this guide for the first public publication and future tagged releases.

## 1. Create the GitHub repository (one-time)

If the repository already exists, skip this section.

1. In GitHub, create repository:
   - Owner: `adrian-tiberius`
   - Name: `markdown-viewer`
   - Visibility: `Public`
   - Do not initialize with README, `.gitignore`, or License.
2. Add local remote and push:

```bash
git remote add origin https://github.com/adrian-tiberius/markdown-viewer.git
git push -u origin main
```

## 2. Configure repository profile (one-time)

Set these in repository home/settings:

- Description: `Desktop markdown viewer built with Tauri (Rust + TypeScript).`
- Website: optional; leave empty if no project website exists.
- Topics: `tauri`, `markdown`, `desktop-app`, `rust`, `typescript`,
  `clean-architecture`.

## 3. Configure repository settings (one-time)

### 3.1 General

- Default branch: `main`.
- Features enabled: `Issues`.
- Features optional: `Discussions` (enable if you want community Q&A).

### 3.2 Branch protection / ruleset for `main`

Create a branch ruleset for `main` with:

- Require a pull request before merging.
- Require at least 1 approval.
- Dismiss stale approvals on new commits.
- Require conversation resolution before merge.
- Require status checks to pass before merging.
- Required check: `verify` (from `.github/workflows/ci.yml`).
- Require branches to be up to date before merging.
- Block force pushes.
- Block branch deletion.
- Apply rules to administrators.

### 3.3 Actions

- Actions permissions: allow workflow execution.
- Workflow permissions: `Read and write permissions`
  (needed for `.github/workflows/release.yml` publishing releases).

### 3.4 Security

- Enable private vulnerability reporting.
- Enable dependency graph.
- Enable Dependabot alerts and security updates.
- Enable secret scanning and push protection (if available on the plan).

## 4. Verify project metadata before release

Confirm the following are present and consistent:

- Version matches in:
  - `frontend/package.json`
  - `src-tauri/Cargo.toml`
  - `src-tauri/tauri.conf.json`
- Repository URL set in `src-tauri/Cargo.toml`.
- License file present (`LICENSE`) and package manifests use same license.
- Open-source docs are present:
  `README.md`, `CHANGELOG.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`,
  `SECURITY.md`, `SUPPORT.md`.

## 5. Pre-release checks (every release)

Run local quality gates:

```bash
./scripts/verify.sh
```

Optional local production build check:

```bash
cd src-tauri
cargo tauri build
```

Prepare release notes in `CHANGELOG.md`:

- Keep `Unreleased` at top.
- Add/update the version section (example: `0.1.0-alpha.1`) with date.
- Include known limitations for prerelease transparency.

### Updater signing + GitHub Releases feed secrets (required)

Set these repository secrets before tagging:

- `TAURI_SIGNING_PRIVATE_KEY`: updater private key text from `cargo tauri signer generate`.
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: password for that key (optional if key has no password).
- `TAURI_UPDATER_PUBLIC_KEY`: matching updater public key text.

Generate keys once (local machine, keep private key secure):

```bash
cd src-tauri
cargo tauri signer generate --ci -w .tauri/updater.key
```

The release workflow injects:

- `plugins.updater.pubkey` from `TAURI_UPDATER_PUBLIC_KEY`.
- `plugins.updater.endpoints` as
  `https://github.com/<owner>/<repo>/releases/latest/download/latest.json`.

## 6. Publish a release tag

From a clean `main` checkout:

```bash
git pull --ff-only
git tag -a v0.1.0-alpha.1 -m "v0.1.0-alpha.1"
git push origin v0.1.0-alpha.1
```

What happens next:

- `.github/workflows/release.yml` builds Linux, macOS, and Windows bundles.
- Workflow signs updater artifacts with the updater private key and uploads signatures.
- Workflow uploads `latest.json` to GitHub Releases for updater feed consumption.
- macOS and Windows app bundles remain unsigned/notarization-free unless platform credentials are configured separately.
- Workflow publishes/updates a GitHub release for the tag.

Note: GitHub updater endpoint uses `/releases/latest/download/latest.json`.
That route follows the latest non-draft, non-prerelease release.

## 7. Post-release validation

After the workflow succeeds:

1. Open the GitHub release page and verify all platform artifacts exist.
2. Confirm `latest.json` is attached.
3. Confirm updater `.sig` files are attached for updater bundles.
4. Download one artifact per platform and run a basic launch smoke test.
5. Ensure release notes match `CHANGELOG.md`.

If a tag was re-run and old assets remained on an existing release, cleanup stale files:

```bash
./scripts/cleanup-release-assets.sh v0.1.0-alpha.1 --apply --yes
```

## 8. Optional hardening before broader public beta

- Configure code signing for Windows/macOS installers.
- Configure macOS notarization.
- Add SBOM generation and release artifact attestation.
