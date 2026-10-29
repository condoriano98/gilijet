-- Marketing measurement, stage 4: consent withdrawal on attribution
-- snapshots, reporting level/breakdown on daily spend (one grain per
-- account-day), import provenance on sync runs, and the optional
-- campaign-to-route mapping. Additive except the AdSpendDaily unique key,
-- which is widened to include level and breakdown value (the table is new in
-- 2_marketing_measurement and holds no production data yet).

-- CreateEnum
CREATE TYPE "AdReportLevel" AS ENUM ('CAMPAIGN', 'AD_GROUP', 'AD');

-- CreateEnum
CREATE TYPE "CampaignRouteMethod" AS ENUM ('DIRECT', 'ALLOCATED');

-- DropIndex
DROP INDEX "AdSpendDaily_platform_accountId_date_campaignId_adGroupId_a_key";

-- AlterTable
ALTER TABLE "BookingAttribution" ADD COLUMN     "consentWithdrawnAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "AdSpendDaily" ADD COLUMN     "breakdownDims" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "breakdownValue" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "level" "AdReportLevel" NOT NULL DEFAULT 'CAMPAIGN';

-- AlterTable
ALTER TABLE "AdSyncRun" ADD COLUMN     "contentHash" TEXT,
ADD COLUMN     "report" JSONB,
ADD COLUMN     "rowsReplaced" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "MarketingCampaignRouteMapping" (
    "id" TEXT NOT NULL,
    "platform" "AdPlatform" NOT NULL,
    "accountId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "routeCode" TEXT NOT NULL,
    "method" "CampaignRouteMethod" NOT NULL,
    "allocationWeight" DECIMAL(5,4) NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "provenance" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketingCampaignRouteMapping_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MarketingCampaignRouteMapping_platform_accountId_campaignId_idx" ON "MarketingCampaignRouteMapping"("platform", "accountId", "campaignId");

-- CreateIndex
CREATE INDEX "MarketingCampaignRouteMapping_routeCode_idx" ON "MarketingCampaignRouteMapping"("routeCode");

-- CreateIndex
CREATE UNIQUE INDEX "AdSpendDaily_platform_accountId_date_level_campaignId_adGro_key" ON "AdSpendDaily"("platform", "accountId", "date", "level", "campaignId", "adGroupId", "adId", "breakdownValue");


-- Same convention as 2_marketing_measurement: RLS on, no policies, so only
-- Prisma's postgres role reads or writes it.
ALTER TABLE "MarketingCampaignRouteMapping" ENABLE ROW LEVEL SECURITY;
