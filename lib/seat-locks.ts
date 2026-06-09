import { prisma } from "@/lib/db";

const LOCK_DURATION_MINUTES = 15;

export async function lockSeat(
  legId: string,
  seatId: string,
  bookingSessionId: string,
): Promise<boolean> {
  const expiresAt = new Date(Date.now() + LOCK_DURATION_MINUTES * 60 * 1000);

  try {
    await prisma.seatLock.create({
      data: {
        legId,
        seatId,
        bookingSessionId,
        expiresAt,
      },
    });
    return true;
  } catch (err: unknown) {
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      (err as { code: string }).code === "P2002"
    ) {
      return false;
    }
    throw err;
  }
}

export async function unlockSeat(
  legId: string,
  seatId: string,
  bookingSessionId: string,
): Promise<void> {
  await prisma.seatLock.deleteMany({
    where: {
      legId,
      seatId,
      bookingSessionId,
    },
  });
}

export async function unlockAllSeatsForSession(
  legId: string,
  bookingSessionId: string,
): Promise<void> {
  await prisma.seatLock.deleteMany({
    where: {
      legId,
      bookingSessionId,
    },
  });
}

export async function getLockedSeats(legId: string): Promise<string[]> {
  await cleanupExpiredLocks(legId);
  const locks = await prisma.seatLock.findMany({
    where: { legId },
    select: { seatId: true },
  });
  return locks.map((l) => l.seatId);
}

export async function cleanupExpiredLocks(legId?: string): Promise<void> {
  await prisma.seatLock.deleteMany({
    where: legId
      ? { legId, expiresAt: { lt: new Date() } }
      : { expiresAt: { lt: new Date() } },
  });
}

export async function validateSeatLock(
  legId: string,
  seatId: string,
  bookingSessionId: string,
): Promise<boolean> {
  const lock = await prisma.seatLock.findUnique({
    where: { legId_seatId: { legId, seatId } },
  });
  if (!lock) return false;
  if (lock.bookingSessionId !== bookingSessionId) return false;
  if (lock.expiresAt < new Date()) return false;
  return true;
}
