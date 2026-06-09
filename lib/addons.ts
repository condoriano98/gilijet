import { prisma } from "@/lib/db";

const INSURANCE_RATE_PER_PERSON = 25000;

export type InsuranceQuote = {
  perPerson: number;
  total: number;
  passengerCount: number;
};

export function computeInsuranceQuote(passengerCount: number): InsuranceQuote {
  return {
    perPerson: INSURANCE_RATE_PER_PERSON,
    total: INSURANCE_RATE_PER_PERSON * passengerCount,
    passengerCount,
  };
}

export const PICKUP_ZONES: Record<string, string[]> = {
  "Gili Trawangan": ["Gili T - North", "Gili T - South", "Gili T - East"],
  "Gili Air": ["Gili Air - West", "Gili Air - East"],
  "Nusa Penida": ["Nusa Penida - West", "Nusa Penida - East", "Nusa Penida - South"],
  "Nusa Lembongan": ["Nusa Lembongan - Jungut Batu", "Nusa Lembongan - Mushroom Bay"],
  Lombok: ["Senggigi", "Kuta Lombok", "Mataram", "Bangsal"],
  "Labuan Bajo": ["Labuan Bajo Town", "Labuan Bajo Airport"],
};

const PICKUP_FEE = 50000;

export function getPickupZones(destinationPort: string): string[] {
  return PICKUP_ZONES[destinationPort] ?? [];
}

export function getPickupFee(): number {
  return PICKUP_FEE;
}

export async function getSeaConditionForRoute(
  origin: string,
  destination: string,
): Promise<{ status: string; message: string | null } | null> {
  try {
    const key1 = `${origin}-${destination}`;
    const key2 = `${destination}-${origin}`;
    const condition = await prisma.seaCondition.findFirst({
      where: { routeKey: { in: [key1, key2] } },
    });
    if (!condition) return null;
    return { status: condition.status, message: condition.message };
  } catch {
    return null;
  }
}
