import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { env } from "./env";

/**
 * Platform-economics config — the values the owner console tunes.
 *
 * Commission resolution is layered, most-specific wins:
 *   Operator.commissionRate  →  PlatformConfig.commissionRate  →  env  →  0.08
 *
 * `Operator.commissionRate` already exists on every operator (default 0.08);
 * the booking engine now honours it instead of the env-only default, so the
 * console can price each operator individually without a schema change.
 */

const DEFAULT_COMMISSION_RATE = 0.08;
const PLATFORM_CONFIG_ID = "default";

/** Read the singleton config, creating it with defaults on first access. */
export async function getPlatformConfig() {
  return prisma.platformConfig.upsert({
    where: { id: PLATFORM_CONFIG_ID },
    update: {},
    create: { id: PLATFORM_CONFIG_ID },
  });
}

function envCommissionRate(): number {
  const fromEnv = env.PLATFORM_COMMISSION_RATE;
  return typeof fromEnv === "number" && Number.isFinite(fromEnv)
    ? fromEnv
    : DEFAULT_COMMISSION_RATE;
}

/**
 * Resolve the effective commission rate for a booking on `operatorId`.
 * Falls through to the platform default and finally the env default so it
 * never returns undefined (a `Prisma.Decimal(undefined)` throws downstream).
 */
export async function resolveCommissionRate(
  operatorId: string,
  tx: Prisma.TransactionClient = prisma,
): Promise<Prisma.Decimal> {
  const operator = await tx.operator.findUnique({
    where: { id: operatorId },
    select: { commissionRate: true },
  });
  if (operator?.commissionRate != null) {
    return new Prisma.Decimal(operator.commissionRate);
  }

  const config = await tx.platformConfig.findUnique({
    where: { id: PLATFORM_CONFIG_ID },
    select: { commissionRate: true },
  });
  if (config?.commissionRate != null) {
    return new Prisma.Decimal(config.commissionRate);
  }

  return new Prisma.Decimal(envCommissionRate());
}
