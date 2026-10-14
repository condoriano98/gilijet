import Link from 'next/link';
import { PaymentMethod } from '@prisma/client';
import { requireAdmin } from '@/shared/server/auth';
import { prisma } from '@/shared/server/db';
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
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/ui/table';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { BookingRow } from './booking-row';
import {
  BOOKING_STATUS_FILTERS,
  TRIP_TYPE_FILTERS,
  buildBookingWhere,
  bookingsHref,
} from '@/features/booking/admin-filters';

export default async function AdminBookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; paymentMethod?: string; tripType?: string }>;
}) {
  await requireAdmin();
  const { q, status, paymentMethod, tripType } = await searchParams;
  const filters = { q, status, paymentMethod, tripType };

  const where = buildBookingWhere(filters);
  const bookings = await prisma.booking.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 200,
    include: {
      leg: { include: { schedule: { include: { boat: true } } } },
      outboundLeg: { include: { schedule: { include: { boat: true } } } },
      returnLeg: { include: { schedule: { include: { boat: true } } } },
      promotion: true,
      tickets: true,
      payment: true,
    },
  });

  const csvHref = bookingsHref('/api/admin/bookings/csv', filters);

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
            {tripType ? <input type="hidden" name="tripType" value={tripType} /> : null}
            <Button type="submit">Search</Button>
            {(q || status || paymentMethod || tripType) && (
              <Button asChild variant="ghost">
                <Link href="/admin/bookings">Clear</Link>
              </Button>
            )}
          </form>

          <div className="mt-3 flex flex-wrap gap-2">
            <div>
              <p className="mb-2 text-sm font-medium text-muted-foreground">Booking Status:</p>
              <div className="flex flex-wrap gap-2">
                <FilterChip label="All" active={!status} href={bookingsHref('/admin/bookings', filters, { status: undefined })} />
                {BOOKING_STATUS_FILTERS.map((s) => (
                  <FilterChip
                    key={s}
                    label={s.replace(/_/g, ' ')}
                    active={status === s}
                    href={bookingsHref('/admin/bookings', filters, { status: s })}
                  />
                ))}
              </div>
            </div>
            <div className="mt-3 w-full">
              <p className="mb-2 text-sm font-medium text-muted-foreground">Payment Method:</p>
              <div className="flex flex-wrap gap-2">
                <FilterChip
                  label="All"
                  active={!paymentMethod}
                  href={bookingsHref('/admin/bookings', filters, { paymentMethod: undefined })}
                />
                {Object.values(PaymentMethod).map((method) => (
                  <FilterChip
                    key={method}
                    label={method === 'PAYPAL' ? 'PayPal' : method.replace(/_/g, ' ')}
                    active={paymentMethod === method}
                    href={bookingsHref('/admin/bookings', filters, { paymentMethod: method })}
                  />
                ))}
              </div>
            </div>
            <div className="mt-3 w-full">
              <p className="mb-2 text-sm font-medium text-muted-foreground">Trip Type:</p>
              <div className="flex flex-wrap gap-2">
                <FilterChip
                  label="All"
                  active={!tripType}
                  href={bookingsHref('/admin/bookings', filters, { tripType: undefined })}
                />
                {TRIP_TYPE_FILTERS.map((t) => (
                  <FilterChip
                    key={t.value}
                    label={t.label}
                    active={tripType === t.value}
                    href={bookingsHref('/admin/bookings', filters, { tripType: t.value })}
                  />
                ))}
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
