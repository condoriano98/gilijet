import type { Prisma, PrismaClient } from '@prisma/client';

/** Delete bookings and the rows that block deleting them (never used for real data). */
export async function removeBookings(prisma: PrismaClient, where: Prisma.BookingWhereInput) {
  const ids = (await prisma.booking.findMany({ where, select: { id: true } })).map((b) => b.id);
  if (ids.length === 0) return;
  await prisma.refund.deleteMany({ where: { bookingId: { in: ids } } });
  await prisma.payment.deleteMany({ where: { bookingId: { in: ids } } });
  await prisma.booking.deleteMany({ where: { id: { in: ids } } });
}

/** Delete test schedules (matched by origin port) with their legs, after their bookings are gone. */
export async function removeSchedules(prisma: PrismaClient, originPorts: string[]) {
  const schedules = await prisma.schedule.findMany({
    where: { originPort: { in: originPorts } },
    select: { id: true },
  });
  const ids = schedules.map((s) => s.id);
  await prisma.leg.deleteMany({ where: { scheduleId: { in: ids } } });
  await prisma.schedule.deleteMany({ where: { id: { in: ids } } });
}

/** Fare matrix whose low/high/peak cells are equal, so no season can change the price. */
export const flatFares = (adult: number) => {
  const cell = { adult, child: adult / 2, infant: 0 };
  const season = { low: cell, high: cell, peak: cell };
  return { oneWay: season, return: season };
};
