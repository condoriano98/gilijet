-- Marketing measurement: internal event ledger + outbox, booking attribution
-- snapshot, daily ad spend/reach and sync runs. Additive only: no existing
-- table or column changes. Rollback (before any data matters): drop these
-- six tables and six enums in a new migration; never edit this file.

-- CreateEnum
CREATE TYPE "MarketingEventSource" AS ENUM ('SERVER', 'BROWSER');

-- CreateEnum
CREATE TYPE "MarketingDestination" AS ENUM ('GA4', 'GOOGLE_ADS', 'META_CAPI');

-- CreateEnum
CREATE TYPE "MarketingDeliveryStatus" AS ENUM ('PENDING', 'PROCESSING', 'DELIVERED', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "AdPlatform" AS ENUM ('GOOGLE_ADS', 'META_ADS');

-- CreateEnum
CREATE TYPE "AdDataSource" AS ENUM ('API', 'CSV');

-- CreateEnum
CREATE TYPE "AdSyncStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'PARTIAL', 'FAILED');

-- CreateTable
CREATE TABLE "MarketingEvent" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventName" TEXT NOT NULL,
    "schemaVersion" INTEGER NOT NULL,
    "source" "MarketingEventSource" NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "environment" TEXT NOT NULL,
    "bookingId" TEXT,
    "refundId" TEXT,
    "dedupeKey" TEXT,
    "operatorId" TEXT,
    "routeCode" TEXT,
    "legId" TEXT,
    "departureDate" TIMESTAMP(3),
    "passengerCount" INTEGER,
    "currency" VARCHAR(3),
    "value" DECIMAL(12,2),
    "visitorId" TEXT,
    "consent" JSONB NOT NULL,
    "properties" JSONB,

    CONSTRAINT "MarketingEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketingEventDelivery" (
    "id" TEXT NOT NULL,
    "marketingEventId" TEXT NOT NULL,
    "destination" "MarketingDestination" NOT NULL,
    "status" "MarketingDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastAttemptAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "skipReason" TEXT,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketingEventDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingAttribution" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "lookbackDays" INTEGER NOT NULL,
    "consentAnalytics" BOOLEAN NOT NULL,
    "consentMarketing" BOOLEAN NOT NULL,
    "visitorId" TEXT,
    "channel" TEXT NOT NULL,
    "platform" TEXT,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "utmContent" TEXT,
    "utmTerm" TEXT,
    "campaignId" TEXT,
    "adGroupId" TEXT,
    "adId" TEXT,
    "lastTouchAt" TIMESTAMP(3),
    "firstTouchAt" TIMESTAMP(3),
    "firstTouch" JSONB,
    "lastTouch" JSONB,
    "landingPath" TEXT,
    "referrerHost" TEXT,
    "deviceClass" TEXT,
    "gclid" TEXT,
    "gbraid" TEXT,
    "wbraid" TEXT,
    "fbc" TEXT,
    "fbp" TEXT,
    "gaClientId" TEXT,
    "gaSessionId" TEXT,
    "clientIpAddress" TEXT,
    "clientUserAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookingAttribution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdSpendDaily" (
    "id" TEXT NOT NULL,
    "platform" "AdPlatform" NOT NULL,
    "accountId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "accountTimezone" TEXT NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "campaignId" TEXT NOT NULL,
    "campaignName" TEXT,
    "adGroupId" TEXT NOT NULL DEFAULT '',
    "adId" TEXT NOT NULL DEFAULT '',
    "spend" DECIMAL(14,2) NOT NULL,
    "impressions" INTEGER,
    "clicks" INTEGER,
    "platformPurchases" DECIMAL(12,2),
    "platformPurchaseValue" DECIMAL(14,2),
    "attributionSetting" TEXT,
    "reportDateBasis" TEXT,
    "source" "AdDataSource" NOT NULL,
    "syncRunId" TEXT,
    "syncedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdSpendDaily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdReachDaily" (
    "id" TEXT NOT NULL,
    "platform" "AdPlatform" NOT NULL,
    "accountId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "campaignId" TEXT NOT NULL,
    "reach" INTEGER,
    "frequency" DECIMAL(8,4),
    "source" "AdDataSource" NOT NULL,
    "syncRunId" TEXT,
    "syncedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdReachDaily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdSyncRun" (
    "id" TEXT NOT NULL,
    "platform" "AdPlatform" NOT NULL,
    "source" "AdDataSource" NOT NULL,
    "accountId" TEXT,
    "dateFrom" DATE NOT NULL,
    "dateTo" DATE NOT NULL,
    "status" "AdSyncStatus" NOT NULL DEFAULT 'RUNNING',
    "rowsWritten" INTEGER NOT NULL DEFAULT 0,
    "rowsRejected" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "unavailableFields" JSONB,
    "fileName" TEXT,
    "triggeredBy" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "AdSyncRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MarketingEvent_eventId_key" ON "MarketingEvent"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "MarketingEvent_dedupeKey_key" ON "MarketingEvent"("dedupeKey");

-- CreateIndex
CREATE INDEX "MarketingEvent_eventName_occurredAt_idx" ON "MarketingEvent"("eventName", "occurredAt");

-- CreateIndex
CREATE INDEX "MarketingEvent_bookingId_idx" ON "MarketingEvent"("bookingId");

-- CreateIndex
CREATE INDEX "MarketingEvent_occurredAt_idx" ON "MarketingEvent"("occurredAt");

-- CreateIndex
CREATE INDEX "MarketingEventDelivery_status_nextAttemptAt_idx" ON "MarketingEventDelivery"("status", "nextAttemptAt");

-- CreateIndex
CREATE UNIQUE INDEX "MarketingEventDelivery_marketingEventId_destination_key" ON "MarketingEventDelivery"("marketingEventId", "destination");

-- CreateIndex
CREATE UNIQUE INDEX "BookingAttribution_bookingId_key" ON "BookingAttribution"("bookingId");

-- CreateIndex
CREATE INDEX "BookingAttribution_channel_createdAt_idx" ON "BookingAttribution"("channel", "createdAt");

-- CreateIndex
CREATE INDEX "BookingAttribution_campaignId_idx" ON "BookingAttribution"("campaignId");

-- CreateIndex
CREATE INDEX "AdSpendDaily_date_idx" ON "AdSpendDaily"("date");

-- CreateIndex
CREATE INDEX "AdSpendDaily_platform_campaignId_idx" ON "AdSpendDaily"("platform", "campaignId");

-- CreateIndex
CREATE UNIQUE INDEX "AdSpendDaily_platform_accountId_date_campaignId_adGroupId_a_key" ON "AdSpendDaily"("platform", "accountId", "date", "campaignId", "adGroupId", "adId");

-- CreateIndex
CREATE UNIQUE INDEX "AdReachDaily_platform_accountId_date_campaignId_key" ON "AdReachDaily"("platform", "accountId", "date", "campaignId");

-- CreateIndex
CREATE INDEX "AdSyncRun_platform_startedAt_idx" ON "AdSyncRun"("platform", "startedAt");

-- AddForeignKey
ALTER TABLE "MarketingEventDelivery" ADD CONSTRAINT "MarketingEventDelivery_marketingEventId_fkey" FOREIGN KEY ("marketingEventId") REFERENCES "MarketingEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Row level security: these tables hold attribution identifiers and finance
-- data. The app reaches them only through Prisma's postgres role, which
-- bypasses RLS; enabling it with no policy denies Supabase's anon and
-- authenticated roles (the same convention as OperatorPicContact in 0_init).
ALTER TABLE "MarketingEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MarketingEventDelivery" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BookingAttribution" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AdSpendDaily" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AdReachDaily" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AdSyncRun" ENABLE ROW LEVEL SECURITY;
