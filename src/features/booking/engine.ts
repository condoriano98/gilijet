import { Prisma } from '@prisma/client';
import { prisma } from '@/shared/server/db';
import { env } from '@/shared/server/env';
import { audit } from '@/shared/server/audit';
import {
  computeBookingPriceWithTypes,
  type PassengerType,
  type CostBearer,
} from '@/features/pricing/pricing';
import { computeRefundDeadline, snapshotCurrentPolicy } from '@/features/refunds/refunds';
import { resolvePlatformPricing } from '@/shared/server/platform-config';
import { parseFareMatrix, categoryFaresFor } from '@/features/pricing/fares';
import { newBookingReference } from '@/features/booking/references';
import { alertAdminNewBooking } from '@/features/messaging/admin-alerts';
import { validatePromoCode, applyPromoCode } from '@/features/pricing/promotions';
import { isDokuMock } from '@/features/payments/doku';

export class BookingError extends Error {
  constructor(
    public code:
      | 'LEG_NOT_FOUND'
      | 'LEG_CLOSED'
      | 'LEG_PAST'
      | 'INVALID_INPUT'
      | 'PROMO_INVALID',
    message: string,
  ) {
    super(message);
    this.name = 'BookingError';
  }
}

export type BookingCustomer = {
  name: string;
  email: string;
  phone: string;
  nationality?: string | null;
};

export type BookingPassenger = {
  name: string;
  idNumber?: string | null;
  type?: PassengerType;
};

export type CreateBookingArgs = {
  // ONE_WAY: legId only
  // ROUND_TRIP: outboundLegId + returnLegId (legId ignored)
  legId?: string;
  outboundLegId?: string;
  returnLegId?: string;
  customer: BookingCustomer;
  passengers: BookingPassenger[];
  idempotencyKey?: string | null;
  notes?: string | null;
  customerId?: string | null;
  promoCode?: string | null;
  salesChannel?: 'GILIFAST' | 'WALK_IN' | 'TRAVEL_AGENT' | 'PHONE' | 'EXTERNAL_AGGREGATOR';
  salesStaffId?: string | null;
  salesAgentId?: string | null;
};

/**
 * Booking creation: mints a Booking + Payment row (status=PENDING_PAYMENT).
 * There is no capacity check — a departure is bookable by anyone as long as
 * its Leg exists and is OPEN; the operator confirms real availability by
 * phone before tickets are issued (see lib/ticket-issuer.ts).
 *
 * Does NOT issue tickets — those land when DOKU confirms payment via the
 * notification (or the mock-pay endpoint in dev). Returns the booking row so
 * the caller can redirect to the pay page afterwards.
 */
export async function reserveSeatsAndCreateBooking(
  args: CreateBookingArgs,
): Promise<{ bookingId: string; bookingReference: string }> {
  if (args.passengers.length < 1 || args.passengers.length > 10) {
    throw new BookingError('INVALID_INPUT', '1-10 passengers per booking');
  }

  // Determine trip type
  const isRoundTrip = !!(args.outboundLegId && args.returnLegId);
  const isOneWay = !!args.legId && !isRoundTrip;

  if (!isRoundTrip && !isOneWay) {
    throw new BookingError(
      'INVALID_INPUT',
      'Provide legId (one-way) or outboundLegId + returnLegId (round-trip)',
    );
  }

  // Idempotency replay: if a key has already been used, return that booking.
  if (args.idempotencyKey) {
    const prior = await prisma.booking.findUnique({
      where: { idempotencyKey: args.idempotencyKey },
    });
    if (prior) {
      return {
        bookingId: prior.id,
        bookingReference: prior.bookingReference,
      };
    }
  }

  // Default passengers without explicit type to ADULT.
  const passengerTypes: PassengerType[] = args.passengers.map(
    (p) => p.type ?? 'ADULT',
  );
  const seatCount = passengerTypes.filter((t) => t !== 'INFANT').length;
  if (seatCount < 1) {
    throw new BookingError(
      'INVALID_INPUT',
      'At least one non-infant passenger required',
    );
  }

  const reserved = await prisma.$transaction(async (tx) => {
    // For round trip, validate & fetch both legs
    if (isRoundTrip) {
      return await createRoundTripBooking(tx, args, passengerTypes);
    } else {
      return await createOneWayBooking(tx, args, passengerTypes);
    }
  });

  // Fired after the commit, never inside it: a rolled-back reservation must
  // not ping anyone, and an unreachable WATI must not fail the booking. The
  // alert swallows its own errors, so this is deliberately not awaited.
  void alertAdminNewBooking(reserved.bookingId);

  return reserved;
}

async function createOneWayBooking(
  tx: Prisma.TransactionClient,
  args: CreateBookingArgs,
  passengerTypes: PassengerType[],
) {
  const leg = await tx.leg.findUnique({
    where: { id: args.legId! },
    include: {
      schedule: { include: { boat: { select: { operatorId: true } } } },
    },
  });
  if (!leg) throw new BookingError('LEG_NOT_FOUND', 'Departure not found');
  if (leg.operatorId !== leg.schedule.boat.operatorId) {
    throw new BookingError(
      'INVALID_INPUT',
      'Operator boundary mismatch on leg',
    );
  }
  if (leg.status !== 'OPEN') {
    throw new BookingError('LEG_CLOSED', 'Departure is closed for booking');
  }
  if (leg.departureDate.getTime() <= Date.now()) {
    throw new BookingError('LEG_PAST', 'Departure has already left');
  }

  const pricing = await resolvePlatformPricing(leg.operatorId, tx);
  const fareMatrix = parseFareMatrix(leg.schedule.fareMatrix);
  const categoryUnitPrices = fareMatrix
    ? { CHILD: categoryFaresFor(fareMatrix).child, INFANT: categoryFaresFor(fareMatrix).infant }
    : undefined;

  const preDiscount = computeBookingPriceWithTypes({
    unitPrice: leg.basePrice,
    passengerTypes,
    multipliers: pricing.multipliers,
    categoryUnitPrices,
  });

  let promotionId: string | null = null;
  let discountAmount = 0;
  let costBearer: CostBearer = 'SHARED';
  if (args.promoCode && args.promoCode.trim()) {
    const routeCode = `${leg.schedule.originPort}-${leg.schedule.destinationPort}`;
    const validation = await validatePromoCode(args.promoCode, {
      totalAmount: Number(preDiscount.fareAmount),
      routeCode,
      operatorId: leg.operatorId,
      customerEmail: args.customer.email,
      customerId: args.customerId ?? null,
    });
    if (!validation.valid) {
      throw new BookingError('PROMO_INVALID', validation.error);
    }
    promotionId = validation.promotion.id;
    discountAmount = validation.discountAmount;
    costBearer = validation.promotion.costBearer;
  }

  const price = computeBookingPriceWithTypes({
    unitPrice: leg.basePrice,
    passengerTypes,
    discountAmount,
    commissionRate: pricing.commissionRate,
    costBearer,
    multipliers: pricing.multipliers,
    categoryUnitPrices,
    serviceFee: pricing.serviceFee,
  });

  return await createBookingRow(tx, args, leg.id, null, null, leg.operatorId, 'ONE_WAY', price, promotionId, discountAmount, passengerTypes);
}

async function createRoundTripBooking(
  tx: Prisma.TransactionClient,
  args: CreateBookingArgs,
  passengerTypes: PassengerType[],
) {
  // Fetch both legs
  const [outboundLeg, returnLeg] = await Promise.all([
    tx.leg.findUnique({
      where: { id: args.outboundLegId! },
      include: {
        schedule: { include: { boat: { select: { operatorId: true } } } },
      },
    }),
    tx.leg.findUnique({
      where: { id: args.returnLegId! },
      include: {
        schedule: { include: { boat: { select: { operatorId: true } } } },
      },
    }),
  ]);

  if (!outboundLeg) throw new BookingError('LEG_NOT_FOUND', 'Outbound departure not found');
  if (!returnLeg) throw new BookingError('LEG_NOT_FOUND', 'Return departure not found');

  // Validate operator consistency
  if (outboundLeg.operatorId !== outboundLeg.schedule.boat.operatorId) {
    throw new BookingError('INVALID_INPUT', 'Operator boundary mismatch on outbound leg');
  }
  if (returnLeg.operatorId !== returnLeg.schedule.boat.operatorId) {
    throw new BookingError('INVALID_INPUT', 'Operator boundary mismatch on return leg');
  }

  // Both legs must be from same operator
  if (outboundLeg.operatorId !== returnLeg.operatorId) {
    throw new BookingError(
      'INVALID_INPUT',
      'Outbound and return flights must be from the same operator',
    );
  }

  // Both legs must be OPEN
  if (outboundLeg.status !== 'OPEN') {
    throw new BookingError('LEG_CLOSED', 'Outbound departure is closed for booking');
  }
  if (returnLeg.status !== 'OPEN') {
    throw new BookingError('LEG_CLOSED', 'Return departure is closed for booking');
  }

  // Neither leg can be in the past
  if (outboundLeg.departureDate.getTime() <= Date.now()) {
    throw new BookingError('LEG_PAST', 'Outbound departure has already left');
  }
  if (returnLeg.departureDate.getTime() <= Date.now()) {
    throw new BookingError('LEG_PAST', 'Return departure has already left');
  }

  // Return date must be after outbound date
  if (returnLeg.departureDate.getTime() <= outboundLeg.departureDate.getTime()) {
    throw new BookingError(
      'INVALID_INPUT',
      'Return departure must be after outbound departure',
    );
  }

  const pricing = await resolvePlatformPricing(outboundLeg.operatorId, tx);

  // Calculate pricing for both legs
  const outboundFareMatrix = parseFareMatrix(outboundLeg.schedule.fareMatrix);
  const outboundCategoryPrices = outboundFareMatrix
    ? { CHILD: categoryFaresFor(outboundFareMatrix).child, INFANT: categoryFaresFor(outboundFareMatrix).infant }
    : undefined;

  const returnFareMatrix = parseFareMatrix(returnLeg.schedule.fareMatrix);
  const returnCategoryPrices = returnFareMatrix
    ? { CHILD: categoryFaresFor(returnFareMatrix).child, INFANT: categoryFaresFor(returnFareMatrix).infant }
    : undefined;

  // Pre-discount pricing for both legs (for promo validation)
  const outboundPreDiscount = computeBookingPriceWithTypes({
    unitPrice: outboundLeg.basePrice,
    passengerTypes,
    multipliers: pricing.multipliers,
    categoryUnitPrices: outboundCategoryPrices,
  });

  const returnPreDiscount = computeBookingPriceWithTypes({
    unitPrice: returnLeg.basePrice,
    passengerTypes,
    multipliers: pricing.multipliers,
    categoryUnitPrices: returnCategoryPrices,
  });

  const combinedPreDiscount = {
    fareAmount: Number(outboundPreDiscount.fareAmount) + Number(returnPreDiscount.fareAmount),
  };

  let promotionId: string | null = null;
  let discountAmount = 0;
  let costBearer: CostBearer = 'SHARED';
  if (args.promoCode && args.promoCode.trim()) {
    // Use outbound route for promo validation (round trip is single route both ways)
    const routeCode = `${outboundLeg.schedule.originPort}-${outboundLeg.schedule.destinationPort}`;
    const validation = await validatePromoCode(args.promoCode, {
      totalAmount: Number(combinedPreDiscount.fareAmount),
      routeCode,
      operatorId: outboundLeg.operatorId,
      customerEmail: args.customer.email,
      customerId: args.customerId ?? null,
    });
    if (!validation.valid) {
      throw new BookingError('PROMO_INVALID', validation.error);
    }
    promotionId = validation.promotion.id;
    discountAmount = validation.discountAmount;
    costBearer = validation.promotion.costBearer;
  }

  // Calculate final pricing for both legs combined
  const outboundPrice = computeBookingPriceWithTypes({
    unitPrice: outboundLeg.basePrice,
    passengerTypes,
    discountAmount: discountAmount / 2, // Split discount
    commissionRate: pricing.commissionRate,
    costBearer,
    multipliers: pricing.multipliers,
    categoryUnitPrices: outboundCategoryPrices,
    serviceFee: pricing.serviceFee,
  });

  const returnPrice = computeBookingPriceWithTypes({
    unitPrice: returnLeg.basePrice,
    passengerTypes,
    discountAmount: discountAmount / 2, // Split discount
    commissionRate: pricing.commissionRate,
    costBearer,
    multipliers: pricing.multipliers,
    categoryUnitPrices: returnCategoryPrices,
    serviceFee: pricing.serviceFee,
  });

  // Combine prices
  const combinedPrice = {
    fareAmount: Number(outboundPrice.fareAmount) + Number(returnPrice.fareAmount),
    totalAmount: new Prisma.Decimal(Number(outboundPrice.totalAmount) + Number(returnPrice.totalAmount)),
    commissionAmount: new Prisma.Decimal(Number(outboundPrice.commissionAmount) + Number(returnPrice.commissionAmount)),
    operatorAmount: new Prisma.Decimal(Number(outboundPrice.operatorAmount) + Number(returnPrice.operatorAmount)),
    adultCount: outboundPrice.adultCount + returnPrice.adultCount,
    childCount: outboundPrice.childCount + returnPrice.childCount,
    infantCount: outboundPrice.infantCount + returnPrice.infantCount,
  };

  return await createBookingRow(
    tx,
    args,
    null,
    outboundLeg.id,
    returnLeg.id,
    outboundLeg.operatorId,
    'ROUND_TRIP',
    combinedPrice as any,
    promotionId,
    discountAmount,
    passengerTypes,
  );
}

async function createBookingRow(
  tx: Prisma.TransactionClient,
  args: CreateBookingArgs,
  legId: string | null,
  outboundLegId: string | null,
  returnLegId: string | null,
  operatorId: string,
  tripType: 'ONE_WAY' | 'ROUND_TRIP',
  price: any,
  promotionId: string | null,
  discountAmount: number,
  passengerTypes: PassengerType[],
) {
  const seatCount = passengerTypes.filter((t) => t !== 'INFANT').length;
  const refundDeadline = legId
    ? computeRefundDeadline((await tx.leg.findUnique({ where: { id: legId } }))!.departureDate)
    : computeRefundDeadline((await tx.leg.findUnique({ where: { id: outboundLegId! } }))!.departureDate);

  let bookingReference: string;
  let booking;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      bookingReference = newBookingReference();
      booking = await tx.booking.create({
        data: {
          bookingReference,
          legId,
          outboundLegId,
          returnLegId,
          tripType,
          operatorId,
          customerId: args.customerId ?? null,
          customerName: args.customer.name,
          customerEmail: args.customer.email.toLowerCase(),
          customerPhone: args.customer.phone,
          customerNationality: args.customer.nationality ?? null,
          totalAmount: price.totalAmount,
          commissionAmount: price.commissionAmount,
          operatorAmount: price.operatorAmount,
          promotionId,
          discountAmount: new Prisma.Decimal(discountAmount),
          status: 'PENDING_PAYMENT',
          salesChannel: args.salesChannel ?? 'GILIFAST',
          salesStaffId: args.salesStaffId ?? null,
          salesAgentId: args.salesAgentId ?? null,
          refundDeadline,
          refundPolicySnapshot: snapshotCurrentPolicy({
            departure: (await tx.leg.findUnique({ where: { id: legId || outboundLegId! } }))!.departureDate,
            deadline: refundDeadline,
          }),
          idempotencyKey: args.idempotencyKey ?? null,
          notes: args.notes ?? null,
          payment: {
            create: {
              amount: price.totalAmount,
              method: 'BANK_TRANSFER',
              status: 'PENDING',
            },
          },
        },
      });
      break;
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002' &&
        attempt < 4
      ) {
        continue;
      }
      throw err;
    }
  }
  if (!booking) {
    throw new BookingError('INVALID_INPUT', 'Failed to mint booking reference');
  }

  if (promotionId) {
    try {
      await applyPromoCode(promotionId, tx, {
        bookingId: booking.id,
        customerEmail: args.customer.email,
        customerId: args.customerId ?? null,
        amount: discountAmount,
      });
    } catch (err) {
      const code = err instanceof Error ? err.message : '';
      const message =
        code === 'PROMO_CUSTOMER_LIMIT'
          ? 'You have already used this promo code'
          : code === 'PROMO_BUDGET_EXHAUSTED'
            ? 'Promo code budget is exhausted'
            : 'This promo code is no longer available';
      throw new BookingError('PROMO_INVALID', message);
    }
  }

  await tx.booking.update({
    where: { id: booking.id },
    data: {
      notes: JSON.stringify({
        ...(args.notes ? { customerNotes: args.notes } : {}),
        passengers: args.passengers,
      }),
    },
  });

  await tx.auditLog.create({
    data: {
      entityType: 'BOOKING',
      entityId: booking.id,
      action: 'created',
      userRole: 'CUSTOMER',
      newState: {
        bookingReference: booking.bookingReference,
        legId,
        outboundLegId,
        returnLegId,
        tripType,
        quantity: args.passengers.length,
        seatCount,
        totalAmount: price.totalAmount.toString(),
        discountAmount: discountAmount.toString(),
        promotionId,
      },
    },
  });

  return {
    bookingId: booking.id,
    bookingReference: booking.bookingReference,
  };
}

/**
 * After reservation succeeds, direct the customer to the pay page. The DOKU
 * checkout is opened from there, so this just reports whether we're in mock
 * mode (no DOKU keys → the built-in /checkout demo flow). `invoiceUrl` is
 * always null now; callers redirect to `/pay/{reference}`.
 */
export async function startPaymentForBooking(
  bookingId: string,
): Promise<{ invoiceUrl: string | null; mock: boolean }> {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: { status: true },
  });
  if (!booking) throw new BookingError('LEG_NOT_FOUND', 'Booking not found');
  if (booking.status !== 'PENDING_PAYMENT') {
    return { invoiceUrl: null, mock: false };
  }
  return { invoiceUrl: null, mock: isDokuMock() };
}

/**
 * Records that a booking's hold on its departure is void (expired, cancelled,
 * or payment failed) — there is no capacity to release back to the leg, this
 * only exists for the audit trail callers rely on. Idempotent.
 */
export async function releaseBookingSeats(
  bookingId: string,
  reason:
    | 'expired'
    | 'cancelled_by_customer'
    | 'cancelled_by_operator'
    | 'payment_failed',
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const booking = await tx.booking.findUnique({
      where: { id: bookingId },
      include: { tickets: true },
    });
    if (!booking) return;

    // Count seats from tickets if issued (tickets only exist for non-infant
    // passengers), else from stored passengers list filtering out infants.
    let quantity = booking.tickets.length;
    if (quantity === 0 && booking.notes) {
      try {
        const parsed = JSON.parse(booking.notes) as {
          passengers?: Array<{ type?: string }>;
        };
        if (Array.isArray(parsed.passengers)) {
          quantity = parsed.passengers.filter(
            (p) => p.type !== 'INFANT',
          ).length;
        }
      } catch {
        // Notes might be free-text — ignore.
      }
    }
    if (quantity <= 0) return;

    await tx.auditLog.create({
      data: {
        entityType: 'BOOKING',
        entityId: booking.id,
        action: `seats_released_${reason}`,
        userRole: 'SYSTEM',
        newState: { quantity },
      },
    });
  });
}
