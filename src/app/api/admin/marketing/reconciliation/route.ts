import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { superAdminOrResponse } from '@/features/marketing/admin-api';
import { loadReconciliationInput, reconcile, repairMissingMarketingEvents } from '@/features/marketing/reporting/reconciliation';

/**
 * GET ?from=YYYY-MM-DD&to=YYYY-MM-DD: read-only ledger-to-marketing
 * reconciliation for bookings created in [from, to]. SUPER_ADMIN.
 *
 * POST { from, to, confirm: "record-missing-marketing-events" }: the explicit
 * repair. Records only the missing internal marketing events (idempotent,
 * audited); never changes a booking, payment, refund or ticket.
 */
export const dynamic = 'force-dynamic';

const range = z.object({ from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });

function toRange(r: { from: string; to: string }) {
  const from = new Date(`${r.from}T00:00:00Z`);
  const to = new Date(`${r.to}T00:00:00Z`);
  to.setUTCDate(to.getUTCDate() + 1);
  return { from, to };
}

export async function GET(req: NextRequest) {
  const auth = await superAdminOrResponse();
  if (auth instanceof NextResponse) return auth;
  const parsed = range.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsed.success || parsed.data.from > parsed.data.to) return NextResponse.json({ ok: false, error: 'from and to (YYYY-MM-DD) required' }, { status: 400 });
  const exceptions = reconcile(await loadReconciliationInput(toRange(parsed.data)));
  return NextResponse.json({ ok: true, count: exceptions.length, exceptions });
}

export async function POST(req: NextRequest) {
  const auth = await superAdminOrResponse();
  if (auth instanceof NextResponse) return auth;
  const parsed = range.extend({ confirm: z.literal('record-missing-marketing-events') }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'from, to and confirm required' }, { status: 400 });
  const exceptions = reconcile(await loadReconciliationInput(toRange(parsed.data)));
  const result = await repairMissingMarketingEvents({ exceptions, adminId: auth.sub });
  return NextResponse.json({ ok: true, ...result });
}
