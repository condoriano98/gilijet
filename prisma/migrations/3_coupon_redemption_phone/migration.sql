-- AlterTable
ALTER TABLE "PromotionRedemption" ADD COLUMN     "customerPhone" TEXT;

-- CreateIndex
CREATE INDEX "PromotionRedemption_customerPhone_idx" ON "PromotionRedemption"("customerPhone");

-- "First booking only" now recognises a buyer by phone as well as by email.
-- Fill the phone of the redemptions already recorded, reduced the way
-- phoneKey() does (digits only, "+620…" read as "+62…").
UPDATE "PromotionRedemption" r
SET "customerPhone" = regexp_replace(regexp_replace(b."customerPhone", '[^0-9]', '', 'g'), '^620', '62')
FROM "Booking" b
WHERE b."id" = r."bookingId";
