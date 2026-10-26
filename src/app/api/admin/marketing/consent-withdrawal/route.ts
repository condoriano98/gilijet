import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { superAdminOrResponse } from '@/features/marketing/admin-api';
import { withdrawConsentForBooking } from '@/features/marketing/consent-withdrawal';

/** POST { bookingId }: withdraw measurement consent for a booking on the customer's request. SUPER_ADMIN, audited. */
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const auth = await superAdminOrResponse();
  if (auth instanceof NextResponse) return auth;
  const parsed = z.object({ bookingId: z.string().min(1).max(40) }).strict().safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'bookingId required' }, { status: 400 });
  return NextResponse.json({ ok: true, ...(await withdrawConsentForBooking(parsed.data.bookingId, auth.sub)) });
}
