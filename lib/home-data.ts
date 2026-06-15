import { prisma } from "./db";

// =================== Departing soon ===================

export type DepartingSoon = {
  legId: string;
  origin: string;
  destination: string;
  departureUtc: string;
  availableSeats: number;
  totalCapacity: number;
  priceIDR: number;
  operatorName: string;
  boatName: string;
};

export async function getDepartingSoon(
  args: { hoursAhead?: number; limit?: number } = {},
): Promise<DepartingSoon[]> {
  const hoursAhead = args.hoursAhead ?? 12;
  const limit = args.limit ?? 8;
  const now = new Date();
  const end = new Date(now.getTime() + hoursAhead * 60 * 60 * 1000);

  const legs = await prisma.leg.findMany({
    where: {
      status: "OPEN",
      availableSeats: { gte: 1 },
      departureDate: { gte: now, lte: end },
      schedule: { deletedAt: null, boat: { deletedAt: null } },
    },
    include: {
      schedule: {
        include: {
          boat: { include: { operator: true } },
        },
      },
    },
    orderBy: { departureDate: "asc" },
    take: limit,
  });

  return legs.map((leg) => ({
    legId: leg.id,
    origin: leg.schedule.originPort,
    destination: leg.schedule.destinationPort,
    departureUtc: leg.departureDate.toISOString(),
    availableSeats: leg.availableSeats,
    totalCapacity: leg.totalCapacity,
    priceIDR: Number(leg.basePrice),
    operatorName: leg.schedule.boat.operator.companyName,
    boatName: leg.schedule.boat.name,
  }));
}

// =================== Popular routes ===================

export type PopularRoute = {
  origin: string;
  destination: string;
  cheapestPriceIDR: number;
  operatorCount: number;
  durationMinutes: number;
  legCount: number;
};

/** Used when the DB query returns nothing — keeps the home page honest. */
export const POPULAR_ROUTES_FALLBACK: PopularRoute[] = [
  { origin: "Sanur", destination: "Nusa Penida", cheapestPriceIDR: 250_000, operatorCount: 5, durationMinutes: 45, legCount: 8 },
  { origin: "Padang Bai", destination: "Gili Trawangan", cheapestPriceIDR: 425_000, operatorCount: 4, durationMinutes: 150, legCount: 6 },
  { origin: "Sanur", destination: "Nusa Lembongan", cheapestPriceIDR: 200_000, operatorCount: 3, durationMinutes: 35, legCount: 5 },
  { origin: "Padang Bai", destination: "Lombok", cheapestPriceIDR: 395_000, operatorCount: 3, durationMinutes: 180, legCount: 4 },
  { origin: "Bangsal", destination: "Gili Trawangan", cheapestPriceIDR: 85_000, operatorCount: 6, durationMinutes: 25, legCount: 10 },
  { origin: "Labuan Bajo", destination: "Komodo", cheapestPriceIDR: 750_000, operatorCount: 2, durationMinutes: 180, legCount: 3 },
];

export async function getPopularRoutes(limit = 6): Promise<PopularRoute[]> {
  const now = new Date();
  const end = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

  const legs = await prisma.leg.findMany({
    where: {
      status: "OPEN",
      departureDate: { gte: now, lte: end },
      schedule: { deletedAt: null, boat: { deletedAt: null } },
    },
    select: {
      basePrice: true,
      schedule: {
        select: {
          originPort: true,
          destinationPort: true,
          durationMinutes: true,
          boat: { select: { operatorId: true } },
        },
      },
    },
  });

  if (legs.length === 0) return POPULAR_ROUTES_FALLBACK.slice(0, limit);

  const groups = new Map<
    string,
    {
      origin: string;
      destination: string;
      cheapest: number;
      operators: Set<string>;
      durationSum: number;
      legs: number;
    }
  >();

  for (const leg of legs) {
    const key = `${leg.schedule.originPort}|${leg.schedule.destinationPort}`;
    const price = Number(leg.basePrice);
    const existing = groups.get(key);
    if (existing) {
      existing.cheapest = Math.min(existing.cheapest, price);
      existing.operators.add(leg.schedule.boat.operatorId);
      existing.durationSum += leg.schedule.durationMinutes;
      existing.legs += 1;
    } else {
      groups.set(key, {
        origin: leg.schedule.originPort,
        destination: leg.schedule.destinationPort,
        cheapest: price,
        operators: new Set([leg.schedule.boat.operatorId]),
        durationSum: leg.schedule.durationMinutes,
        legs: 1,
      });
    }
  }

  return Array.from(groups.values())
    .map((g) => ({
      origin: g.origin,
      destination: g.destination,
      cheapestPriceIDR: g.cheapest,
      operatorCount: g.operators.size,
      durationMinutes: Math.round(g.durationSum / g.legs),
      legCount: g.legs,
    }))
    .sort((a, b) => b.legCount - a.legCount || a.origin.localeCompare(b.origin))
    .slice(0, limit);
}

// =================== Recent reviews ===================

export type HomeReview = {
  id: string;
  customerFirstName: string;
  rating: number;
  text: string;
  origin: string;
  destination: string;
  createdAt: string; // ISO
};

function firstNameOf(full: string): string {
  const trimmed = full.trim();
  if (!trimmed) return "Anonymous";
  return trimmed.split(/\s+/)[0]!;
}

export async function getRecentReviews(limit = 8): Promise<HomeReview[]> {
  const since = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);

  const rows = await prisma.review.findMany({
    where: {
      rating: { gte: 4 },
      text: { not: null },
      createdAt: { gte: since },
    },
    include: {
      customer: { select: { fullName: true } },
      schedule: { select: { originPort: true, destinationPort: true } },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return rows
    .filter((r) => (r.text ?? "").trim().length > 0)
    .map((r) => ({
      id: r.id,
      customerFirstName: firstNameOf(r.customer.fullName),
      rating: r.rating,
      text: r.text!.trim(),
      origin: r.schedule.originPort,
      destination: r.schedule.destinationPort,
      createdAt: r.createdAt.toISOString(),
    }));
}

// =================== Active promotion ===================

export type ActivePromo = {
  id: string;
  code: string;
  discountType: string;
  discountValue: number;
  description: string | null;
  expiresAt: string | null; // ISO
};

export async function getActivePromo(): Promise<ActivePromo | null> {
  const now = new Date();
  const promo = await prisma.promotion.findFirst({
    where: {
      isActive: true,
      OR: [{ expiresAt: { gt: now } }, { expiresAt: null }],
    },
    orderBy: { createdAt: "desc" },
  });
  if (!promo) return null;
  return {
    id: promo.id,
    code: promo.code,
    discountType: promo.discountType,
    discountValue: Number(promo.discountValue),
    description: promo.description,
    expiresAt: promo.expiresAt?.toISOString() ?? null,
  };
}

export type TrustNumbers = {
  bookingsLast30Days: number;
  averageRating: number;
  totalReviews: number;
  activeOperators: number;
};

/** Minimum value below which each line is suppressed (open question 4 — recommended defaults). */
export const TRUST_THRESHOLDS = {
  bookings: 100,
  reviews: 50,
  operators: 10,
};

export async function getTrustNumbers(): Promise<TrustNumbers> {
  const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [bookings30, reviewAgg, activeOps] = await Promise.all([
    prisma.booking.count({
      where: { status: "CONFIRMED", createdAt: { gte: since30 } },
    }),
    prisma.review.aggregate({
      _avg: { rating: true },
      _count: { _all: true },
    }),
    prisma.operator.count({
      where: { status: "ACTIVE", deletedAt: null },
    }),
  ]);

  return {
    bookingsLast30Days: bookings30,
    averageRating: Number((reviewAgg._avg.rating ?? 0).toFixed(1)),
    totalReviews: reviewAgg._count._all,
    activeOperators: activeOps,
  };
}

// =================== Auto-seed on empty DB ===================

type SeedStatus = {
  state: "ready" | "seeding" | "empty";
  message: string;
};

let _cachedSeedStatus: SeedStatus | null = null;
let _seedPromise: Promise<void> | null = null;

/**
 * Check if the database has legs, and trigger seeding if it doesn't.
 * Safe to call on every page render — idempotent, fast when DB is populated.
 * If seeding is already in progress, returns immediately with "seeding" status.
 */
export async function maybeAutoSeed(): Promise<SeedStatus> {
  if (_cachedSeedStatus?.state === "ready") return _cachedSeedStatus;

  try {
    const legCount = await prisma.leg.count();
    if (legCount > 0) {
      _cachedSeedStatus = { state: "ready", message: `${legCount} departures available` };
      return _cachedSeedStatus;
    }
  } catch {
    return { state: "empty", message: "Database unreachable" };
  }

  // No legs. Check if we at least have schedules (schema was pushed).
  try {
    const scheduleCount = await prisma.schedule.count();
    if (scheduleCount === 0) {
      _cachedSeedStatus = { state: "empty", message: "No schedules found. Run prisma db push." };
      return _cachedSeedStatus;
    }
  } catch {
    return { state: "empty", message: "Database unreachable" };
  }

  // Schedules exist but no legs — trigger seed if not already running.
  if (!_seedPromise) {
    _seedPromise = (async () => {
      try {
        const { seedRealData } = await import("./seed-data");
        await seedRealData();
        _cachedSeedStatus = { state: "ready", message: "Departures loaded" };
      } catch (err) {
        console.error("[home-data] seed failed:", err);
        _cachedSeedStatus = { state: "empty", message: "Seed failed — check server logs" };
      } finally {
        _seedPromise = null;
      }
    })();
  }

  if (!_cachedSeedStatus) {
    _cachedSeedStatus = { state: "seeding", message: "Preparing departures for you..." };
  }
  return _cachedSeedStatus;
}
