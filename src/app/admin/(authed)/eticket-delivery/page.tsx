import { requireAdmin } from '@/shared/server/auth';
import { prisma } from '@/shared/server/db';
import { formatLocalDateTime } from '@/shared/lib/datetime';
import { NEEDS_REVIEW_PREFIX, FORWARDED_ACTION, OPERATOR_TICKET_PROVIDER } from '@/features/tickets/operator-ticket-email';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { forwardOperatorEmailAction } from './actions';

export const metadata = { title: 'E-ticket delivery · Admin' };
export const dynamic = 'force-dynamic';

const MESSAGES: Record<string, string> = {
  forwarded: 'Forwarded to the customer.',
  still_failing: 'Could not forward. See the reason in the Needs review list.',
  missing_input: 'Pick a booking reference first.',
  event_not_found: 'Email not found.',
  already_in_progress: 'This email was already handled.',
};

const WAIT_DAYS = 14;

function ageLabel(since: Date): string {
  const mins = Math.max(0, Math.round((Date.now() - since.getTime()) / 60000));
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  return h < 48 ? `${h} h` : `${Math.floor(h / 24)} d`;
}

export default async function ETicketDeliveryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireAdmin();
  const { ok, error } = await searchParams;
  const since = new Date(Date.now() - WAIT_DAYS * 24 * 60 * 60 * 1000);

  const [notified, forwarded, review] = await Promise.all([
    prisma.auditLog.findMany({
      where: { entityType: 'BOOKING', action: 'pic_order_notified', createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      take: 300,
      select: { entityId: true, createdAt: true },
    }),
    prisma.auditLog.findMany({
      where: { entityType: 'BOOKING', action: FORWARDED_ACTION, createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      take: 300,
      select: { entityId: true, createdAt: true, newState: true },
    }),
    prisma.webhookEvent.findMany({
      where: {
        provider: OPERATOR_TICKET_PROVIDER,
        status: 'FAILED',
        errorMessage: { startsWith: NEEDS_REVIEW_PREFIX },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { id: true, rawPayload: true, errorMessage: true, createdAt: true },
    }),
  ]);

  const forwardedCount = new Map<string, number>();
  for (const f of forwarded) forwardedCount.set(f.entityId, (forwardedCount.get(f.entityId) ?? 0) + 1);

  const bookings = await prisma.booking.findMany({
    where: {
      id: { in: [...new Set([...notified.map((n) => n.entityId), ...forwarded.map((f) => f.entityId)])] },
    },
    select: {
      id: true,
      bookingReference: true,
      customerName: true,
      tripType: true,
      status: true,
    },
  });
  const byId = new Map(bookings.map((b) => [b.id, b]));

  const waiting = notified
    .filter((n, i, all) => all.findIndex((x) => x.entityId === n.entityId) === i)
    .map((n) => ({ n, b: byId.get(n.entityId) }))
    .filter(
      ({ n, b }) =>
        b &&
        ['AWAITING_CONFIRMATION', 'CONFIRMED'].includes(b.status) &&
        (forwardedCount.get(n.entityId) ?? 0) < (b.tripType === 'ROUND_TRIP' ? 2 : 1),
    );

  const banner = ok ? MESSAGES[ok] : error ? MESSAGES[error] : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">E-ticket delivery</h1>
        <p className="text-sm text-muted-foreground">
          After a booking is paid, the operator&apos;s PIC creates the ticket and the operator emails
          it to admin@gilifast.com, which forwards it to the customer automatically. Last {WAIT_DAYS}{' '}
          days. Times are WITA.
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
          <CardTitle>Needs review ({review.length})</CardTitle>
          <CardDescription>
            Operator emails we could not match to one booking. Nothing was sent. Enter the booking
            reference to forward it to that booking&apos;s buyer.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Received</TableHead>
                <TableHead>From / subject</TableHead>
                <TableHead>Why</TableHead>
                <TableHead>Forward to booking</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {review.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                    Nothing to review.
                  </TableCell>
                </TableRow>
              )}
              {review.map((e) => {
                type Meta = { from?: string; subject?: string };
                const raw = (e.rawPayload as { data?: Meta & { mock_email?: Meta } })?.data;
                const data = { from: raw?.from ?? raw?.mock_email?.from, subject: raw?.subject ?? raw?.mock_email?.subject };
                return (
                  <TableRow key={e.id}>
                    <TableCell className="whitespace-nowrap text-sm">{formatLocalDateTime(e.createdAt)}</TableCell>
                    <TableCell className="text-sm">
                      <div>{data.from ?? '-'}</div>
                      <div className="text-muted-foreground">{data.subject ?? '-'}</div>
                    </TableCell>
                    <TableCell className="text-sm">{e.errorMessage?.replace(NEEDS_REVIEW_PREFIX, '')}</TableCell>
                    <TableCell>
                      <form action={forwardOperatorEmailAction} className="flex gap-2">
                        <input type="hidden" name="id" value={e.id} />
                        <Input name="bookingReference" placeholder="BK-2026-10-ABC234" className="w-48 font-mono text-xs" />
                        <Button type="submit" size="sm">Forward</Button>
                      </form>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Waiting for the operator&apos;s ticket ({waiting.length})</CardTitle>
          <CardDescription>
            Paid bookings whose PIC was notified but whose ticket email has not arrived yet.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>PIC notified</TableHead>
                <TableHead>Waiting</TableHead>
                <TableHead>Booking</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Trip</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {waiting.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                    Nothing is waiting.
                  </TableCell>
                </TableRow>
              )}
              {waiting.map(({ n, b }) => (
                <TableRow key={n.entityId}>
                  <TableCell className="whitespace-nowrap text-sm">{formatLocalDateTime(n.createdAt)}</TableCell>
                  <TableCell className="text-sm">{ageLabel(n.createdAt)}</TableCell>
                  <TableCell className="font-mono text-xs">{b!.bookingReference}</TableCell>
                  <TableCell className="text-sm">{b!.customerName}</TableCell>
                  <TableCell className="text-sm">{b!.tripType === 'ROUND_TRIP' ? 'Round trip' : 'One way'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Delivered ({forwarded.length})</CardTitle>
          <CardDescription>Operator tickets forwarded to the buyer, newest first.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Forwarded</TableHead>
                <TableHead>Booking</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Matched by</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {forwarded.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                    Nothing forwarded yet.
                  </TableCell>
                </TableRow>
              )}
              {forwarded.slice(0, 50).map((f, i) => {
                const b = byId.get(f.entityId);
                const state = (f.newState ?? {}) as { matchedBy?: string; leg?: string | null; mock?: boolean };
                return (
                  <TableRow key={`${f.entityId}-${i}`}>
                    <TableCell className="whitespace-nowrap text-sm">{formatLocalDateTime(f.createdAt)}</TableCell>
                    <TableCell className="font-mono text-xs">{b?.bookingReference ?? f.entityId}</TableCell>
                    <TableCell className="text-sm">{b?.customerName ?? '-'}</TableCell>
                    <TableCell>
                      <Badge variant={state.matchedBy === 'code' ? 'default' : 'outline'}>
                        {state.matchedBy ?? '-'}
                      </Badge>
                      {state.leg && <span className="ml-2 text-xs text-muted-foreground">{state.leg}</span>}
                      {state.mock && <span className="ml-2 text-xs text-muted-foreground">(mock)</span>}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
