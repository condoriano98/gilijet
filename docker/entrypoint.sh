#!/usr/bin/env sh
set -e

# Wait for postgres to be reachable. Compose's depends_on with healthcheck
# usually covers this, but a short poll guards against startup race.
if [ -n "$DATABASE_URL" ]; then
  for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
    if node -e "const u=new URL(process.env.DATABASE_URL); require('net').createConnection({host:u.hostname,port:+u.port||5432}).on('connect',()=>process.exit(0)).on('error',()=>process.exit(1));" 2>/dev/null; then
      break
    fi
    echo "[entrypoint] waiting for database... ($i)"
    sleep 2
  done
fi

# Apply migrations (no-op if schema is current). `db push` is fine for MVP:
# we haven't authored migrations yet. Swap to `migrate deploy` once we have.
echo "[entrypoint] applying prisma schema..."
npx prisma db push --skip-generate --accept-data-loss=false || {
  echo "[entrypoint] prisma db push failed" >&2
  exit 1
}

# Optional one-shot seed. Set SEED_ON_START=1 to enable.
if [ "${SEED_ON_START:-0}" = "1" ]; then
  echo "[entrypoint] seeding database..."
  npx tsx prisma/seed.ts || echo "[entrypoint] seed failed (continuing)"
fi

exec "$@"
