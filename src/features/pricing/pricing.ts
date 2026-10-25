import { Prisma } from '@prisma/client';
import { env } from '@/shared/server/env';

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
  return typeof fromEnv === 'number' && Number.isFinite(fromEnv)
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
  if (args.quantity < 1) throw new Error('quantity must be >= 1');

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

export type PassengerType = 'ADULT' | 'CHILD' | 'INFANT';

export const TRAVELER_MULTIPLIERS: Record<PassengerType, number> = {
  ADULT: 1.0,
  CHILD: 0.5,
  INFANT: 0.0,
};

/**
 * The fare one passenger pays on one leg: the leg's absolute fare for their
 * category when it has one (the schedule's fare matrix), else the adult price
 * times the category multiplier.
 */
export function passengerFare(args: {
  unitPrice: Prisma.Decimal | string | number;
  type: PassengerType;
  multipliers?: Partial<Record<PassengerType, number>>;
  categoryUnitPrices?: Partial<Record<PassengerType, Prisma.Decimal | string | number>>;
}): Prisma.Decimal {
  const override = args.categoryUnitPrices?.[args.type];
  if (override != null) return new Prisma.Decimal(override);
  return new Prisma.Decimal(args.unitPrice).mul(
    args.multipliers?.[args.type] ?? TRAVELER_MULTIPLIERS[args.type],
  );
}

/**
 * The listed fares of the passengers who need a seat (adults and children) on
 * one leg, one entry per passenger. Infants ride on a lap and are left out:
 * coupons work on seat fares only.
 */
export function seatFaresForLeg(args: {
  unitPrice: Prisma.Decimal | string | number;
  passengerTypes: PassengerType[];
  multipliers?: Partial<Record<PassengerType, number>>;
  categoryUnitPrices?: Partial<Record<PassengerType, Prisma.Decimal | string | number>>;
}): number[] {
  return args.passengerTypes
    .filter((type) => type !== 'INFANT')
    .map((type) => passengerFare({ ...args, type }).toNumber());
}

/**
 * What a "Nett" coupon takes off: the nett price replaces the listed fare of
 * every passenger who needs a seat, on every leg, so the discount is the gap
 * between each of those fares and the nett price. A seat already cheaper than
 * the nett price is left alone.
 */
export function netDiscountForSeats(args: { netPrice: number; seatFares: number[] }): number {
  return args.seatFares
    .reduce(
      (sum, fare) => sum.add(Prisma.Decimal.max(new Prisma.Decimal(fare).sub(args.netPrice), 0)),
      new Prisma.Decimal(0),
    )
    .toDecimalPlaces(0)
    .toNumber();
}

export type PriceBreakdownWithTypes = PriceBreakdown & {
  adultCount: number;
  childCount: number;
  infantCount: number;
  seatCount: number; // seats actually consumed (infants don't take seats)
  fareAmount: Prisma.Decimal; // customer fare before the platform service fee
  serviceFeeAmount: Prisma.Decimal; // platform service fee (kept by the platform)
};

/** Who absorbs a coupon's discount in the platform/operator split. */
export type CostBearer = 'PLATFORM' | 'OPERATOR' | 'SHARED';

/** Optional platform service fee added on top of the fare (platform keeps it). */
export type ServiceFee = { type: 'PERCENT' | 'FLAT'; value: number } | null;

/**
 * Per-passenger pricing using traveler-type multipliers.
 * Adult = full, Child = 50%, Infant = free by default (configurable), no seat.
 *
 * customerFare = max(gross − discount, 0); the customer is charged
 * `customerFare + serviceFee` (`totalAmount`). `costBearer` decides how the
 * fare portion splits into platform commission vs operator payout — i.e. who
 * eats the discount. The service fee is always kept by the platform. The
 * invariant `commissionAmount + operatorAmount === totalAmount` holds exactly.
 *
 *   SHARED   — commission on the discounted fare; both share the discount.
 *   PLATFORM — operator paid as if no discount (gross×(1−rate)); platform
 *              absorbs the discount (its commission can go negative — a
 *              deliberate, budget-capped subsidy).
 *   OPERATOR — platform commission on the gross fare (unaffected); operator
 *              absorbs the discount, but its payout is floored at 0 so it can
 *              never owe money on a serviced booking.
 */
export function computeBookingPriceWithTypes(args: {
  unitPrice: Prisma.Decimal | string | number;
  passengerTypes: PassengerType[];
  commissionRate?: Prisma.Decimal | number;
  discountAmount?: Prisma.Decimal | string | number;
  costBearer?: CostBearer;
  multipliers?: Partial<Record<PassengerType, number>>;
  /**
   * Absolute per-passenger fare for a type (e.g. from a Schedule's
   * fareMatrix), taking precedence over `multipliers` for that type. Used
   * directly rather than folded into a multiplier so operator price-sheet
   * numbers survive Decimal math exactly, with no division-then-multiply
   * rounding drift.
   */
  categoryUnitPrices?: Partial<Record<PassengerType, Prisma.Decimal | string | number>>;
  serviceFee?: ServiceFee;
}): PriceBreakdownWithTypes {
  const unitPrice = new Prisma.Decimal(args.unitPrice);
  const commissionRate = new Prisma.Decimal(resolveCommissionRate(args.commissionRate));
  if (args.passengerTypes.length < 1) {
    throw new Error('at least one passenger required');
  }

  const fareFor = (type: PassengerType) => passengerFare({ ...args, unitPrice, type });

  let adultCount = 0;
  let childCount = 0;
  let infantCount = 0;
  let gross = new Prisma.Decimal(0);

  for (const type of args.passengerTypes) {
    if (type === 'ADULT') adultCount++;
    else if (type === 'CHILD') childCount++;
    else infantCount++;
    gross = gross.add(fareFor(type));
  }

  const zero = new Prisma.Decimal(0);
  const discount = new Prisma.Decimal(args.discountAmount ?? 0);
  const fareAmount = Prisma.Decimal.max(gross.sub(discount), zero);
  const bearer: CostBearer = args.costBearer ?? 'SHARED';

  let commissionOnFare: Prisma.Decimal;
  let operatorAmount: Prisma.Decimal;
  if (bearer === 'PLATFORM') {
    // Operator paid as if full fare; platform eats the discount.
    operatorAmount = gross.sub(gross.mul(commissionRate)).toDecimalPlaces(0);
    commissionOnFare = fareAmount.sub(operatorAmount);
  } else if (bearer === 'OPERATOR') {
    // Platform commission on gross; operator eats the discount.
    commissionOnFare = gross.mul(commissionRate).toDecimalPlaces(0);
    operatorAmount = fareAmount.sub(commissionOnFare);
  } else {
    // SHARED: commission on the discounted fare (legacy).
    commissionOnFare = fareAmount.mul(commissionRate).toDecimalPlaces(0);
    operatorAmount = fareAmount.sub(commissionOnFare);
  }

  // Never let the operator's payout go negative on a serviced booking. The
  // shortfall shifts onto the platform's cut, preserving the split invariant.
  if (operatorAmount.lessThan(zero)) {
    operatorAmount = zero;
    commissionOnFare = fareAmount;
  }

  // Platform service fee (kept by the platform), added on top of the fare.
  let serviceFeeAmount = zero;
  if (args.serviceFee && args.serviceFee.value > 0) {
    serviceFeeAmount =
      args.serviceFee.type === 'PERCENT'
        ? fareAmount.mul(args.serviceFee.value).div(100).toDecimalPlaces(0)
        : new Prisma.Decimal(args.serviceFee.value).toDecimalPlaces(0);
  }

  const totalAmount = fareAmount.add(serviceFeeAmount);
  const commissionAmount = commissionOnFare.add(serviceFeeAmount);
  const seatCount = adultCount + childCount;

  return {
    unitPrice,
    quantity: args.passengerTypes.length,
    totalAmount,
    fareAmount,
    serviceFeeAmount,
    commissionRate,
    commissionAmount,
    operatorAmount,
    adultCount,
    childCount,
    infantCount,
    seatCount,
  };
}
