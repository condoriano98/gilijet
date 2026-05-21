import { Prisma } from "@prisma/client";
import { env } from "./env";

/**
 * Pricing & commission calculations.
 * All values are in IDR. We use Prisma.Decimal end-to-end to avoid
 * floating-point drift on currency.
 */

export type PriceBreakdown = {
  unitPrice: Prisma.Decimal;
  quantity: number;
  totalAmount: Prisma.Decimal;
  commissionRate: Prisma.Decimal;
  commissionAmount: Prisma.Decimal;
  operatorAmount: Prisma.Decimal;
};

export function computeBookingPrice(args: {
  unitPrice: Prisma.Decimal | string | number;
  quantity: number;
  commissionRate?: Prisma.Decimal | number;
}): PriceBreakdown {
  const unitPrice = new Prisma.Decimal(args.unitPrice);
  const commissionRate = new Prisma.Decimal(
    args.commissionRate ?? env.PLATFORM_COMMISSION_RATE,
  );
  if (args.quantity < 1) throw new Error("quantity must be >= 1");

  const totalAmount = unitPrice.mul(args.quantity);
  const commissionAmount = totalAmount.mul(commissionRate).toDecimalPlaces(0);
  const operatorAmount = totalAmount.sub(commissionAmount);

  return {
    unitPrice,
    quantity: args.quantity,
    totalAmount,
    commissionRate,
    commissionAmount,
    operatorAmount,
  };
}

export type PricingTier = {
  minOccupancyPct: number; // 0–100
  multiplier: number;      // e.g. 1.2 = +20%
};

export function parsePricingTiers(raw: unknown): PricingTier[] | null {
  if (!Array.isArray(raw)) return null;
  const tiers: PricingTier[] = [];
  for (const item of raw) {
    if (
      typeof item === "object" &&
      item !== null &&
      typeof (item as Record<string, unknown>).minOccupancyPct === "number" &&
      typeof (item as Record<string, unknown>).multiplier === "number"
    ) {
      tiers.push(item as PricingTier);
    }
  }
  return tiers.length > 0 ? tiers : null;
}

export type PassengerType = "ADULT" | "CHILD" | "INFANT";

export const TRAVELER_MULTIPLIERS: Record<PassengerType, number> = {
  ADULT: 1.0,
  CHILD: 0.5,
  INFANT: 0.0,
};

export type PriceBreakdownWithTypes = PriceBreakdown & {
  adultCount: number;
  childCount: number;
  infantCount: number;
  seatCount: number; // seats actually consumed (infants don't take seats)
};

/**
 * Per-passenger pricing using traveler-type multipliers.
 * Adult = full, Child = 50%, Infant = free (and no seat consumed).
 * Discount (e.g. promo) is subtracted before commission split.
 */
export function computeBookingPriceWithTypes(args: {
  unitPrice: Prisma.Decimal | string | number;
  passengerTypes: PassengerType[];
  commissionRate?: Prisma.Decimal | number;
  discountAmount?: Prisma.Decimal | string | number;
}): PriceBreakdownWithTypes {
  const unitPrice = new Prisma.Decimal(args.unitPrice);
  const commissionRate = new Prisma.Decimal(
    args.commissionRate ?? env.PLATFORM_COMMISSION_RATE,
  );
  if (args.passengerTypes.length < 1) {
    throw new Error("at least one passenger required");
  }

  let adultCount = 0;
  let childCount = 0;
  let infantCount = 0;
  let total = new Prisma.Decimal(0);

  for (const type of args.passengerTypes) {
    if (type === "ADULT") adultCount++;
    else if (type === "CHILD") childCount++;
    else infantCount++;
    total = total.add(unitPrice.mul(TRAVELER_MULTIPLIERS[type]));
  }

  const discount = new Prisma.Decimal(args.discountAmount ?? 0);
  const totalAfterDiscount = Prisma.Decimal.max(total.sub(discount), new Prisma.Decimal(0));
  const commissionAmount = totalAfterDiscount.mul(commissionRate).toDecimalPlaces(0);
  const operatorAmount = totalAfterDiscount.sub(commissionAmount);
  const seatCount = adultCount + childCount;

  return {
    unitPrice,
    quantity: args.passengerTypes.length,
    totalAmount: totalAfterDiscount,
    commissionRate,
    commissionAmount,
    operatorAmount,
    adultCount,
    childCount,
    infantCount,
    seatCount,
  };
}

/**
 * Applies yield-management multiplier based on how full the leg is.
 * Returns base price if no tiers configured or no thresholds exceeded.
 */
export function computeYieldAdjustedPrice(args: {
  basePrice: Prisma.Decimal | string | number;
  totalCapacity: number;
  availableSeats: number;
  tiers?: PricingTier[] | null;
}): Prisma.Decimal {
  const base = new Prisma.Decimal(args.basePrice);
  if (!args.tiers || args.tiers.length === 0 || args.totalCapacity <= 0) {
    return base;
  }
  const occupiedPct =
    ((args.totalCapacity - args.availableSeats) / args.totalCapacity) * 100;

  // Find the highest threshold that has been exceeded.
  const applicable = args.tiers
    .filter((t) => occupiedPct >= t.minOccupancyPct)
    .sort((a, b) => b.minOccupancyPct - a.minOccupancyPct);

  if (applicable.length === 0) return base;
  return base.mul(applicable[0].multiplier).toDecimalPlaces(0);
}
