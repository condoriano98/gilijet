import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { superAdminOrResponse } from '@/features/marketing/admin-api';
import { syncAdSpend } from '@/features/marketing/ads/sync';

/**
 * POST: run the read-only spend sync now. SUPER_ADMIN. Optional body
 * { from, to } (YYYY-MM-DD, at most 60 days). Same switches as the cron:
 * nothing is fetched unless ADS_SYNC_ENABLED=true and credentials exist.
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const body = z
  .object({ from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) })
  .strict()
  .refine((b) => b.from <= b.to && (Date.parse(b.to) - Date.parse(b.from)) / 86_400_000 < 60, 'Range must be 1-60 days');

export async function POST(req: NextRequest) {
  const auth = await superAdminOrResponse();
  if (auth instanceof NextResponse) return auth;
  const raw = await req.text();
  let range: { from?: string; to?: string } = {};
  if (raw.trim()) {
    const parsed = body.safeParse((() => { try { return JSON.parse(raw); } catch { return null; } })());
    if (!parsed.success) return NextResponse.json({ ok: false, error: 'Invalid range' }, { status: 400 });
    range = parsed.data;
  }
  const results = await syncAdSpend({ triggeredBy: `admin:${auth.sub}`, ...range });
  return NextResponse.json({ ok: true, results });
}
