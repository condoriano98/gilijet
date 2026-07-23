import { Prisma } from "@prisma/client";
import { prisma } from "./db";

export type PromoValidation =
  | {
      valid: true;
      promotion: {
        id: string;
        code: string;
        discountType: "PERCENT" | "FLAT";
        discountValue: number;
        description: string | null;
        costBearer: "PLATFORM" | "OPERATOR" | "SHARED";
      };
      discountAmount: number;
    }
  | { valid: false; error: string };

/**
 * Context passed at booking time so the full rule-set can run. The public
 * preview endpoint passes only `totalAmount`, so targeting / per-customer /
 * first-booking checks there are best-effort. The authoritative, race-safe
 * enforcement of the per-customer limit, first-booking rule, usage cap and
 * budget cap happens in `applyPromoCode`, under the locked promotion row.
 */
export type PromoContext = {
  totalAmount: number;
  routeCode?: string | null;
  operatorId?: string | null;
  customerEmail?: string | null;
  customerId?: string | null;
};

/**
 * Checks a promo code against every rule and returns the computed discount.
 * Read-only — does not mutate usedCount / budget.
 */
export async function validatePromoCode(
  code: string,
  ctx: PromoContext | number,
): Promise<PromoValidation> {
  const context: PromoContext =
    typeof ctx === "number" ? { totalAmount: ctx } : ctx;
  const { totalAmount } = context;

  const normalized = code.trim().toUpperCase();
  if (!normalized) return { valid: false, error: "Enter a promo code" };

  const promo = await prisma.promotion.findUnique({
    where: { code: normalized },
  });
  if (!promo) return { valid: false, error: "Invalid promo code" };
  if (!promo.isActive || promo.archivedAt) {
    return { valid: false, error: "Promo code is inactive" };
  }

  const now = Date.now();
  if (promo.startsAt && promo.startsAt.getTime() > now) {
    return { valid: false, error: "Promo code is not active yet" };
  }
  if (promo.expiresAt && promo.expiresAt.getTime() < now) {
    return { valid: false, error: "Promo code has expired" };
  }
  if (promo.maxUses != null && promo.usedCount >= promo.maxUses) {
    return { valid: false, error: "Promo code is fully redeemed" };
  }

  const minAmount = Number(promo.minAmount);
  if (minAmount > 0 && totalAmount < minAmount) {
    return {
      valid: false,
      error: `Minimum spend IDR ${minAmount.toLocaleString("id-ID")} required`,
    };
  }

  // --- targeting ---
  if (
    promo.appliesToOperatorIds.length > 0 &&
    context.operatorId &&
    !promo.appliesToOperatorIds.includes(context.operatorId)
  ) {
    return { valid: false, error: "Promo code not valid for this operator" };
  }
  if (
    promo.appliesToRouteCodes.length > 0 &&
    context.routeCode &&
    !promo.appliesToRouteCodes.includes(context.routeCode)
  ) {
    return { valid: false, error: "Promo code not valid for this route" };
  }

  // --- per-customer limit ---
  if (promo.perCustomerLimit != null && context.customerEmail) {
    const used = await prisma.promotionRedemption.count({
      where: {
        promotionId: promo.id,
        customerEmail: context.customerEmail.toLowerCase(),
      },
    });
    if (used >= promo.perCustomerLimit) {
      return { valid: false, error: "You have already used this promo code" };
    }
  }

  // --- first-booking-only ---
  // "First booking" = no prior non-cancelled booking. Include PENDING_PAYMENT
  // so a repeat customer can't farm the coupon on many held-but-unpaid orders
  // within the hold window (those never reach CONFIRMED until paid). The
  // authoritative concurrency guard lives in applyPromoCode.
  if (promo.firstBookingOnly && (context.customerEmail || context.customerId)) {
    const priorOr = [
      context.customerId ? { customerId: context.customerId } : null,
      context.customerEmail
        ? { customerEmail: context.customerEmail.toLowerCase() }
        : null,
    ].filter(Boolean) as Prisma.BookingWhereInput[];
    const prior = await prisma.booking.findFirst({
      where: {
        status: { in: ["PENDING_PAYMENT", "CONFIRMED"] },
        OR: priorOr,
      },
      select: { id: true },
    });
    if (prior) {
      return { valid: false, error: "Promo code is for first bookings only" };
    }
  }

  // --- discount computation + cap ---
  const discountValue = Number(promo.discountValue);
  let discountAmount: number;
  if (promo.discountType === "PERCENT") {
    discountAmount = Math.round((totalAmount * discountValue) / 100);
    if (promo.maxDiscountAmount != null) {
      discountAmount = Math.min(discountAmount, Number(promo.maxDiscountAmount));
    }
  } else {
    discountAmount = Math.round(discountValue);
  }
  discountAmount = Math.min(discountAmount, totalAmount); // never negative

  // --- budget ---
  if (promo.budgetCap != null) {
    const remaining = Number(promo.budgetCap) - Number(promo.budgetSpent);
    if (discountAmount > remaining) {
      return { valid: false, error: "Promo code budget is exhausted" };
    }
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
 * Atomically records a redemption. Must run inside the booking transaction,
 * after the Booking row exists.
 *
 * The `updateMany` on the Promotion row takes a row-level lock held until the
 * transaction commits, so concurrent redemptions of the SAME code serialize on
 * it. Every budget-style guard (usedCount, budgetCap, per-customer limit,
 * first-booking) is therefore re-checked here, AFTER the lock — not just in the
 * pre-transaction `validatePromoCode` read — which closes the TOCTOU window
 * where two concurrent bookings both pass validation and both redeem.
 * Throws if the code became unusable; the caller rolls the booking back.
 */
export async function applyPromoCode(
  promotionId: string,
  tx: Prisma.TransactionClient,
  redemption: {
    bookingId: string;
    customerEmail: string;
    customerId?: string | null;
    amount: number;
  },
): Promise<void> {
  const email = redemption.customerEmail.toLowerCase();

  // Acquire the promotion row lock (serializes concurrent redeemers).
  const updated = await tx.promotion.updateMany({
    where: { id: promotionId, isActive: true, archivedAt: null },
    data: {
      usedCount: { increment: 1 },
      budgetSpent: { increment: new Prisma.Decimal(redemption.amount) },
    },
  });
  if (updated.count === 0) throw new Error("PROMO_INACTIVE");

  const after = await tx.promotion.findUnique({ where: { id: promotionId } });
  if (after?.maxUses != null && after.usedCount > after.maxUses) {
    throw new Error("PROMO_EXHAUSTED");
  }
  if (
    after?.budgetCap != null &&
    Number(after.budgetSpent) > Number(after.budgetCap)
  ) {
    throw new Error("PROMO_BUDGET_EXHAUSTED");
  }

  // Per-customer limit / first-booking, re-checked under the lock so committed
  // prior redemptions of this code by this customer are visible. firstBookingOnly
  // is treated as an implicit per-customer limit of 1 for this code.
  const effLimit =
    after?.perCustomerLimit ?? (after?.firstBookingOnly ? 1 : null);
  if (effLimit != null) {
    const priorRedemptions = await tx.promotionRedemption.count({
      where: { promotionId, customerEmail: email },
    });
    if (priorRedemptions >= effLimit) throw new Error("PROMO_CUSTOMER_LIMIT");
  }

  await tx.promotionRedemption.create({
    data: {
      promotionId,
      bookingId: redemption.bookingId,
      customerEmail: email,
      amount: new Prisma.Decimal(redemption.amount),
    },
  });
}
