import { prisma } from '@/shared/server/db';
import { env } from '@/shared/server/env';
import {
  MAX_MESSAGE_BYTES,
  inboxConfigured,
  openInbox,
  parseRawEmail,
  type ReceivedEmail,
} from '@/features/messaging/inbox';
import {
  NEEDS_REVIEW_PREFIX,
  OPERATOR_TICKET_EVENT,
  OPERATOR_TICKET_PROVIDER,
  processOperatorTicketEmail,
} from '@/features/tickets/operator-ticket-email';
import {
  beginWebhookEvent,
  failWebhookEvent,
  settleWebhookEvent,
} from '@/features/payments/webhook-events';

/**
 * Poll the operator e-ticket mailbox over IMAP and hand every new mail from an
 * operator's confirmation address to `processOperatorTicketEmail`.
 *
 * The mailbox is opened read-only. "Already handled" is a WebhookEvent row keyed
 * by the Message-ID, not an IMAP flag, because people read this inbox too. Only
 * the last LOOKBACK_DAYS days (or since INBOX_POLL_SINCE, if later) are looked at,
 * judged by the time the mail arrived, and at most BATCH messages per run.
 * Without INBOX_POLL_LIVE=true nothing is forwarded or written: the run only
 * reports what it would do (dry run).
 */

const LOOKBACK_DAYS = 7;
const BATCH = 20;
const MAX_UIDS = 100;
// The route allows 60 s. Gmail's IMAP login, search and envelope fetch alone take
// 10-20 s, and one message can add up to ~25 s (body fetch, parse, SMTP
// timeouts), so no new message is started after 30 s.
const DEFAULT_BUDGET_MS = 30_000;

export type PollItem = {
  uid: number;
  from: string;
  subject: string;
  outcome: string;
};

export type PollSummary = {
  configured: boolean;
  dryRun: boolean;
  senders: number;
  candidates: number;
  handled: number;
  forwarded: number;
  needsReview: number;
  skipped: number;
  failed: number;
  items: PollItem[];
};

const empty = (dryRun: boolean, configured = true): PollSummary => ({
  configured,
  dryRun,
  senders: 0,
  candidates: 0,
  handled: 0,
  forwarded: 0,
  needsReview: 0,
  skipped: 0,
  failed: 0,
  items: [],
});

/** Distinct, lower-cased confirmation addresses of active operator PICs. */
async function confirmationSenders(): Promise<string[]> {
  const rows = await prisma.operatorPicContact.findMany({
    where: { deletedAt: null, operatorId: { not: null }, emailKonfirmasiTrigger: { not: null } },
    select: { emailKonfirmasiTrigger: true },
  });
  return [...new Set(rows.map((r) => r.emailKonfirmasiTrigger!.trim().toLowerCase()).filter(Boolean))];
}

export async function pollOperatorInbox(
  opts: { live?: boolean; budgetMs?: number; now?: Date } = {},
): Promise<PollSummary> {
  const live = opts.live ?? env.INBOX_POLL_LIVE;
  const summary = empty(!live, inboxConfigured());
  if (!summary.configured) return summary;

  const senders = await confirmationSenders();
  summary.senders = senders.length;
  if (senders.length === 0) return summary;

  const senderSet = new Set(senders);
  const deadline = Date.now() + (opts.budgetMs ?? DEFAULT_BUDGET_MS);
  const lookbackStart = new Date((opts.now ?? new Date()).getTime() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const configuredStart = env.INBOX_POLL_SINCE ? new Date(`${env.INBOX_POLL_SINCE}T00:00:00+08:00`) : null;
  const since = configuredStart && configuredStart > lookbackStart ? configuredStart : lookbackStart;

  const client = openInbox();
  await client.connect();
  try {
    const lock = await client.getMailboxLock('INBOX', { readOnly: true });
    try {
      const uidValidity = String(client.mailbox && client.mailbox.uidValidity);

      const uids = new Set<number>();
      for (const sender of senders) {
        const found = await client.search({ since, from: sender }, { uid: true });
        for (const uid of found || []) uids.add(uid);
      }
      // Newest MAX_UIDS only: a long backlog must not eat the time budget.
      const ordered = [...uids].sort((a, b) => a - b).slice(-MAX_UIDS);

      // Envelopes first, in one round trip: they are small, and their Message-ID
      // says whether the mail is already known before the (large) body is
      // downloaded. The IMAP FROM search is a substring match, so keep only mail
      // whose single From address is exactly an operator's confirmation address.
      const known: { uid: number; ref: string; size: number; from: string; subject: string }[] = [];
      if (ordered.length > 0) {
        for await (const e of client.fetch(ordered.join(','), { envelope: true, size: true, uid: true, internalDate: true }, { uid: true })) {
          // IMAP SINCE only knows whole days; the arrival time makes the cut exact.
          if (e.internalDate && new Date(e.internalDate) < since) continue;
          const from = e.envelope?.from?.length === 1 ? (e.envelope.from[0].address?.toLowerCase() ?? '') : '';
          if (!senderSet.has(from)) continue;
          known.push({
            uid: e.uid,
            // Sender-controlled, so bounded before it is stored or queried.
            ref: (e.envelope?.messageId || `imap:${uidValidity}:${e.uid}`).slice(0, 200),
            size: e.size ?? 0,
            from,
            subject: e.envelope?.subject ?? '',
          });
        }
      }

      const seen = await prisma.webhookEvent.findMany({
        where: {
          provider: OPERATOR_TICKET_PROVIDER,
          eventType: OPERATOR_TICKET_EVENT,
          externalRef: { in: known.map((k) => k.ref) },
        },
        select: { externalRef: true },
      });
      const done = new Set(seen.map((e) => e.externalRef));
      const fresh = known
        .sort((a, b) => a.uid - b.uid)
        .filter((k) => !done.has(k.ref))
        .slice(0, BATCH);
      summary.candidates = fresh.length;

      for (const m of fresh) {
        if (Date.now() > deadline) break;
        const payload = {
          type: OPERATOR_TICKET_EVENT,
          data: { email_id: m.ref, from: m.from, subject: m.subject, imap: { uidValidity, uid: m.uid } },
        };
        const item: PollItem = { uid: m.uid, from: m.from, subject: m.subject, outcome: '' };
        summary.items.push(item);

        try {
          if (m.size > MAX_MESSAGE_BYTES) {
            item.outcome = `${NEEDS_REVIEW_PREFIX}Message is larger than 15 MB`;
            summary.needsReview++;
            if (live) await recordSettled(payload, m.ref, { ok: false, error: item.outcome });
            continue;
          }

          const msg = await client.fetchOne(String(m.uid), { source: true }, { uid: true });
          if (!msg || !msg.source) {
            item.outcome = 'message disappeared';
            summary.skipped++;
            continue;
          }
          let email: ReceivedEmail;
          try {
            email = await parseRawEmail(msg.source, m.ref);
          } catch (err) {
            // A message that cannot be parsed will not parse next time either:
            // put it on the admin's list instead of re-reading it every poll.
            item.outcome = `${NEEDS_REVIEW_PREFIX}Could not read the message: ${err instanceof Error ? err.message : String(err)}`;
            summary.needsReview++;
            if (live) await recordSettled(payload, m.ref, { ok: false, error: item.outcome });
            continue;
          }

          if (!live) {
            const r = await processOperatorTicketEmail(payload, { email, dryRun: true });
            item.outcome = r.ok ? r.status : r.error;
            tally(summary, r);
            continue;
          }

          const begun = await beginWebhookEvent({
            provider: OPERATOR_TICKET_PROVIDER,
            eventType: OPERATOR_TICKET_EVENT,
            externalRef: m.ref,
            payload,
          });
          if (begun.idempotent) {
            item.outcome = 'already in progress';
            summary.skipped++;
            continue;
          }
          try {
            const r = await processOperatorTicketEmail(payload, { email });
            await settleWebhookEvent(begun.id, r);
            item.outcome = r.ok ? r.status : r.error;
            tally(summary, r);
          } catch (err) {
            await failWebhookEvent(begun.id, err);
            item.outcome = `failed: ${err instanceof Error ? err.message : String(err)}`;
            summary.failed++;
          }
        } catch (err) {
          item.outcome = `failed: ${err instanceof Error ? err.message : String(err)}`;
          summary.failed++;
        }
      }
      summary.handled = summary.items.length;
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => undefined);
  }
  return summary;
}

function tally(
  summary: PollSummary,
  r: { ok: true; status: string } | { ok: false; error: string; httpStatus?: number },
) {
  if (r.ok) {
    if (r.status === 'forwarded' || r.status.startsWith('dry-run: would forward')) summary.forwarded++;
    else summary.skipped++;
  } else if (r.error.startsWith(NEEDS_REVIEW_PREFIX)) summary.needsReview++;
  else summary.failed++;
}

async function recordSettled(
  payload: Record<string, unknown>,
  ref: string,
  result: { ok: false; error: string },
) {
  const begun = await beginWebhookEvent({
    provider: OPERATOR_TICKET_PROVIDER,
    eventType: OPERATOR_TICKET_EVENT,
    externalRef: ref,
    payload,
  });
  if (!begun.idempotent) await settleWebhookEvent(begun.id, result);
}
