#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  ./scripts/cleanup-release-assets.sh <tag> [--repo owner/name] [--host github.com] [--apply] [--yes] [--keep-regex <regex>]

Description:
  Removes stale assets from a GitHub release by tag.
  Default mode is dry-run. Use --apply to perform deletions.

Defaults:
  --repo: current gh repository
  --host: github.com
  --keep-regex: keep common distributables and checksum files
EOF
}

cleanup_tmp() {
  if [ -n "${release_json:-}" ] && [ -f "${release_json:-}" ]; then
    rm -f "$release_json"
  fi

  if [ -n "${release_err:-}" ] && [ -f "${release_err:-}" ]; then
    rm -f "$release_err"
  fi

  if [ -n "${to_delete_file:-}" ] && [ -f "${to_delete_file:-}" ]; then
    rm -f "$to_delete_file"
  fi
}

if [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ]; then
  usage
  exit 0
fi

if [ $# -lt 1 ]; then
  usage
  exit 1
fi

tag="$1"
shift

repo=""
host="github.com"
apply=0
assume_yes=0
keep_regex='(SHA256SUMS\.txt$|.*\.(AppImage|deb|rpm|dmg|exe|msi|zip|pkg|sig)$)'

while [ $# -gt 0 ]; do
  case "$1" in
    --repo)
      if [ $# -lt 2 ]; then
        echo "Error: --repo requires a value." >&2
        exit 1
      fi
      repo="$2"
      shift 2
      ;;
    --host)
      if [ $# -lt 2 ]; then
        echo "Error: --host requires a value." >&2
        exit 1
      fi
      host="$2"
      shift 2
      ;;
    --apply)
      apply=1
      shift
      ;;
    --yes)
      assume_yes=1
      shift
      ;;
    --keep-regex)
      if [ $# -lt 2 ]; then
        echo "Error: --keep-regex requires a value." >&2
        exit 1
      fi
      keep_regex="$2"
      shift 2
      ;;
    *)
      echo "Error: unknown argument: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if ! command -v gh >/dev/null 2>&1; then
  echo "Error: gh CLI is required (https://cli.github.com/)." >&2
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "Error: jq is required." >&2
  exit 1
fi

if [ -z "${repo:-}" ]; then
  if ! repo="$(gh repo view --hostname "$host" --json nameWithOwner -q .nameWithOwner 2>/dev/null)"; then
    echo "Error: unable to detect repository. Provide --repo owner/name." >&2
    exit 1
  fi
fi

release_json="$(mktemp)"
release_err="$(mktemp)"
to_delete_file=""
trap cleanup_tmp EXIT

tag_path="${tag//\//%2F}"

if ! gh api --hostname "$host" "repos/${repo}/releases/tags/${tag_path}" > "$release_json" 2>"$release_err"; then
  echo "Error: unable to fetch release tag '${tag}' in '${repo}' on host '${host}'." >&2
  if [ -s "$release_err" ]; then
    echo "gh error:" >&2
    sed -n '1,6p' "$release_err" >&2
  fi
  echo "Try: gh auth status -h ${host}" >&2
  exit 1
fi

to_delete_file="$(mktemp)"
jq -r --arg keep_regex "$keep_regex" \
  '.assets[]
   | select((.name | test($keep_regex)) | not)
   | [.id, .name, .size]
   | @tsv' "$release_json" > "$to_delete_file"

if [ ! -s "$to_delete_file" ]; then
  echo "No stale assets detected for ${repo}@${tag}."
  exit 0
fi

echo "Stale assets to remove from ${repo}@${tag}:"
awk -F'\t' '{ printf "  - %s (%s bytes)\n", $2, $3 }' "$to_delete_file"
echo

if [ "$apply" -eq 0 ]; then
  echo "Dry run only. Re-run with --apply to delete these assets."
  exit 0
fi

if [ "$assume_yes" -eq 0 ]; then
  read -r -p "Delete these assets? [y/N] " confirm
  case "$confirm" in
    y|Y|yes|YES) ;;
    *)
      echo "Aborted."
      exit 1
      ;;
  esac
fi

while IFS=$'\t' read -r asset_id asset_name _; do
  echo "Deleting: ${asset_name}"
  gh api --hostname "$host" -X DELETE "repos/${repo}/releases/assets/${asset_id}" >/dev/null
done < "$to_delete_file"

echo "Cleanup complete."
