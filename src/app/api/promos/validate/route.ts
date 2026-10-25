import { NextResponse } from 'next/server';
import { prisma } from '@/shared/server/db';
import { resolvePlatformPricing } from '@/shared/server/platform-config';
import { validatePromoCode, type PromoContext } from '@/features/pricing/promotions';
import { legPricingInputs, loadActiveSeasons } from '@/features/pricing/seasons';
import { seatFaresForLeg, type PassengerType } from '@/features/pricing/pricing';

const PASSENGER_TYPES: readonly string[] = ['ADULT', 'CHILD', 'INFANT'];

/**
 * GET /api/promos/validate?code=…&amount=500000&types=ADULT,CHILD&legId=…&returnLegId=…&email=…&phone=…
 * Returns: { valid: true, discountAmount, description } | { valid: false, error, reason? }
 * Public — no auth. Doesn't mutate anything.
 *
 * `types` (the passenger mix) and the legs let a Nett coupon price the booking
 * and let the route and operator targeting run; `email` and `phone` let a
 * first-booking-only code recognise a buyer who has booked before. The preview
 * agrees with the booking engine, which stays the authority at booking time.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code') ?? '';
  const amount = Number(url.searchParams.get('amount') ?? '0');
  if (!code || !(amount > 0)) {
    return NextResponse.json(
      { valid: false, error: 'Missing code or amount' },
      { status: 400 },
    );
  }

  const passengerTypes = (url.searchParams.get('types') ?? '')
    .split(',')
    .filter((t): t is PassengerType => PASSENGER_TYPES.includes(t))
    .slice(0, 10);
  const legId = url.searchParams.get('legId');
  const returnLegId = url.searchParams.get('returnLegId');

  try {
    const context: PromoContext = {
      totalAmount: amount,
      customerEmail: url.searchParams.get('email')?.trim().slice(0, 254) || null,
      customerPhone: url.searchParams.get('phone')?.trim().slice(0, 40) || null,
    };
    const legIds = [legId, returnLegId].filter((id): id is string => !!id);
    if (legIds.length > 0) {
      const legs = await prisma.leg.findMany({
        where: { id: { in: legIds } },
        select: {
          id: true,
          operatorId: true,
          basePrice: true,
          departureDate: true,
          priceOverridden: true,
          schedule: { select: { originPort: true, destinationPort: true, fareMatrix: true } },
        },
      });
      const seasons = await loadActiveSeasons();
      const outbound = legs.find((l) => l.id === legId);
      if (outbound) {
        context.operatorId = outbound.operatorId;
        context.routeCode = `${outbound.schedule.originPort}-${outbound.schedule.destinationPort}`;
      }
      const multipliers = outbound
        ? (await resolvePlatformPricing(outbound.operatorId)).multipliers
        : undefined;
      context.seatFares = legIds
        .map((id) => legs.find((l) => l.id === id))
        .filter((l): l is (typeof legs)[number] => !!l)
        .flatMap((l) => {
          const { unitPrice, categoryUnitPrices } = legPricingInputs(l, seasons);
          return seatFaresForLeg({ unitPrice, passengerTypes, multipliers, categoryUnitPrices });
        });
    }

    const result = await validatePromoCode(code, context);
    if (!result.valid) {
      return NextResponse.json({ valid: false, error: result.error, reason: result.reason });
    }
    return NextResponse.json({
      valid: true,
      discountAmount: result.discountAmount,
      description: result.promotion.description,
    });
  } catch (err) {
    console.error('[api/promos/validate] failed:', err);
    return NextResponse.json(
      { valid: false, error: 'Could not validate code' },
      { status: 500 },
    );
  }
}

export const dynamic = 'force-dynamic';
