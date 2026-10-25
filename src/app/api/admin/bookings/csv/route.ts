import { NextRequest } from 'next/server';
import { getAdminSession } from '@/shared/server/auth';
import { prisma } from '@/shared/server/db';
import { formatLocalDateTime } from '@/shared/lib/datetime';
import { getMainLeg } from '@/features/booking/helpers';
import { buildBookingWhere } from '@/features/booking/admin-filters';

function csvEscape(v: string): string {
  if (v.includes(',') || v.includes('"') || v.includes('\n') || v.includes('\r')) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}

export async function GET(req: NextRequest) {
  const session = await getAdminSession();
  if (!session) return new Response('Unauthorized', { status: 401 });

  const param = (name: string) => req.nextUrl.searchParams.get(name) ?? undefined;
  const where = buildBookingWhere({
    q: param('q'),
    status: param('status'),
    paymentMethod: param('paymentMethod'),
    tripType: param('tripType'),
  });

  const bookings = await prisma.booking.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 5000,
    include: {
      leg: { include: { schedule: { include: { boat: true } } } },
      outboundLeg: { include: { schedule: { include: { boat: true } } } },
      returnLeg: { include: { schedule: { include: { boat: true } } } },
    },
  });

  const header = [
    'Reference',
    'Status',
    'Origin',
    'Destination',
    'Boat',
    'Departure',
    'Customer',
    'Email',
    'Phone',
    'Amount',
    'Created',
  ];

  const rows = bookings.map((b) => {
    const mainLeg = getMainLeg(b)!;
    return [
      b.bookingReference,
      b.status,
      mainLeg.schedule.originPort,
      mainLeg.schedule.destinationPort,
      mainLeg.schedule.boat.name,
      formatLocalDateTime(mainLeg.departureDate),
      b.customerName,
      b.customerEmail,
      b.customerPhone,
      String(Number(b.totalAmount)),
      formatLocalDateTime(b.createdAt),
    ];
  });

  const csv = [header, ...rows]
    .map((row) => row.map(csvEscape).join(','))
    .join('\r\n');

  const dateStr = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="bookings-${dateStr}.csv"`,
    },
  });
}

export const dynamic = 'force-dynamic';
