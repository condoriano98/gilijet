-- Season is a public calendar: anyone may read it, nobody but the DB role
-- (Prisma connects as postgres, which bypasses RLS) may write it. `prisma db
-- push` does not manage policies, so apply this by hand after the push.
-- Idempotent: safe to run more than once.
ALTER TABLE "Season" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "season_public_read" ON "Season";
CREATE POLICY "season_public_read" ON "Season"
  FOR SELECT
  TO anon, authenticated
  USING ("isActive" = true AND "deletedAt" IS NULL);
