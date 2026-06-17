import { Prisma } from "@prisma/client";

/**
 * Refund policy (see gilibali.com Terms & Conditions §5.1).
 *
 *  More than 7 days (168 hrs) before departure → 100% refund
 *  48 hours – 7 days before departure          → 50%  refund
 *  Less than 48 hours before departure         → 0%   (no refund)
 *  Operator cancels (any window)               → 100% refund
 */

export type CustomerRefundTier = "FULL" | "PARTIAL" | "NONE";

export type RefundPolicySnapshot = {
  version: string;
  snapshotAt: string;
  tiers: Array<{
    hoursBeforeDeparture: number;
    refundFraction: number;
  }>;
  deadline: string;
};

export function refundTierForCustomer(
  now: Date,
  departure: Date,
): CustomerRefundTier {
  const ms = departure.getTime() - now.getTime();
  const hours = ms / (1000 * 60 * 60);
  if (hours > 168) return "FULL"; // more than 7 days
  if (hours >= 48) return "PARTIAL"; // 48 hours to 7 days
  return "NONE"; // less than 48 hours
}

export function refundAmountForCustomer(args: {
  now: Date;
  departure: Date;
  paidAmount: Prisma.Decimal | string | number;
  snapshot?: RefundPolicySnapshot | null;
}): { tier: CustomerRefundTier; amount: Prisma.Decimal } {
  const paid = new Prisma.Decimal(args.paidAmount);
  const tier = refundTierForCustomer(args.now, args.departure);
  let fraction: number;
  switch (tier) {
    case "FULL":
      fraction = 1;
      break;
    case "PARTIAL":
      fraction = 0.5;
      break;
    case "NONE":
      fraction = 0;
      break;
  }

  if (args.snapshot?.tiers?.length) {
    const ms = args.departure.getTime() - args.now.getTime();
    const hours = ms / (1000 * 60 * 60);
    const sorted = [...args.snapshot.tiers].sort(
      (a, b) => b.hoursBeforeDeparture - a.hoursBeforeDeparture,
    );
    for (const t of sorted) {
      if (hours >= t.hoursBeforeDeparture) {
        fraction = t.refundFraction;
        break;
      }
    }
  }

  const amount = paid.mul(String(fraction)).toDecimalPlaces(0);
  return { tier, amount };
}

/**
 * The refund deadline is the latest moment at which a customer can still
 * receive any money back (i.e. the start of the no-refund window, 48 hours
 * before departure). We store this on the Booking so we can disable the
 * cancel button precisely.
 */
export function computeRefundDeadline(departure: Date): Date {
  return new Date(departure.getTime() - 48 * 60 * 60 * 1000);
}

/** Operator-triggered cancellation is always a full refund. */
export function refundAmountForOperatorCancellation(
  paidAmount: Prisma.Decimal | string | number,
): Prisma.Decimal {
  return new Prisma.Decimal(paidAmount);
}

/**
 * Capture the current refund policy as a snapshot at booking time so that
 * historical refunds always compute against the rules that were in effect
 * when the customer booked, not any future changes.
 */
export function snapshotCurrentPolicy(args: {
  departure: Date;
  deadline: Date;
}): RefundPolicySnapshot {
  return {
    version: "2026-01",
    snapshotAt: new Date().toISOString(),
    tiers: [
      { hoursBeforeDeparture: 168, refundFraction: 1.0 },
      { hoursBeforeDeparture: 48, refundFraction: 0.5 },
      { hoursBeforeDeparture: 0, refundFraction: 0.0 },
    ],
    deadline: args.deadline.toISOString(),
  };
}
