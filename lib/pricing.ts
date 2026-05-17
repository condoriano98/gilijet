import { Prisma } from "@prisma/client";
import { env } from "./env";

/**
 * Pricing & commission calculations.
 * All values are in IDR. We use Prisma.Decimal end-to-end to avoid
 * floating-point drift on currency.
 */

export type PriceBreakdown = {
  unitPrice: Prisma.Decimal;
  quantity: number;
  totalAmount: Prisma.Decimal;
  commissionRate: Prisma.Decimal;
  commissionAmount: Prisma.Decimal;
  operatorAmount: Prisma.Decimal;
};

export function computeBookingPrice(args: {
  unitPrice: Prisma.Decimal | string | number;
  quantity: number;
  commissionRate?: Prisma.Decimal | number;
}): PriceBreakdown {
  const unitPrice = new Prisma.Decimal(args.unitPrice);
  const commissionRate = new Prisma.Decimal(
    args.commissionRate ?? env.PLATFORM_COMMISSION_RATE,
  );
  if (args.quantity < 1) throw new Error("quantity must be >= 1");

  const totalAmount = unitPrice.mul(args.quantity);
  const commissionAmount = totalAmount.mul(commissionRate).toDecimalPlaces(0);
  const operatorAmount = totalAmount.sub(commissionAmount);

  return {
    unitPrice,
    quantity: args.quantity,
    totalAmount,
    commissionRate,
    commissionAmount,
    operatorAmount,
  };
}
