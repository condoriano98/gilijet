-- CreateEnum
CREATE TYPE "SeasonType" AS ENUM ('LOW', 'HIGH', 'PEAK', 'OFF');

-- CreateEnum
CREATE TYPE "TripType" AS ENUM ('ONE_WAY', 'ROUND_TRIP');

-- AlterEnum
ALTER TYPE "AuditEntityType" ADD VALUE 'SEASON';

-- AlterTable
ALTER TABLE "Leg" ADD COLUMN     "priceOverridden" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "outboundLegId" TEXT,
ADD COLUMN     "returnLegId" TEXT,
ADD COLUMN     "seasonSnapshot" JSONB,
ADD COLUMN     "tripType" "TripType" NOT NULL DEFAULT 'ONE_WAY',
ALTER COLUMN "legId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "Season" (
    "id" TEXT NOT NULL,
    "type" "SeasonType" NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "note" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Season_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketCheckin" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "legId" TEXT NOT NULL,
    "checkedInAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "checkedInBy" TEXT,

    CONSTRAINT "TicketCheckin_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Season_startDate_endDate_idx" ON "Season"("startDate", "endDate");

-- CreateIndex
CREATE INDEX "TicketCheckin_legId_idx" ON "TicketCheckin"("legId");

-- CreateIndex
CREATE UNIQUE INDEX "TicketCheckin_ticketId_legId_key" ON "TicketCheckin"("ticketId", "legId");

-- CreateIndex
CREATE INDEX "Booking_outboundLegId_idx" ON "Booking"("outboundLegId");

-- CreateIndex
CREATE INDEX "Booking_returnLegId_idx" ON "Booking"("returnLegId");

-- CreateIndex
CREATE INDEX "Booking_tripType_idx" ON "Booking"("tripType");

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_outboundLegId_fkey" FOREIGN KEY ("outboundLegId") REFERENCES "Leg"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_returnLegId_fkey" FOREIGN KEY ("returnLegId") REFERENCES "Leg"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketCheckin" ADD CONSTRAINT "TicketCheckin_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketCheckin" ADD CONSTRAINT "TicketCheckin_legId_fkey" FOREIGN KEY ("legId") REFERENCES "Leg"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Row level security (not modelled by Prisma)
-- Season is a public calendar: anyone may read it, nobody but the DB role
-- (Prisma connects as postgres, which bypasses RLS) may write it.
ALTER TABLE "Season" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "season_public_read" ON "Season";

-- anon / authenticated are Supabase roles. On a plain Postgres (CI, local) they
-- do not exist, so the policy then applies to PUBLIC instead of failing.
DO $$
DECLARE
  roles text;
BEGIN
  SELECT string_agg(quote_ident(rolname), ', ') INTO roles
  FROM pg_roles
  WHERE rolname IN ('anon', 'authenticated');

  EXECUTE format(
    'CREATE POLICY "season_public_read" ON "Season" FOR SELECT TO %s USING ("isActive" = true AND "deletedAt" IS NULL)',
    COALESCE(roles, 'public')
  );
END
$$;
