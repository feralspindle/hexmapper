#!/usr/bin/env bash
# Refuses a push to a branch whose PRs have all been closed or merged - the
# "agent keeps pushing to a dead PR" failure. Called from .githooks/pre-push
# with the branch names being pushed; usable standalone the same way:
#
#   scripts/check-pr-open.sh <branch> [branch...]
#
# A branch with no PR at all is fine (first push). If gh is missing or the
# lookup fails (offline), it warns and allows - this gate must never strand a
# push over network trouble. Deliberate bypass: HEXMAP_PUSH_CLOSED_PR=1.

set -euo pipefail

[ $# -gt 0 ] || exit 0

if [ "${HEXMAP_PUSH_CLOSED_PR:-}" = "1" ]; then
  echo "check-pr-open: HEXMAP_PUSH_CLOSED_PR=1, skipping"
  exit 0
fi

if ! command -v gh >/dev/null 2>&1; then
  echo "check-pr-open: gh not installed, skipping PR state check"
  exit 0
fi

blocked=0
for branch in "$@"; do
  if ! total=$(gh pr list --head "$branch" --state all --json number --jq 'length' 2>/dev/null); then
    echo "check-pr-open: could not query PRs for '$branch' (offline?), skipping"
    continue
  fi
  [ "$total" -gt 0 ] || continue
  open=$(gh pr list --head "$branch" --state open --json number --jq 'length' 2>/dev/null || echo "")
  [ -n "$open" ] || continue
  if [ "$open" -eq 0 ]; then
    blocked=1
    echo "check-pr-open: every PR for '$branch' is closed:"
    gh pr list --head "$branch" --state all --json number,state,url \
      --jq '.[] | "  #\(.number)  \(.state)  \(.url)"' 2>/dev/null || true
  fi
done

if [ "$blocked" -eq 1 ]; then
  echo
  echo "pushing would land commits on a dead PR. open a new branch/PR instead,"
  echo "or push anyway with: HEXMAP_PUSH_CLOSED_PR=1 git push"
  exit 1
fi
