/**
 * Operator + schedule data for PT WAHANA VIRENDRA GROUP.
 *
 * Source: the operator's own published price schedule (24 public sailings).
 * This replaced an earlier set of researched competitor rates, which were
 * plausible but not anyone's actual timetable.
 *
 * WHAT THE SOURCE HAS THAT THE SCHEMA DOES NOT, so nobody reads these prices
 * as the operator's full commercial terms:
 *
 *  - Seasons. The price list carries Low / High / Peak (High ~1.11x Low, Peak
 *    ~1.33-1.56x). Schedule holds a single basePrice, so only Low is seeded.
 *  - Return fares, ~1.93x the one-way. Bookings here are per one-way leg.
 *  - Per-route child pricing. Child is 0.73x adult on Sanur-Penida but the
 *    full adult fare on every Padang Bai / Gili sailing. PlatformConfig has one
 *    childMultiplier per operator, so it cannot express both.
 *  - On-request private charters (a separate price list): no departure time,
 *    max 5 pax. Nothing in the schema models an unscheduled charter.
 *
 * Vessels are inferred: the source names no boat and gives no capacity, but its
 * BATCH column is a rotation — every sailing in a batch is one vessel's run for
 * the day. Capacity is an assumption, flagged on each boat.
 *
 * All prices are PUBLISH (rack) rates in IDR — what customers pay.
 * Commission is computed at booking time by lib/pricing.ts.
 *
 * Idempotent (upserts), additive (does not delete existing data).
 */

import bcrypt from "bcryptjs";
import { prisma } from "./db";
import { generateLegsForSchedule, seasonSeedParams } from "./legs";

// ============ PORT CONSTANTS ============

const P = {
  PADANG_BAI:    "Padang Bai",
  SERANGAN:      "Serangan",
  SANUR:         "Sanur",
  AMED:          "Amed",
  PENIDA:        "Nusa Penida",
  LEMBONGAN:     "Nusa Lembongan",
  GILI_T:        "Gili Trawangan",
  GILI_AIR:      "Gili Air",
  GILI_MENO:     "Gili Meno",
  GILI_GEDE:     "Gili Gede",
  BANGSAL:       "Bangsal",
  SENGGIGI:      "Senggigi",
  KUTA_LOMBOK:   "Kuta Lombok",
  KAYANGAN:      "Kayangan",
  LEMBAR:        "Lembar",
  LABUAN_BAJO:   "Labuan Bajo",
  KOMODO:        "Komodo Island",
} as const;

// ============ REAL OPERATORS ============

type SeedOperator = {
  key: string;
  email: string;
  companyName: string;
  contactPerson: string;
  phoneNumber: string;
};

const OPERATORS: SeedOperator[] = [
  {
    key: "wahana-virendra",
    email: "wahana-virendra@gilijet.local",
    companyName: "PT WAHANA VIRENDRA GROUP",
    contactPerson: "Wahana Virendra Group",
    phoneNumber: "+62 361 300 1000",
  },
];

// ============ BOATS ============

type SeedBoat = {
  reg: string;
  name: string;
  operatorKey: string;
  capacity: number;
  description: string;
};

// Capacity is not in the source price list. 60 is a working assumption for a
// fast boat on these routes; correct it against the operator's real manifest
// before trusting seat counts for anything but a demo.
const BOATS: SeedBoat[] = [
  { reg: "WVG-B1", name: "Wahana Penida 1", operatorKey: "wahana-virendra", capacity: 60, description: "Sanur ↔ Nusa Penida, first rotation (07:00 out)." },
  { reg: "WVG-B2", name: "Wahana Penida 2", operatorKey: "wahana-virendra", capacity: 60, description: "Sanur ↔ Nusa Penida, second rotation (07:30 out)." },
  { reg: "WVG-B3", name: "Wahana Penida 3", operatorKey: "wahana-virendra", capacity: 60, description: "Sanur ↔ Nusa Penida, third rotation (09:00 out)." },
  { reg: "WVG-B4", name: "Wahana Penida 4", operatorKey: "wahana-virendra", capacity: 60, description: "Sanur ↔ Nusa Penida, fourth rotation (09:30 out)." },
  { reg: "WVG-B5", name: "Wahana Penida 5", operatorKey: "wahana-virendra", capacity: 60, description: "Sanur ↔ Nusa Penida, fifth rotation (11:00 out)." },
  { reg: "WVG-B6", name: "Wahana Penida 6", operatorKey: "wahana-virendra", capacity: 60, description: "Sanur ↔ Nusa Penida, sixth rotation (15:00 out)." },
  { reg: "WVG-A1", name: "Wahana Gili 1",   operatorKey: "wahana-virendra", capacity: 60, description: "Padang Bai ↔ Gili Trawangan / Gili Air / Senggigi, morning rotation." },
  { reg: "WVG-A2", name: "Wahana Gili 2",   operatorKey: "wahana-virendra", capacity: 60, description: "Padang Bai ↔ Gili Trawangan / Gili Air / Senggigi, afternoon rotation." },
];

// ============ SCHEDULES ============

type SeedSchedule = {
  boatReg: string;
  origin: string;
  destination: string;
  time: string;
  duration: number;
  price: number;
};

// Adult / Low season / one-way — the only combination Schedule can hold.
// Times, durations and transit calls are verbatim from the operator's list.
const SCHEDULES: SeedSchedule[] = [
  // ── WVG-B1 — Sanur ↔ Nusa Penida, rotation 1 ──
  { boatReg: "WVG-B1", origin: P.SANUR,        destination: P.PENIDA,       time: "07:00", duration:  60, price: 150_000 },
  { boatReg: "WVG-B1", origin: P.PENIDA,       destination: P.SANUR,        time: "08:00", duration:  60, price: 150_000 },

  // ── WVG-B2 — Sanur ↔ Nusa Penida, rotation 2 ──
  { boatReg: "WVG-B2", origin: P.SANUR,        destination: P.PENIDA,       time: "07:30", duration:  60, price: 150_000 },
  { boatReg: "WVG-B2", origin: P.PENIDA,       destination: P.SANUR,        time: "08:30", duration:  60, price: 150_000 },

  // ── WVG-B3 — Sanur ↔ Nusa Penida, rotation 3 ──
  { boatReg: "WVG-B3", origin: P.SANUR,        destination: P.PENIDA,       time: "09:00", duration:  60, price: 150_000 },
  { boatReg: "WVG-B3", origin: P.PENIDA,       destination: P.SANUR,        time: "10:00", duration:  60, price: 150_000 },

  // ── WVG-B4 — Sanur ↔ Nusa Penida, rotation 4 ──
  { boatReg: "WVG-B4", origin: P.SANUR,        destination: P.PENIDA,       time: "09:30", duration:  60, price: 150_000 },
  { boatReg: "WVG-B4", origin: P.PENIDA,       destination: P.SANUR,        time: "14:00", duration:  60, price: 150_000 },

  // ── WVG-B5 — Sanur ↔ Nusa Penida, rotation 5 ──
  { boatReg: "WVG-B5", origin: P.SANUR,        destination: P.PENIDA,       time: "11:00", duration:  60, price: 150_000 },
  { boatReg: "WVG-B5", origin: P.PENIDA,       destination: P.SANUR,        time: "15:00", duration:  60, price: 150_000 },

  // ── WVG-B6 — Sanur ↔ Nusa Penida, rotation 6 ──
  { boatReg: "WVG-B6", origin: P.SANUR,        destination: P.PENIDA,       time: "15:00", duration:  60, price: 150_000 },
  { boatReg: "WVG-B6", origin: P.PENIDA,       destination: P.SANUR,        time: "16:30", duration:  60, price: 150_000 },

  // ── WVG-A1 — Padang Bai ↔ Gili / Senggigi, rotation 1 ──
  { boatReg: "WVG-A1", origin: P.PADANG_BAI,   destination: P.GILI_AIR,     time: "08:30", duration: 120, price: 450_000 },  // calls Gili Trawangan
  { boatReg: "WVG-A1", origin: P.PADANG_BAI,   destination: P.GILI_T,       time: "08:30", duration:  90, price: 450_000 },
  { boatReg: "WVG-A1", origin: P.PADANG_BAI,   destination: P.SENGGIGI,     time: "08:30", duration: 165, price: 450_000 },  // calls Gili Trawangan, Gili Air
  { boatReg: "WVG-A1", origin: P.GILI_T,       destination: P.PADANG_BAI,   time: "10:00", duration: 165, price: 450_000 },  // calls Gili Air, Senggigi (Lombok)
  { boatReg: "WVG-A1", origin: P.GILI_AIR,     destination: P.PADANG_BAI,   time: "10:30", duration: 135, price: 450_000 },  // calls Senggigi (Lombok)
  { boatReg: "WVG-A1", origin: P.SENGGIGI,     destination: P.PADANG_BAI,   time: "11:15", duration:  90, price: 450_000 },

  // ── WVG-A2 — Padang Bai ↔ Gili / Senggigi, rotation 2 ──
  { boatReg: "WVG-A2", origin: P.PADANG_BAI,   destination: P.GILI_AIR,     time: "13:00", duration: 120, price: 450_000 },  // calls Gili Trawangan
  { boatReg: "WVG-A2", origin: P.PADANG_BAI,   destination: P.GILI_T,       time: "13:00", duration:  90, price: 450_000 },
  { boatReg: "WVG-A2", origin: P.PADANG_BAI,   destination: P.SENGGIGI,     time: "13:00", duration: 165, price: 450_000 },  // calls Gili Trawangan, Gili Air
  { boatReg: "WVG-A2", origin: P.GILI_T,       destination: P.PADANG_BAI,   time: "14:30", duration: 165, price: 450_000 },  // calls Gili Air, Senggigi (Lombok)
  { boatReg: "WVG-A2", origin: P.GILI_AIR,     destination: P.PADANG_BAI,   time: "15:00", duration: 135, price: 450_000 },  // calls Senggigi (Lombok)
  { boatReg: "WVG-A2", origin: P.SENGGIGI,     destination: P.PADANG_BAI,   time: "15:45", duration:  90, price: 450_000 },
];

// ============ SEED FUNCTION ============

export type SeedRealResult = {
  operators: number;
  boats: number;
  schedules: number;
  legsGenerated: number;
  urgencyLegs: number;
  todayLegCount: number;
  operatorEmails: string[];
};

export async function seedRealData(opts: {
  defaultPassword?: string;
} = {}): Promise<SeedRealResult> {
  const opPasswordHash = await bcrypt.hash(
    opts.defaultPassword ?? "changeme123",
    12,
  );

  // ── 0. Passenger-type multipliers ──
  // The source prices infants free and children at 110,000 against an adult
  // 150,000 on Sanur–Penida, so 0.7333. It charges the full adult fare for
  // children on the Padang Bai / Gili sailings, which a single per-operator
  // multiplier cannot also express — those child fares seed 27% light.
  await prisma.platformConfig.upsert({
    where: { id: "default" },
    create: { id: "default", childMultiplier: 0.7333, infantMultiplier: 0 },
    update: { childMultiplier: 0.7333, infantMultiplier: 0 },
  });

  // ── 1. Operators ──
  const operatorIds: Record<string, string> = {};
  for (const op of OPERATORS) {
    const row = await prisma.operator.upsert({
      where: { email: op.email },
      create: {
        email: op.email,
        passwordHash: opPasswordHash,
        companyName: op.companyName,
        contactPerson: op.contactPerson,
        phoneNumber: op.phoneNumber,
        status: "ACTIVE",
        documentsVerified: true,
        bankAccountInfo: {
          bankName: "BCA",
          accountNumber: "0000000000",
          accountHolder: op.companyName,
        },
      },
      update: {
        companyName: op.companyName,
        contactPerson: op.contactPerson,
        phoneNumber: op.phoneNumber,
        status: "ACTIVE",
      },
    });
    operatorIds[op.key] = row.id;
  }

  // ── 2. Boats ──
  const boatIds: Record<string, string> = {};
  for (const b of BOATS) {
    const opId = operatorIds[b.operatorKey];
    if (!opId) continue;
    const row = await prisma.boat.upsert({
      where: { registrationNumber: b.reg },
      create: {
        operatorId: opId,
        name: b.name,
        registrationNumber: b.reg,
        capacity: b.capacity,
        photos: [],
        description: b.description,
        status: "ACTIVE",
      },
      update: {
        operatorId: opId,
        name: b.name,
        capacity: b.capacity,
        description: b.description,
        status: "ACTIVE",
      },
    });
    boatIds[b.reg] = row.id;
  }

  // ── 3. Schedules ──
  const scheduleIds: string[] = [];
  for (const s of SCHEDULES) {
    const boatId = boatIds[s.boatReg];
    if (!boatId) continue;
    const existing = await prisma.schedule.findFirst({
      where: {
        boatId,
        originPort: s.origin,
        destinationPort: s.destination,
        departureTime: s.time,
      },
    });
    const row = existing
      ? await prisma.schedule.update({
          where: { id: existing.id },
          data: {
            durationMinutes: s.duration,
            basePrice: s.price,
            daysOfWeek: [1, 2, 3, 4, 5, 6, 7],
            status: "ACTIVE",
          },
        })
      : await prisma.schedule.create({
          data: {
            boatId,
            originPort: s.origin,
            destinationPort: s.destination,
            departureTime: s.time,
            durationMinutes: s.duration,
            basePrice: s.price,
            daysOfWeek: [1, 2, 3, 4, 5, 6, 7],
            status: "ACTIVE",
          },
        });
    scheduleIds.push(row.id);
  }

  // ── 6. Generate upcoming legs (next 14 days from 06:00 WITA today) ──
  // Use 06:00 WITA today as the reference point so morning departures
  // always generate even when seeding in the afternoon or evening.
  const nowWita = (() => {
    const n = new Date();
    const witaOffset = n.getTimezoneOffset() + 480; // minutes from UTC to WITA
    const witaMs = n.getTime() + witaOffset * 60_000;
    const witaDate = new Date(witaMs);
    witaDate.setHours(6, 0, 0, 0); // 06:00 WITA
    return new Date(witaDate.getTime() - 8 * 3_600_000); // back to UTC
  })();

  // Fill the whole remaining July–August season (clamped in generateLegs).
  const { startAt, daysAhead } = seasonSeedParams(nowWita);
  let totalLegs = 0;
  for (const sid of scheduleIds) {
    const n = await generateLegsForSchedule(sid, daysAhead, startAt);
    totalLegs += n;
  }

  // ── 7. Create urgency: near-future legs with scarcity ──
  const realNow = new Date();
  const urgencyWindow = new Date(realNow.getTime() + 12 * 60 * 60 * 1000); // next 12h

  const nearLegs = await prisma.leg.findMany({
    where: {
      status: "OPEN",
      availableSeats: { gte: 3 },
      departureDate: { gte: realNow, lte: urgencyWindow },
    },
    orderBy: { departureDate: "asc" },
    take: 30,
  });

  let urgencyLegs = 0;
  for (let i = 0; i < nearLegs.length; i++) {
    const leg = nearLegs[i];
    // First 3 legs: force them to depart within 1-2 hours, only 1-3 seats left
    if (leg && i < 3) {
      const minutesFromNow = 30 + i * 25; // +30m, +55m, +80m
      const newDeparture = new Date(realNow.getTime() + minutesFromNow * 60_000);
      await prisma.leg.update({
        where: { id: leg.id },
        data: {
          departureDate: newDeparture,
          availableSeats: i + 1, // 1, 2, or 3 seats
        },
      });
      urgencyLegs++;
      continue;
    }
    // Remaining legs: moderate scarcity (2-4 seats available)
    const remaining = Math.min(leg.availableSeats, Math.max(1, Math.floor(Math.random() * 4) + 1));
    if (remaining >= leg.availableSeats) continue;
    const seatsToRemove = leg.availableSeats - remaining;
    await prisma.leg.update({
      where: { id: leg.id },
      data: { availableSeats: remaining },
    });
    urgencyLegs++;
  }

  // ── 8. Count today's departures ──
  const todayEnd = new Date(realNow);
  todayEnd.setHours(23, 59, 59, 999);
  const todayLegCount = await prisma.leg.count({
    where: {
      status: "OPEN",
      departureDate: { gte: realNow, lte: todayEnd },
    },
  });

  return {
    operators: OPERATORS.length,
    boats: BOATS.length,
    schedules: scheduleIds.length,
    legsGenerated: totalLegs,
    urgencyLegs,
    todayLegCount,
    operatorEmails: OPERATORS.map((o) => o.email),
  };
}
