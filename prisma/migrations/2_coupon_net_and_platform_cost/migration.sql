-- AlterEnum
ALTER TYPE "DiscountType" ADD VALUE 'NET';

-- AlterTable
ALTER TABLE "Promotion" ALTER COLUMN "costBearer" SET DEFAULT 'PLATFORM';

-- Gilifast absorbs every coupon now. The owner console no longer offers a cost
-- bearer, so move the coupons created while it did onto the same footing.
-- Bookings already made are untouched (the bearer is not stored on them).
UPDATE "Promotion" SET "costBearer" = 'PLATFORM' WHERE "costBearer" <> 'PLATFORM';
