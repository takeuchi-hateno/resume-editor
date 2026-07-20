#!/usr/bin/env bash
set -euo pipefail

repository_root="$(git rev-parse --show-toplevel)"
git_directory="$(git rev-parse --git-dir)"
hook_source="$repository_root/scripts/pre-commit-privacy-check.sh"
hook_target="$git_directory/hooks/pre-commit"

install -m 0755 "$hook_source" "$hook_target"
printf 'Installed privacy pre-commit hook at %s\n' "$hook_target"
