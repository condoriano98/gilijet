import Link from 'next/link';
import type { Prisma, WebhookEventStatus } from '@prisma/client';
import { requireAdmin } from '@/shared/server/auth';
import { prisma } from '@/shared/server/db';
import { formatLocalDateTime } from '@/shared/lib/datetime';
import { REJECTED_EVENT_TYPE, isRetryableEvent } from '@/features/payments/webhook-events';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/shared/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/ui/table';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { retryWebhookEventAction } from './actions';

export const metadata = { title: 'Webhooks · Admin' };
export const dynamic = 'force-dynamic';

const STATUSES: WebhookEventStatus[] = [
  'FAILED',
  'PENDING',
  'PROCESSING',
  'PROCESSED',
  'SKIPPED',
];
const PROVIDERS = ['doku', 'paypal', 'imap-inbox', 'whatsapp'];
const PROVIDER_LABELS: Record<string, string> = {
  doku: 'DOKU',
  paypal: 'PayPal',
  'imap-inbox': 'Operator email',
};

const MESSAGES: Record<string, string> = {
  retried: 'Event processed.',
  still_failing: 'Retry ran, but the event still fails. See the error column.',
  missing_event: 'No event selected.',
  event_not_found: 'Event not found.',
  not_retryable: 'This event type is a record only and cannot be retried.',
  already_in_progress: 'Event is no longer FAILED (already retried or in progress).',
};

function statusVariant(status: WebhookEventStatus) {
  if (status === 'FAILED') return 'destructive' as const;
  if (status === 'PROCESSED') return 'default' as const;
  return 'outline' as const;
}

function filterHref(
  current: { provider?: string; status?: string; type?: string; q?: string },
  patch: { provider?: string | null; status?: string | null; type?: string | null },
) {
  const next = { ...current, ...patch };
  const qs = new URLSearchParams();
  if (next.provider) qs.set('provider', next.provider);
  if (next.status) qs.set('status', next.status);
  if (next.type) qs.set('type', next.type);
  if (next.q) qs.set('q', next.q);
  const s = qs.toString();
  return s ? `/admin/webhooks?${s}` : '/admin/webhooks';
}

function Chip({ label, active, href }: { label: string; active: boolean; href: string }) {
  return (
    <Link
      href={href}
      className={`rounded-full border px-3 py-1 text-sm ${
        active ? 'border-sky-600 bg-sky-50 text-sky-800' : 'text-slate-600 hover:bg-slate-100'
      }`}
    >
      {label}
    </Link>
  );
}

/**
 * Every gateway callback the app received: processed, skipped, failed, or
 * rejected before it was trusted. This is where "paid at DOKU but the booking
 * did not move" is answered: no row for the booking reference means DOKU never
 * reached us; a FAILED row says why and can be retried.
 */
export default async function AdminWebhooksPage({
  searchParams,
}: {
  searchParams: Promise<{
    provider?: string;
    status?: string;
    type?: string;
    q?: string;
    ok?: string;
    error?: string;
  }>;
}) {
  await requireAdmin();
  const { provider, status, type, q, ok, error } = await searchParams;
  const current = { provider, status, type, q };

  const where: Prisma.WebhookEventWhereInput = {};
  if (provider && PROVIDERS.includes(provider)) where.provider = provider;
  if (status && STATUSES.includes(status as WebhookEventStatus)) {
    where.status = status as WebhookEventStatus;
  }
  // Rejected callbacks come from an unauthenticated endpoint, so they are kept
  // out of the default view and the failure counter: a flood of them must not
  // push genuine payment failures off the page. They have their own filter.
  if (type === 'rejected') where.eventType = REJECTED_EVENT_TYPE;
  else where.eventType = { not: REJECTED_EVENT_TYPE };
  if (q?.trim()) where.externalRef = { contains: q.trim(), mode: 'insensitive' };

  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [events, failedLastDay] = await Promise.all([
    prisma.webhookEvent.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        provider: true,
        eventType: true,
        externalRef: true,
        status: true,
        attempts: true,
        errorMessage: true,
        createdAt: true,
      },
    }),
    prisma.webhookEvent.count({
      where: {
        status: 'FAILED',
        eventType: { not: REJECTED_EVENT_TYPE },
        createdAt: { gte: dayAgo },
      },
    }),
  ]);

  const lookup = (key?: string) =>
    key && Object.hasOwn(MESSAGES, key) ? MESSAGES[key] : null;
  const banner = lookup(ok) ?? lookup(error);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Payment webhooks</h1>
        <p className="text-sm text-muted-foreground">
          Callbacks from DOKU and PayPal. A paid booking waits in{' '}
          <strong>Paid · awaiting confirmation</strong> until you confirm it with the
          operator; a booking still <strong>Unpaid</strong> after payment has a FAILED
          row here, or none.
        </p>
      </div>

      {banner && (
        <div
          role="status"
          className={`rounded-md border px-3 py-2 text-sm ${
            error || ok === 'still_failing'
              ? 'border-red-200 bg-red-50 text-red-800'
              : 'border-emerald-200 bg-emerald-50 text-emerald-800'
          }`}
        >
          {banner}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>
            Events{' '}
            <span className="text-sm font-normal text-muted-foreground">
              · {failedLastDay} failed in the last 24 hours
            </span>
          </CardTitle>
          <CardDescription>Latest 100, newest first. Times are WITA.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <form method="get" className="flex flex-wrap gap-2">
            {provider && <input type="hidden" name="provider" value={provider} />}
            {status && <input type="hidden" name="status" value={status} />}
            {type && <input type="hidden" name="type" value={type} />}
            <Input
              name="q"
              defaultValue={q ?? ''}
              placeholder="Booking reference"
              className="max-w-xs"
            />
            <Button type="submit">Search</Button>
            {(q || provider || status || type) && (
              <Button asChild variant="ghost">
                <Link href="/admin/webhooks">Clear</Link>
              </Button>
            )}
          </form>

          <div className="flex flex-wrap gap-2">
            <Chip label="All providers" active={!provider} href={filterHref(current, { provider: null })} />
            {PROVIDERS.map((p) => (
              <Chip
                key={p}
                label={PROVIDER_LABELS[p]}
                active={provider === p}
                href={filterHref(current, { provider: p })}
              />
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Chip label="All statuses" active={!status} href={filterHref(current, { status: null })} />
            {STATUSES.map((s) => (
              <Chip
                key={s}
                label={s}
                active={status === s}
                href={filterHref(current, { status: s })}
              />
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            <Chip label="Payment events" active={type !== 'rejected'} href={filterHref(current, { type: null })} />
            <Chip label="Rejected callbacks" active={type === 'rejected'} href={filterHref(current, { type: 'rejected' })} />
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Received</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead>Event</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Attempts</TableHead>
                <TableHead>Error</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-sm text-muted-foreground">
                    No webhook events match.
                  </TableCell>
                </TableRow>
              )}
              {events.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="whitespace-nowrap text-sm">
                    {formatLocalDateTime(e.createdAt)}
                  </TableCell>
                  <TableCell className="text-sm">{e.provider}</TableCell>
                  <TableCell className="text-sm">{e.eventType}</TableCell>
                  <TableCell className="whitespace-nowrap font-mono text-xs">
                    {e.externalRef}
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(e.status)}>{e.status}</Badge>
                  </TableCell>
                  <TableCell className="text-sm">{e.attempts}</TableCell>
                  <TableCell className="max-w-xs break-words text-xs text-muted-foreground">
                    {e.errorMessage ?? '—'}
                  </TableCell>
                  <TableCell>
                    {e.status === 'FAILED' && isRetryableEvent(e.provider, e.eventType) && (
                      <form action={retryWebhookEventAction}>
                        <input type="hidden" name="id" value={e.id} />
                        <Button type="submit" size="sm" variant="outline">
                          Retry
                        </Button>
                      </form>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
