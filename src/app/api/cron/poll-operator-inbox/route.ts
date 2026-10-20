import { NextRequest, NextResponse } from 'next/server';
import { env } from '@/shared/server/env';
import { pollOperatorInbox } from '@/features/tickets/operator-ticket-inbox';

/**
 * Cron job: reads the operator e-ticket mailbox over IMAP and forwards each new
 * ticket email to its buyer. Vercel Hobby only runs daily crons, so a GitHub
 * Actions schedule (.github/workflows/poll-operator-inbox.yml) calls this every
 * few minutes. Secured by CRON_SECRET like the other cron routes. Dry run unless
 * INBOX_POLL_LIVE=true.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (!env.CRON_SECRET || authHeader !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { items, ...counts } = await pollOperatorInbox();
    console.log(
      `[poll-operator-inbox] dryRun=${counts.dryRun} candidates=${counts.candidates} ` +
        `forwarded=${counts.forwarded} review=${counts.needsReview} skipped=${counts.skipped} failed=${counts.failed}`,
    );
    // Per-message detail carries sender, subject and customer names: it only
    // goes back to a caller that asks (?detail=1, same secret), never to a log.
    const detail = req.nextUrl.searchParams.get('detail') === '1';
    return NextResponse.json({ ok: true, ...counts, ...(detail ? { items } : {}) });
  } catch (err) {
    // A failed login or an unreachable mailbox must be loud, not an empty run.
    console.error('[poll-operator-inbox] failed:', err);
    return NextResponse.json({ ok: false, error: 'Poll failed' }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
