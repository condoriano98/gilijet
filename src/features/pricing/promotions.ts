import { Prisma } from '@prisma/client';
import { prisma } from '@/shared/server/db';
import { netDiscountForSeats } from '@/features/pricing/pricing';
import { phoneKey } from '@/shared/lib/phone';

/** Shown when a "first booking only" code meets a buyer who has booked before. */
export const NOT_VALID_COUPON = 'Not valid coupon';

export type PromoValidation =
  | {
      valid: true;
      promotion: {
        id: string;
        code: string;
        discountType: 'PERCENT' | 'FLAT' | 'NET';
        discountValue: number;
        description: string | null;
        costBearer: 'PLATFORM' | 'OPERATOR' | 'SHARED';
      };
      discountAmount: number;
    }
  | { valid: false; error: string; reason?: 'FIRST_BOOKING_USED' };

/**
 * Context passed at booking time so the full rule-set can run. The public
 * preview endpoint passes what the booking page knows so far (the email and
 * phone may still be empty), so the first-booking check there is best-effort.
 * The authoritative, race-safe enforcement of the usage cap and the
 * first-booking rule happens in `applyPromoCode`, under the locked promotion row.
 */
export type PromoContext = {
  totalAmount: number;
  routeCode?: string | null;
  operatorId?: string | null;
  customerEmail?: string | null;
  customerPhone?: string | null;
  customerId?: string | null;
  /**
   * The listed fare of every passenger who needs a seat (adults and children)
   * on every leg: what Percent, Flat and Nett coupons work on. Infants ride on
   * a lap and are not in it. Without it, Percent and Flat fall back to
   * `totalAmount` and a Nett coupon cannot be priced.
   */
  seatFares?: number[];
};

/**
 * Checks a promo code against every rule and returns the computed discount.
 * Read-only — does not mutate usedCount.
 */
export async function validatePromoCode(
  code: string,
  ctx: PromoContext | number,
): Promise<PromoValidation> {
  const context: PromoContext =
    typeof ctx === 'number' ? { totalAmount: ctx } : ctx;
  const { totalAmount } = context;

  const normalized = code.trim().toUpperCase();
  if (!normalized) return { valid: false, error: 'Enter a promo code' };

  const promo = await prisma.promotion.findUnique({
    where: { code: normalized },
  });
  if (!promo) return { valid: false, error: 'Invalid promo code' };
  if (!promo.isActive || promo.archivedAt) {
    return { valid: false, error: 'Promo code is inactive' };
  }

  const now = Date.now();
  if (promo.startsAt && promo.startsAt.getTime() > now) {
    return { valid: false, error: 'Promo code is not active yet' };
  }
  if (promo.expiresAt && promo.expiresAt.getTime() < now) {
    return { valid: false, error: 'Promo code has expired' };
  }
  if (promo.maxUses != null && promo.usedCount >= promo.maxUses) {
    return { valid: false, error: 'Promo code is fully redeemed' };
  }

  const minAmount = Number(promo.minAmount);
  if (minAmount > 0 && totalAmount < minAmount) {
    return {
      valid: false,
      error: `Minimum spend IDR ${minAmount.toLocaleString('id-ID')} required`,
    };
  }

  // --- targeting ---
  if (
    promo.appliesToOperatorIds.length > 0 &&
    context.operatorId &&
    !promo.appliesToOperatorIds.includes(context.operatorId)
  ) {
    return { valid: false, error: 'Promo code not valid for this operator' };
  }
  if (
    promo.appliesToRouteCodes.length > 0 &&
    context.routeCode &&
    !promo.appliesToRouteCodes.includes(context.routeCode)
  ) {
    return { valid: false, error: 'Promo code not valid for this route' };
  }

  // --- first-booking-only ---
  // "First booking" = no prior non-cancelled booking under this buyer's email,
  // phone or account. PENDING_PAYMENT counts so a repeat buyer can't farm the
  // coupon on many held-but-unpaid orders within the hold window. The
  // authoritative concurrency guard lives in applyPromoCode.
  if (promo.firstBookingOnly && (await hasBookedBefore(context))) {
    return { valid: false, error: NOT_VALID_COUPON, reason: 'FIRST_BOOKING_USED' };
  }

  // --- discount computation + cap ---
  const discountValue = Number(promo.discountValue);
  // Every type works on the fares of the passengers who need a seat; an infant
  // on a lap is never discounted. Callers that cannot list the seats get the
  // whole fare as the base.
  const seatBase = context.seatFares
    ? context.seatFares.reduce((sum, fare) => sum + fare, 0)
    : totalAmount;
  let discountAmount: number;
  if (promo.discountType === 'PERCENT') {
    discountAmount = Math.round((seatBase * discountValue) / 100);
  } else if (promo.discountType === 'NET') {
    if (!context.seatFares?.length) {
      return { valid: false, error: 'Add the passengers to use this promo code' };
    }
    // The nett price replaces the listed fare of every seat on every leg.
    discountAmount = netDiscountForSeats({
      netPrice: discountValue,
      seatFares: context.seatFares,
    });
  } else {
    discountAmount = Math.round(discountValue);
  }
  if (promo.discountType !== 'FLAT' && promo.maxDiscountAmount != null) {
    discountAmount = Math.min(discountAmount, Number(promo.maxDiscountAmount));
  }
  discountAmount = Math.min(discountAmount, seatBase, totalAmount); // never more than the seat fares
  if (promo.discountType === 'NET' && discountAmount <= 0) {
    return { valid: false, error: 'Promo code gives no discount on this trip' };
  }

  return {
    valid: true,
    promotion: {
      id: promo.id,
      code: promo.code,
      discountType: promo.discountType,
      discountValue,
      description: promo.description,
      costBearer: promo.costBearer,
    },
    discountAmount,
  };
}

/**
 * True when this buyer already has a live booking, recognised by account,
 * email or phone. A cancelled or expired booking does not count.
 */
async function hasBookedBefore(ctx: PromoContext): Promise<boolean> {
  const email = ctx.customerEmail?.trim().toLowerCase();
  const phone = phoneKey(ctx.customerPhone);
  const live = ['PENDING_PAYMENT', 'AWAITING_CONFIRMATION', 'CONFIRMED'] as const;

  const byAccountOrEmail = [
    ctx.customerId ? { customerId: ctx.customerId } : null,
    email ? { customerEmail: email } : null,
  ].filter(Boolean) as Prisma.BookingWhereInput[];
  if (byAccountOrEmail.length > 0) {
    const prior = await prisma.booking.findFirst({
      where: { status: { in: [...live] }, OR: byAccountOrEmail },
      select: { id: true },
    });
    if (prior) return true;
  }

  // The stored phone keeps the customer's own spacing, so compare it reduced.
  if (phone) {
    const rows = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT "id" FROM "Booking"
      WHERE "status"::text IN (${Prisma.join([...live])})
        AND regexp_replace(regexp_replace("customerPhone", '[^0-9]', '', 'g'), '^620', '62') = ${phone}
      LIMIT 1`);
    if (rows.length > 0) return true;
  }
  return false;
}

/**
 * Atomically records a redemption. Must run inside the booking transaction,
 * after the Booking row exists.
 *
 * The `updateMany` on the Promotion row takes a row-level lock held until the
 * transaction commits, so concurrent redemptions of the SAME code serialize on
 * it. The usage cap and the first-booking rule are therefore re-checked here,
 * AFTER the lock — not just in the pre-transaction `validatePromoCode` read —
 * which closes the TOCTOU window where two concurrent bookings both pass
 * validation and both redeem. Throws if the code became unusable; the caller
 * rolls the booking back.
 */
export async function applyPromoCode(
  promotionId: string,
  tx: Prisma.TransactionClient,
  redemption: {
    bookingId: string;
    customerEmail: string;
    customerPhone?: string | null;
    customerId?: string | null;
    amount: number;
  },
): Promise<void> {
  const email = redemption.customerEmail.toLowerCase();
  const phone = phoneKey(redemption.customerPhone);

  // Acquire the promotion row lock (serializes concurrent redeemers).
  const updated = await tx.promotion.updateMany({
    where: { id: promotionId, isActive: true, archivedAt: null },
    data: { usedCount: { increment: 1 } },
  });
  if (updated.count === 0) throw new Error('PROMO_INACTIVE');

  const after = await tx.promotion.findUnique({ where: { id: promotionId } });
  if (after?.maxUses != null && after.usedCount > after.maxUses) {
    throw new Error('PROMO_EXHAUSTED');
  }

  // First-booking-only: one use per buyer, by email or by phone. Re-checked
  // under the lock so committed prior redemptions of this code are visible.
  if (after?.firstBookingOnly) {
    const sameBuyer: Prisma.PromotionRedemptionWhereInput[] = [{ customerEmail: email }];
    if (phone) sameBuyer.push({ customerPhone: phone });
    const prior = await tx.promotionRedemption.count({
      where: { promotionId, OR: sameBuyer },
    });
    if (prior > 0) throw new Error('PROMO_CUSTOMER_LIMIT');
  }

  await tx.promotionRedemption.create({
    data: {
      promotionId,
      bookingId: redemption.bookingId,
      customerEmail: email,
      customerPhone: phone || null,
      amount: new Prisma.Decimal(redemption.amount),
    },
  });
}

/**
 * Gives a booking's coupon back when the booking will not be used: held and
 * never paid (expired, payment failed) or cancelled. Deletes the redemption and
 * returns its use to the code, so the usage cap and the first-booking rule see
 * the booking as if it never happened. Runs in the caller's transaction; a second call finds nothing.
 * The booking keeps its `promotionId` and `discountAmount` as history.
 */
export async function releasePromoRedemption(
  tx: Prisma.TransactionClient,
  bookingId: string,
  reason: string,
): Promise<boolean> {
  const redemption = await tx.promotionRedemption.findUnique({
    where: { bookingId },
  });
  if (!redemption) return false;

  // deleteMany so a concurrent release (expiry sweep vs. cancel) is a no-op
  // instead of a failed transaction.
  const { count } = await tx.promotionRedemption.deleteMany({
    where: { id: redemption.id },
  });
  if (count === 0) return false;

  await tx.promotion.update({
    where: { id: redemption.promotionId },
    data: { usedCount: { decrement: 1 } },
  });
  await tx.auditLog.create({
    data: {
      entityType: 'PROMOTION',
      entityId: redemption.promotionId,
      action: 'redemption_released',
      userRole: 'SYSTEM',
      newState: { bookingId, reason, amount: redemption.amount.toString() },
    },
  });
  return true;
}
