import Link from 'next/link';
import { Prisma, BookingStatus, PaymentMethod } from '@prisma/client';
import { requireAdmin } from '@/lib/auth';
import { prisma } from '@/lib/db';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { BookingRow } from './booking-row';

const STATUS_FILTERS: BookingStatus[] = [
  'PENDING_PAYMENT',
  'AWAITING_CONFIRMATION',
  'CONFIRMED',
  'CANCELLED_BY_CUSTOMER',
  'CANCELLED_BY_OPERATOR',
  'EXPIRED',
];

function buildWhere(q?: string, status?: string, paymentMethod?: string): Prisma.BookingWhereInput {
  const where: Prisma.BookingWhereInput = {};
  if (status && STATUS_FILTERS.includes(status as BookingStatus)) {
    where.status = status as BookingStatus;
  }
  if (paymentMethod) {
    where.payment = {
      method: paymentMethod as PaymentMethod,
    };
  }
  if (q && q.trim()) {
    const term = q.trim();
    where.OR = [
      { bookingReference: { contains: term, mode: 'insensitive' } },
      { customerEmail: { contains: term, mode: 'insensitive' } },
      { customerName: { contains: term, mode: 'insensitive' } },
    ];
  }
  return where;
}

export default async function AdminBookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; paymentMethod?: string }>;
}) {
  await requireAdmin();
  const { q, status, paymentMethod } = await searchParams;

  const where = buildWhere(q, status, paymentMethod);
  const bookings = await prisma.booking.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 200,
    include: {
      leg: { include: { schedule: { include: { boat: true } } } },
      promotion: true,
      tickets: true,
      payment: true,
    },
  });

  const csvParams = new URLSearchParams();
  if (q) csvParams.set('q', q);
  if (status) csvParams.set('status', status);
  if (paymentMethod) csvParams.set('paymentMethod', paymentMethod);
  const csvHref = `/api/admin/bookings/csv${csvParams.toString() ? `?${csvParams}` : ''}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Bookings</h1>
          <p className="text-sm text-muted-foreground">
            Search by reference, email, or name. Up to 200 results shown.
          </p>
        </div>
        <Button asChild variant="outline">
          <a href={csvHref} download>
            Export CSV
          </a>
        </Button>
      </div>

      <Card>
        <CardContent className="pt-6">
          <form method="get" className="flex flex-wrap items-center gap-2">
            <Input
              name="q"
              placeholder="Reference, email, or name…"
              defaultValue={q ?? ''}
              className="max-w-xs"
            />
            {status ? <input type="hidden" name="status" value={status} /> : null}
            {paymentMethod ? <input type="hidden" name="paymentMethod" value={paymentMethod} /> : null}
            <Button type="submit">Search</Button>
            {(q || status || paymentMethod) && (
              <Button asChild variant="ghost">
                <Link href="/admin/bookings">Clear</Link>
              </Button>
            )}
          </form>

          <div className="mt-3 flex flex-wrap gap-2">
            <div>
              <p className="mb-2 text-sm font-medium text-muted-foreground">Booking Status:</p>
              <div className="flex flex-wrap gap-2">
                <FilterChip label="All" active={!status} href={q ? `/admin/bookings?q=${encodeURIComponent(q)}` : '/admin/bookings'} />
                {STATUS_FILTERS.map((s) => {
                  const params = new URLSearchParams();
                  if (q) params.set('q', q);
                  if (paymentMethod) params.set('paymentMethod', paymentMethod);
                  params.set('status', s);
                  return (
                    <FilterChip
                      key={s}
                      label={s.replace(/_/g, ' ')}
                      active={status === s}
                      href={`/admin/bookings?${params}`}
                    />
                  );
                })}
              </div>
            </div>
            <div className="mt-3 w-full">
              <p className="mb-2 text-sm font-medium text-muted-foreground">Payment Method:</p>
              <div className="flex flex-wrap gap-2">
                <FilterChip
                  label="All"
                  active={!paymentMethod}
                  href={q ? `/admin/bookings?q=${encodeURIComponent(q)}${status ? `&status=${status}` : ''}` : `/admin/bookings${status ? `?status=${status}` : ''}`}
                />
                {(['DOKU', 'PAYPAL', 'QRIS', 'CREDIT_CARD', 'BANK_TRANSFER'] as const).map((method) => {
                  const params = new URLSearchParams();
                  if (q) params.set('q', q);
                  if (status) params.set('status', status);
                  params.set('paymentMethod', method);
                  return (
                    <FilterChip
                      key={method}
                      label={method === 'DOKU' ? 'DOKU' : method === 'PAYPAL' ? 'PayPal' : method}
                      active={paymentMethod === method}
                      href={`/admin/bookings?${params}`}
                    />
                  );
                })}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Results</CardTitle>
          <CardDescription>
            {bookings.length === 0
              ? 'No bookings match your filters.'
              : `${bookings.length} booking${bookings.length === 1 ? '' : 's'}`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {bookings.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              Nothing here yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Reference</TableHead>
                  <TableHead>Departure</TableHead>
                  <TableHead>Arrival</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Payment Method</TableHead>
                  <TableHead>Payment Value</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Passengers</TableHead>
                  <TableHead>Nationality</TableHead>
                  <TableHead className="w-[320px]">Notes</TableHead>
                  <TableHead>Promo Code</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bookings.map((b) => (
                  <BookingRow key={b.id} booking={b} />
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function FilterChip({
  label,
  active,
  href,
}: {
  label: string;
  active: boolean;
  href: string;
}) {
  return (
    <Link
      href={href}
      className={[
        'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
        active
          ? 'border-sky-500 bg-sky-50 text-sky-700'
          : 'border-slate-200 text-slate-600 hover:border-slate-300',
      ].join(' ')}
    >
      {label}
    </Link>
  );
}
