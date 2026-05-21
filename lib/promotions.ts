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
      };
      discountAmount: number;
    }
  | { valid: false; error: string };

/**
 * Checks promo code against rules: active, not expired, usage budget left,
 * min amount met. Returns the computed discount amount in IDR.
 * Read-only — does not increment usedCount.
 */
export async function validatePromoCode(
  code: string,
  totalAmount: number,
): Promise<PromoValidation> {
  const normalized = code.trim().toUpperCase();
  if (!normalized) return { valid: false, error: "Enter a promo code" };

  const promo = await prisma.promotion.findUnique({
    where: { code: normalized },
  });
  if (!promo) return { valid: false, error: "Invalid promo code" };
  if (!promo.isActive) return { valid: false, error: "Promo code is inactive" };
  if (promo.expiresAt && promo.expiresAt.getTime() < Date.now()) {
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

  const discountValue = Number(promo.discountValue);
  let discountAmount: number;
  if (promo.discountType === "PERCENT") {
    discountAmount = Math.round((totalAmount * discountValue) / 100);
  } else {
    discountAmount = Math.round(discountValue);
  }
  // Cap discount at total amount (don't go negative)
  discountAmount = Math.min(discountAmount, totalAmount);

  return {
    valid: true,
    promotion: {
      id: promo.id,
      code: promo.code,
      discountType: promo.discountType,
      discountValue,
      description: promo.description,
    },
    discountAmount,
  };
}

/**
 * Atomically increments usedCount with guard. Throws if budget exhausted
 * between validation and apply. Must be called inside the booking transaction.
 */
export async function applyPromoCode(
  promotionId: string,
  tx: Prisma.TransactionClient,
): Promise<void> {
  const updated = await tx.promotion.updateMany({
    where: {
      id: promotionId,
      isActive: true,
      OR: [{ maxUses: null }, { usedCount: { lt: 2147483647 } }],
    },
    data: { usedCount: { increment: 1 } },
  });
  if (updated.count === 0) {
    throw new Error("PROMO_INACTIVE");
  }
  // Second guard: if maxUses defined and we exceeded, revert
  const after = await tx.promotion.findUnique({ where: { id: promotionId } });
  if (after?.maxUses != null && after.usedCount > after.maxUses) {
    await tx.promotion.update({
      where: { id: promotionId },
      data: { usedCount: { decrement: 1 } },
    });
    throw new Error("PROMO_EXHAUSTED");
  }
}
