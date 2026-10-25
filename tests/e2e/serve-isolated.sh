#!/usr/bin/env bash
# Builds the committed HEAD in its own git worktree and serves it with `next start`.
# Other agents may be editing or building in the main tree; this never touches its .next.
# The worktree has no .env and DEMO_MODE=1 is set below, so the app runs in demo mode (in-memory data, demo sign-in).
#
# Usage: bash tests/e2e/serve-isolated.sh [port]      (E2E_DIR overrides the worktree path)
set -euo pipefail
PORT="${1:-3300}"
REPO="$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"
DIR="${E2E_DIR:-${TMPDIR:-/tmp}/thnhc-e2e-build}"

if [ ! -e "$DIR/.git" ]; then
  git -C "$REPO" worktree add --detach "$DIR" HEAD
else
  git -C "$DIR" checkout --detach --force "$(git -C "$REPO" rev-parse HEAD)"
fi
# Test-only dependency changes may not be committed yet: copy the manifest + lockfile across.
cp "$REPO/package.json" "$REPO/pnpm-lock.yaml" "$DIR/"
if [ "$(cd "$DIR" && pwd -P)" = "$(cd "$REPO" && pwd -P)" ]; then
  echo "E2E_DIR must not be the main working tree" >&2; exit 1
fi
cd "$DIR"
if ls .env .env.local >/dev/null 2>&1; then
  echo "$DIR has a .env file; the E2E tests need demo mode (no real keys). Use another E2E_DIR." >&2; exit 1
fi
pnpm install --offline --frozen-lockfile
pnpm build
export DEMO_MODE=1 # D28: demo mode is off unless set explicitly
export DEMO_SESSION_SECRET="${DEMO_SESSION_SECRET:-e2e-only-demo-session-secret-000000000000}"
exec ./node_modules/.bin/next start -p "$PORT"
