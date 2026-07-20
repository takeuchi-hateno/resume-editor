#!/usr/bin/env bash
set -euo pipefail

repository_root="$(git rev-parse --show-toplevel)"
cd "$repository_root"

staged_files="$(git diff --cached --name-only --diff-filter=ACMRTUXB)"
privacy_error=0

while IFS= read -r file_path; do
  [ -n "$file_path" ] || continue
  case "$file_path" in
    private/*|*.private.json|*.pdf|.private-terms.local)
      printf 'Privacy check failed: prohibited staged path: %s\n' "$file_path" >&2
      privacy_error=1
      ;;
  esac
done <<< "$staged_files"

if [ -f .private-terms.local ]; then
  while IFS= read -r private_term || [ -n "$private_term" ]; do
    case "$private_term" in
      ''|'#'*) continue ;;
    esac
    while IFS= read -r file_path; do
      [ -n "$file_path" ] || continue
      if git show ":$file_path" 2>/dev/null | grep -Fq -- "$private_term"; then
        printf 'Privacy check failed: a private term was found in staged content: %s\n' "$file_path" >&2
        privacy_error=1
      fi
    done <<< "$staged_files"
  done < .private-terms.local
fi

if [ "$privacy_error" -ne 0 ]; then
  printf 'Commit aborted. Remove private files or private terms from the staged content.\n' >&2
  exit 1
fi

printf 'Privacy check passed.\n'
