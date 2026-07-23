import { Prisma } from "@prisma/client";
import { env } from "./env";

/**
 * Pricing & commission calculations.
 * All values are in IDR. We use Prisma.Decimal end-to-end to avoid
 * floating-point drift on currency.
 */

const DEFAULT_COMMISSION_RATE = 0.08;

/** Resolve the commission rate, never returning undefined (Decimal would throw). */
function resolveCommissionRate(
  override?: Prisma.Decimal | number,
): Prisma.Decimal | number {
  if (override != null) return override;
  const fromEnv = env.PLATFORM_COMMISSION_RATE;
  return typeof fromEnv === "number" && Number.isFinite(fromEnv)
    ? fromEnv
    : DEFAULT_COMMISSION_RATE;
}

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
  const commissionRate = new Prisma.Decimal(resolveCommissionRate(args.commissionRate));
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

/** Who absorbs a coupon's discount in the platform/operator split. */
export type CostBearer = "PLATFORM" | "OPERATOR" | "SHARED";

/**
 * Per-passenger pricing using traveler-type multipliers.
 * Adult = full, Child = 50%, Infant = free (and no seat consumed).
 *
 * The customer always pays `gross − discount` (`totalAmount`). What the
 * `costBearer` changes is how that amount splits into platform commission vs
 * operator payout — i.e. who eats the discount. In every branch the invariant
 * `commissionAmount + operatorAmount === totalAmount` holds exactly.
 *
 *   SHARED   — commission is charged on the discounted total, so platform and
 *              operator share the discount pro-rata (legacy behaviour).
 *   PLATFORM — operator is paid as if there were no discount (gross×(1−rate));
 *              the platform absorbs the discount out of its commission.
 *   OPERATOR — platform commission is charged on the gross (unaffected);
 *              the operator absorbs the discount out of its payout.
 */
export function computeBookingPriceWithTypes(args: {
  unitPrice: Prisma.Decimal | string | number;
  passengerTypes: PassengerType[];
  commissionRate?: Prisma.Decimal | number;
  discountAmount?: Prisma.Decimal | string | number;
  costBearer?: CostBearer;
}): PriceBreakdownWithTypes {
  const unitPrice = new Prisma.Decimal(args.unitPrice);
  const commissionRate = new Prisma.Decimal(resolveCommissionRate(args.commissionRate));
  if (args.passengerTypes.length < 1) {
    throw new Error("at least one passenger required");
  }

  let adultCount = 0;
  let childCount = 0;
  let infantCount = 0;
  let gross = new Prisma.Decimal(0);

  for (const type of args.passengerTypes) {
    if (type === "ADULT") adultCount++;
    else if (type === "CHILD") childCount++;
    else infantCount++;
    gross = gross.add(unitPrice.mul(TRAVELER_MULTIPLIERS[type]));
  }

  const discount = new Prisma.Decimal(args.discountAmount ?? 0);
  const customerPays = Prisma.Decimal.max(gross.sub(discount), new Prisma.Decimal(0));
  const bearer: CostBearer = args.costBearer ?? "SHARED";

  let commissionAmount: Prisma.Decimal;
  let operatorAmount: Prisma.Decimal;
  if (bearer === "PLATFORM") {
    // Operator paid as if full fare; platform eats the discount.
    operatorAmount = gross.sub(gross.mul(commissionRate)).toDecimalPlaces(0);
    commissionAmount = customerPays.sub(operatorAmount);
  } else if (bearer === "OPERATOR") {
    // Platform commission on gross (unaffected); operator eats the discount.
    commissionAmount = gross.mul(commissionRate).toDecimalPlaces(0);
    operatorAmount = customerPays.sub(commissionAmount);
  } else {
    // SHARED: commission on the discounted total (legacy).
    commissionAmount = customerPays.mul(commissionRate).toDecimalPlaces(0);
    operatorAmount = customerPays.sub(commissionAmount);
  }
  const seatCount = adultCount + childCount;

  return {
    unitPrice,
    quantity: args.passengerTypes.length,
    totalAmount: customerPays,
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
