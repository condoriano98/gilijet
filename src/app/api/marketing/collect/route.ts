import { NextRequest, NextResponse } from 'next/server';
import { handleCollect, MAX_COLLECT_BODY_BYTES } from '@/features/marketing/collect';

/**
 * Public, unauthenticated: browser funnel events (search, view_item) for the
 * internal ledger. Consent-gated, schema-validated, size- and rate-limited,
 * and it never stores personal data. See src/features/marketing/collect.ts.
 */
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const declared = Number(req.headers.get('content-length') ?? 0);
  if (declared > MAX_COLLECT_BODY_BYTES) {
    return NextResponse.json({ ok: false, error: 'Payload too large' }, { status: 413 });
  }
  const rawBody = await req.text();
  const ip = (req.headers.get('x-forwarded-for') ?? 'unknown').split(',')[0].trim();
  const outcome = await handleCollect({ rawBody, ip, cookie: (name) => req.cookies.get(name)?.value });
  if (outcome.status === 204) return new NextResponse(null, { status: 204 });
  if (outcome.status === 202) return NextResponse.json({ ok: true, recorded: outcome.recorded }, { status: 202 });
  return NextResponse.json({ ok: false, error: outcome.error }, { status: outcome.status });
}
