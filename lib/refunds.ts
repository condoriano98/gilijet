import { Prisma } from "@prisma/client";

/**
 * Refund policy (see REQUIREMENTS.md §6.4).
 *
 *  7+ days before departure       → 100% refund
 *  4-6 days before departure      → 50% refund
 *  0-3 days before departure      → 0%   (no refund)
 *  Operator cancels (any window)  → 100% refund
 */

export type CustomerRefundTier = "FULL" | "PARTIAL" | "NONE";

export function refundTierForCustomer(
  now: Date,
  departure: Date,
): CustomerRefundTier {
  const ms = departure.getTime() - now.getTime();
  const days = ms / (1000 * 60 * 60 * 24);
  if (days >= 7) return "FULL";
  if (days > 3) return "PARTIAL";
  return "NONE";
}

export function refundAmountForCustomer(args: {
  now: Date;
  departure: Date;
  paidAmount: Prisma.Decimal | string | number;
}): { tier: CustomerRefundTier; amount: Prisma.Decimal } {
  const paid = new Prisma.Decimal(args.paidAmount);
  const tier = refundTierForCustomer(args.now, args.departure);
  switch (tier) {
    case "FULL":
      return { tier, amount: paid };
    case "PARTIAL":
      return { tier, amount: paid.mul("0.5").toDecimalPlaces(0) };
    case "NONE":
      return { tier, amount: new Prisma.Decimal(0) };
  }
}

/**
 * The refund deadline is the latest moment at which a customer can still
 * receive any money back (i.e. the start of the 0-3 day window). We store
 * this on the Booking so we can disable the cancel button precisely.
 */
export function computeRefundDeadline(departure: Date): Date {
  return new Date(departure.getTime() - 3 * 24 * 60 * 60 * 1000);
}

/** Operator-triggered cancellation is always a full refund. */
export function refundAmountForOperatorCancellation(
  paidAmount: Prisma.Decimal | string | number,
): Prisma.Decimal {
  return new Prisma.Decimal(paidAmount);
}
