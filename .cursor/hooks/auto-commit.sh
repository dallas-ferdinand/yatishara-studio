#!/usr/bin/env bash
# Sweeps any leftover working-tree changes into a local commit at the end of every
# agent turn, so a bad iteration is always one `git revert`/`git reset` away.
# Never pushes. Never touches remotes. Secrets are left unstaged.
set -uo pipefail

cat >/dev/null 2>&1 || true

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO" 2>/dev/null || { echo '{}'; exit 0; }

GIT_DIR="$(git rev-parse --git-dir 2>/dev/null)" || { echo '{}'; exit 0; }
LOG="$GIT_DIR/auto-commit.log"
log() { printf '%s %s\n' "$(date -Is)" "$*" >>"$LOG" 2>/dev/null || true; }

# Mid-merge/rebase/bisect: staging would corrupt the operation.
for marker in MERGE_HEAD REBASE_HEAD CHERRY_PICK_HEAD BISECT_LOG rebase-merge rebase-apply; do
  if [[ -e "$GIT_DIR/$marker" ]]; then
    log "skip: $marker present"
    echo '{}'
    exit 0
  fi
done

if [[ -z "$(git status --porcelain 2>/dev/null)" ]]; then
  echo '{}'
  exit 0
fi

git add -A >/dev/null 2>&1 || { log "skip: git add failed"; echo '{}'; exit 0; }

# Anything credential-shaped goes back to the working tree rather than into history.
SECRET_RE='(^|/)(\.env(\.|$)|.*\.pem$|.*\.p12$|.*\.pfx$|.*_rsa$|.*_ed25519$|.*\.key$|.*secret.*|.*credential.*)'
skipped=()
while IFS= read -r path; do
  [[ -z "$path" ]] && continue
  if [[ "$path" =~ $SECRET_RE ]]; then
    git restore --staged -- "$path" >/dev/null 2>&1 || true
    skipped+=("$path")
  fi
done < <(git diff --cached --name-only 2>/dev/null)

mapfile -t staged < <(git diff --cached --name-only 2>/dev/null)
if [[ ${#staged[@]} -eq 0 ]]; then
  log "nothing staged (skipped: ${skipped[*]:-none})"
  echo '{}'
  exit 0
fi

# Name the commit after the areas it touches so the log stays scannable.
areas="$(printf '%s\n' "${staged[@]}" \
  | awk '{ n = split($0, p, "/"); if (n > 1 && (p[1] == "src" || p[1] == "convex")) print p[1] "/" p[2]; else print p[1] }' \
  | sort -u | head -3 | tr '\n' ' ' | sed 's/ *$//; s/ /, /g')"
[[ -z "$areas" ]] && areas="repo"
subject="wip(auto): ${areas} (${#staged[@]} files)"

body="Automatic checkpoint from the Cursor stop hook so every agent turn stays revertible."
if [[ ${#skipped[@]} -gt 0 ]]; then
  body="$body"$'\n\n'"Left unstaged (credential-shaped): ${skipped[*]}"
fi

if git -c core.hooksPath=/dev/null commit --no-verify -m "$subject" -m "$body" >/dev/null 2>&1; then
  log "committed: $subject"
else
  log "commit failed: $subject"
  echo '{}'
  exit 0
fi

if [[ ${#skipped[@]} -gt 0 ]]; then
  jq -nc --arg files "${skipped[*]}" '{followup_message: ("AUTO-COMMIT: checkpoint created, but these credential-shaped files were left uncommitted: " + $files + ". Confirm they are ignored or intentionally untracked, then stop.")}'
  exit 0
fi

echo '{}'
exit 0
