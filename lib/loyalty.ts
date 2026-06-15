import { prisma } from "./db";

/**
 * Loyalty points: customers earn 1 point per IDR 10,000 spent on confirmed
 * bookings. Points expire 12 months after earning if not redeemed.
 */
const POINTS_PER_AMOUNT = 10_000; // 1 point per IDR 10k
const POINT_EXPIRY_MONTHS = 12;

export async function earnPoints(
  customerId: string,
  bookingId: string,
  amountInIdr: number,
): Promise<void> {
  const points = Math.floor(amountInIdr / POINTS_PER_AMOUNT);
  if (points <= 0) return;

  await prisma.$transaction(async (tx) => {
    let account = await tx.loyaltyAccount.findUnique({
      where: { customerId },
    });
    if (!account) {
      account = await tx.loyaltyAccount.create({
        data: { customerId, pointsBalance: 0, lifetimePoints: 0 },
      });
    }

    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + POINT_EXPIRY_MONTHS);

    await tx.loyaltyTransaction.create({
      data: {
        accountId: account.id,
        bookingId,
        type: "EARNED",
        points,
        description: `Earned from booking`,
        expiresAt,
      },
    });

    await tx.loyaltyAccount.update({
      where: { id: account.id },
      data: {
        pointsBalance: { increment: points },
        lifetimePoints: { increment: points },
      },
    });
  });
}

export async function redeemPoints(
  customerId: string,
  points: number,
): Promise<number> {
  const account = await prisma.loyaltyAccount.findUnique({
    where: { customerId },
  });
  if (!account || account.pointsBalance < points) {
    throw new Error("Insufficient points balance");
  }

  await prisma.$transaction(async (tx) => {
    await tx.loyaltyTransaction.create({
      data: {
        accountId: account.id,
        type: "REDEEMED",
        points: -points,
        description: `Redeemed ${points} points`,
      },
    });
    await tx.loyaltyAccount.update({
      where: { id: account.id },
      data: { pointsBalance: { decrement: points } },
    });
  });

  return points * 100; // 1 point = IDR 100 redemption value
}

export async function expireStalePoints(): Promise<number> {
  const expired = await prisma.loyaltyTransaction.updateMany({
    where: {
      type: "EARNED",
      expiresAt: { lte: new Date() },
    },
    data: { type: "EXPIRED" },
  });
  return expired.count;
}
