import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { allowCollect } from '@/features/marketing/collect';
import { withdrawConsentForVisitor } from '@/features/marketing/consent-withdrawal';
import { eventsEnabled } from '@/features/marketing/config';

/**
 * Public: the banner reports a narrowed consent choice so bookings already
 * made by this visitor stop feeding ad platforms. It can only ever take
 * consent away, never grant it, so a forged call can do no more than withhold
 * one visitor's measurement. The visitor id is a random 80-bit value.
 */
export const dynamic = 'force-dynamic';

const bodySchema = z
  .object({
    visitorId: z.string().regex(/^v_[a-f0-9]{8,32}$/),
    withdraw: z.object({ analytics: z.boolean(), marketing: z.boolean() }).strict(),
  })
  .strict();

export async function POST(req: NextRequest) {
  if (!eventsEnabled()) return new NextResponse(null, { status: 204 });
  const ip = (req.headers.get('x-forwarded-for') ?? 'unknown').split(',')[0].trim();
  if (!allowCollect(`consent:${ip}`)) return NextResponse.json({ ok: false }, { status: 429 });
  const raw = await req.text();
  if (raw.length > 512) return NextResponse.json({ ok: false }, { status: 413 });
  let parsed: z.infer<typeof bodySchema>;
  try {
    const r = bodySchema.safeParse(JSON.parse(raw));
    if (!r.success) return NextResponse.json({ ok: false }, { status: 400 });
    parsed = r.data;
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const result = await withdrawConsentForVisitor(parsed.visitorId, parsed.withdraw);
  return NextResponse.json({ ok: true, ...result });
}
