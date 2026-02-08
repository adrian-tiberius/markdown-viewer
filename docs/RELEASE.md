# Open Source Release Runbook

Use this guide for the first public publication and for future prereleases.

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

## 6. Publish a prerelease tag

From a clean `main` checkout:

```bash
git pull --ff-only
git tag -a v0.1.0-alpha.1 -m "v0.1.0-alpha.1"
git push origin v0.1.0-alpha.1
```

What happens next:

- `.github/workflows/release.yml` builds Linux, macOS, and Windows bundles.
- CI smoke-tests each platform binary.
- Workflow creates SHA256 checksums.
- Workflow publishes a GitHub release marked as `prerelease`.

## 7. Post-release validation

After the workflow succeeds:

1. Open the GitHub release page and verify all platform artifacts exist.
2. Confirm `SHA256SUMS.txt` is attached.
3. Download one artifact per platform and run a basic launch smoke test.
4. Ensure release notes match `CHANGELOG.md`.

## 8. Optional hardening before broader public beta

- Configure code signing for Windows/macOS installers.
- Configure macOS notarization.
- Add automatic update channel/signing pipeline.
- Add SBOM generation and release artifact attestation.
