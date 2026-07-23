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
 * preview endpoint passes only `totalAmount`; the targeting / per-customer /
 * first-booking / budget rules are enforced only when their inputs are given,
 * so the preview stays a best-effort estimate and the authoritative check runs
 * inside the booking transaction.
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
  if (promo.firstBookingOnly && (context.customerEmail || context.customerId)) {
    const priorOr = [
      context.customerId ? { customerId: context.customerId } : null,
      context.customerEmail
        ? { customerEmail: context.customerEmail.toLowerCase() }
        : null,
    ].filter(Boolean) as Prisma.BookingWhereInput[];
    const prior = await prisma.booking.findFirst({
      where: { status: "CONFIRMED", OR: priorOr },
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
 * Atomically records a redemption: increments usedCount + budgetSpent (guarded)
 * and writes a PromotionRedemption row. Must run inside the booking transaction,
 * after the Booking row exists. Throws if the code became unusable between
 * validation and apply (the seat/transaction then rolls back).
 */
export async function applyPromoCode(
  promotionId: string,
  tx: Prisma.TransactionClient,
  redemption: { bookingId: string; customerEmail: string; amount: number },
): Promise<void> {
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

  await tx.promotionRedemption.create({
    data: {
      promotionId,
      bookingId: redemption.bookingId,
      customerEmail: redemption.customerEmail.toLowerCase(),
      amount: new Prisma.Decimal(redemption.amount),
    },
  });
}
