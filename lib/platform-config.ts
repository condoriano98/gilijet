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

export type ResolvedPlatformPricing = {
  commissionRate: Prisma.Decimal;
  multipliers: Partial<Record<"ADULT" | "CHILD" | "INFANT", number>> | undefined;
  serviceFee: { type: "PERCENT" | "FLAT"; value: number } | null;
};

/**
 * Resolve everything the pricing engine needs for a booking on `operatorId`:
 * the effective commission rate (Operator → PlatformConfig → env → 0.08),
 * the traveler multipliers, and the optional platform service fee. Reads the
 * singleton config once; safe when the config row does not exist yet
 * (multipliers fall back to the hard-coded defaults, no service fee).
 */
export async function resolvePlatformPricing(
  operatorId: string,
  tx: Prisma.TransactionClient = prisma,
): Promise<ResolvedPlatformPricing> {
  const [operator, config] = await Promise.all([
    tx.operator.findUnique({
      where: { id: operatorId },
      select: { commissionRate: true },
    }),
    tx.platformConfig.findUnique({ where: { id: PLATFORM_CONFIG_ID } }),
  ]);

  const commissionRate =
    operator?.commissionRate != null
      ? new Prisma.Decimal(operator.commissionRate)
      : config?.commissionRate != null
        ? new Prisma.Decimal(config.commissionRate)
        : new Prisma.Decimal(envCommissionRate());

  const multipliers = config
    ? {
        ADULT: Number(config.adultMultiplier),
        CHILD: Number(config.childMultiplier),
        INFANT: Number(config.infantMultiplier),
      }
    : undefined;

  const serviceFee = config?.serviceFeeType
    ? { type: config.serviceFeeType, value: Number(config.serviceFeeValue) }
    : null;

  return { commissionRate, multipliers, serviceFee };
}

/** Resolve just the effective commission rate (see resolvePlatformPricing). */
export async function resolveCommissionRate(
  operatorId: string,
  tx: Prisma.TransactionClient = prisma,
): Promise<Prisma.Decimal> {
  return (await resolvePlatformPricing(operatorId, tx)).commissionRate;
}
