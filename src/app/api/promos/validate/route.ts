import { NextResponse } from 'next/server';
import { prisma } from '@/shared/server/db';
import { resolvePlatformPricing } from '@/shared/server/platform-config';
import { validatePromoCode, type PromoContext } from '@/features/pricing/promotions';
import type { PassengerType } from '@/features/pricing/pricing';

const PASSENGER_TYPES: readonly string[] = ['ADULT', 'CHILD', 'INFANT'];

/**
 * GET /api/promos/validate?code=GILIFAST15&amount=500000&types=ADULT,CHILD&legId=…&legs=2
 * Returns: { valid: true, discountAmount, description } | { valid: false, error }
 * Public — no auth. Doesn't mutate anything.
 *
 * `types` (the passenger mix) is what lets a Nett coupon price the booking;
 * `legId` lets the route and operator targeting run, so the preview agrees with
 * the booking engine. The engine stays the authority at booking time.
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

  try {
    const context: PromoContext = {
      totalAmount: amount,
      passengerTypes,
      legCount: url.searchParams.get('legs') === '2' ? 2 : 1,
    };
    if (legId) {
      const leg = await prisma.leg.findUnique({
        where: { id: legId },
        select: {
          operatorId: true,
          schedule: { select: { originPort: true, destinationPort: true } },
        },
      });
      if (leg) {
        context.operatorId = leg.operatorId;
        context.routeCode = `${leg.schedule.originPort}-${leg.schedule.destinationPort}`;
        context.multipliers = (await resolvePlatformPricing(leg.operatorId)).multipliers;
      }
    }

    const result = await validatePromoCode(code, context);
    if (!result.valid) {
      return NextResponse.json({ valid: false, error: result.error });
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
