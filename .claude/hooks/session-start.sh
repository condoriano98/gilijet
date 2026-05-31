#!/usr/bin/env bash
# SessionStart hook: ensure node_modules + a usable Prisma client exist
# whenever a fresh remote session boots into this repo. Idempotent — safe
# to re-run on every session start.
set -euo pipefail

cd "$(git rev-parse --show-toplevel 2>/dev/null || echo .)"

# --- node_modules ---------------------------------------------------------
if [[ ! -d node_modules/.bin || ! -x node_modules/.bin/next ]]; then
  if command -v pnpm >/dev/null 2>&1; then
    pnpm install --frozen-lockfile >/dev/null 2>&1 || pnpm install >/dev/null 2>&1
  else
    npm ci >/dev/null 2>&1 || npm install >/dev/null 2>&1
  fi
fi

# --- Prisma client --------------------------------------------------------
# Generate against a dummy URL when no real DB is wired — lets typecheck
# and lint succeed in remote/CI sessions that have no Postgres.
if [[ ! -d node_modules/.prisma/client ]]; then
  DATABASE_URL="${DATABASE_URL:-postgresql://x:x@localhost:5432/x}" \
  DIRECT_URL="${DIRECT_URL:-postgresql://x:x@localhost:5432/x}" \
    npx --yes prisma generate >/dev/null 2>&1 || true
fi

exit 0
