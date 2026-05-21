/**
 * Real-world operator + schedule data for Padangbai ↔ Gili Islands.
 *
 * Pure data + a `seedRealData()` function that can be called from:
 *   - `npm run db:seed:real` (CLI, via `prisma/seed-real.ts`)
 *   - `/api/admin/seed-real?token=...` (one-off URL endpoint for prod)
 *
 * Idempotent (upserts), additive (does not delete existing data).
 *
 * Source: published contract rates table for Padang Bai fast-boat
 * operators. ONE WAY price is per passenger IDR.
 */

import bcrypt from "bcryptjs";
import { prisma } from "./db";
import { generateLegsForSchedule } from "./legs";
import { generateSeatLayout } from "./seat-map";

const PORT_PADANGBAI = "Padang Bai";

type SeedOperator = {
  key: string;
  email: string;
  companyName: string;
  contactPerson: string;
  phoneNumber: string;
};

const OPERATORS: SeedOperator[] = [
  { key: "eka-jaya", email: "eka-jaya@gilijet.local", companyName: "PT. BALI EKA JAYA", contactPerson: "Bali Eka Jaya", phoneNumber: "+62 361 234 5670" },
  { key: "wijaya", email: "wijaya@gilijet.local", companyName: "PT. WIJAYA BUYUK ABADI", contactPerson: "Wijaya Buyuk Abadi", phoneNumber: "+62 361 234 5671" },
  { key: "golden-queen", email: "golden-queen@gilijet.local", companyName: "PT. GOLDEN QUEEN BALI", contactPerson: "Golden Queen Bali", phoneNumber: "+62 361 234 5672" },
  { key: "ostina", email: "ostina@gilijet.local", companyName: "PT. OSTINA", contactPerson: "Ostina", phoneNumber: "+62 361 234 5673" },
  { key: "inami", email: "inami@gilijet.local", companyName: "PT. INAMI CRUISE", contactPerson: "Inami Cruise", phoneNumber: "+62 361 234 5674" },
  { key: "gili-gili", email: "gili-gili@gilijet.local", companyName: "PT. GILI GILI FASTBOAT", contactPerson: "Gili Gili Fastboat", phoneNumber: "+62 361 234 5675" },
  { key: "wahana", email: "wahana@gilijet.local", companyName: "PT. WAHANA GILI OCEAN", contactPerson: "Wahana Gili Ocean", phoneNumber: "+62 361 234 5676" },
];

type SeedBoat = {
  reg: string;
  name: string;
  operatorKey: string;
  capacity: number;
  description: string;
};

const BOATS: SeedBoat[] = [
  { reg: "EKA-JAYA-I", name: "EKA JAYA I", operatorKey: "eka-jaya", capacity: 80, description: "Premium fast boat — Padang Bai ↔ Gili / Bangsal." },
  { reg: "EKA-JAYA-II", name: "EKA JAYA II", operatorKey: "eka-jaya", capacity: 80, description: "Premium fast boat — afternoon Padang Bai departures." },
  { reg: "WIJAYA-I", name: "WIJAYA I", operatorKey: "wijaya", capacity: 60, description: "Daily Padang Bai ↔ Gili route." },
  { reg: "WIJAYA-II", name: "WIJAYA II", operatorKey: "wijaya", capacity: 60, description: "Daily reverse Gili → Padang Bai route." },
  { reg: "GOLDEN-QUEEN-I", name: "GOLDEN QUEEN I", operatorKey: "golden-queen", capacity: 60, description: "Confirmation-only departures." },
  { reg: "GOLDEN-QUEEN-II", name: "GOLDEN QUEEN II", operatorKey: "golden-queen", capacity: 60, description: "Confirmation-only departures." },
  { reg: "OSTINA", name: "OSTINA", operatorKey: "ostina", capacity: 50, description: "Confirmation-only — competitive flat pricing." },
  { reg: "INAMI-LUXURY", name: "INAMI LUXURY", operatorKey: "inami", capacity: 50, description: "Luxury cruise with AC cabin." },
  { reg: "GILI-GILI-FASTBOAT", name: "GILI-GILI FASTBOAT", operatorKey: "gili-gili", capacity: 60, description: "Daily fast boat." },
  { reg: "WAHANA-VIRENDRA", name: "WAHANA VIRENDRA", operatorKey: "wahana", capacity: 60, description: "Inter-island including Gili-to-Gili hops." },
];

type SeedSchedule = {
  boatReg: string;
  origin: string;
  destination: string;
  time: string;
  duration: number;
  price: number;
};

const SCHEDULES: SeedSchedule[] = [
  { boatReg: "EKA-JAYA-I", origin: PORT_PADANGBAI, destination: "Gili Trawangan", time: "08:30", duration: 90, price: 385000 },
  { boatReg: "EKA-JAYA-I", origin: PORT_PADANGBAI, destination: "Gili Air", time: "08:30", duration: 115, price: 385000 },
  { boatReg: "EKA-JAYA-I", origin: PORT_PADANGBAI, destination: "Bangsal", time: "08:30", duration: 135, price: 385000 },
  { boatReg: "WIJAYA-II", origin: "Gili Trawangan", destination: PORT_PADANGBAI, time: "09:00", duration: 180, price: 225000 },
  { boatReg: "GOLDEN-QUEEN-II", origin: PORT_PADANGBAI, destination: "Gili Trawangan", time: "09:00", duration: 120, price: 250000 },
  { boatReg: "GOLDEN-QUEEN-II", origin: PORT_PADANGBAI, destination: "Gili Air", time: "09:00", duration: 150, price: 250000 },
  { boatReg: "GOLDEN-QUEEN-II", origin: PORT_PADANGBAI, destination: "Bangsal", time: "09:00", duration: 165, price: 250000 },
  { boatReg: "OSTINA", origin: PORT_PADANGBAI, destination: "Gili Trawangan", time: "09:00", duration: 120, price: 250000 },
  { boatReg: "OSTINA", origin: PORT_PADANGBAI, destination: "Gili Air", time: "09:00", duration: 150, price: 250000 },
  { boatReg: "OSTINA", origin: PORT_PADANGBAI, destination: "Bangsal", time: "09:00", duration: 165, price: 250000 },
  { boatReg: "WIJAYA-I", origin: PORT_PADANGBAI, destination: "Gili Trawangan", time: "09:30", duration: 120, price: 225000 },
  { boatReg: "WIJAYA-I", origin: PORT_PADANGBAI, destination: "Gili Air", time: "09:30", duration: 150, price: 225000 },
  { boatReg: "WIJAYA-I", origin: PORT_PADANGBAI, destination: "Bangsal", time: "09:30", duration: 180, price: 225000 },
  { boatReg: "WIJAYA-II", origin: "Gili Air", destination: PORT_PADANGBAI, time: "09:30", duration: 150, price: 225000 },
  { boatReg: "INAMI-LUXURY", origin: PORT_PADANGBAI, destination: "Gili Trawangan", time: "09:30", duration: 120, price: 250000 },
  { boatReg: "INAMI-LUXURY", origin: PORT_PADANGBAI, destination: "Gili Air", time: "09:30", duration: 150, price: 250000 },
  { boatReg: "INAMI-LUXURY", origin: PORT_PADANGBAI, destination: "Bangsal", time: "09:30", duration: 180, price: 250000 },
  { boatReg: "GOLDEN-QUEEN-I", origin: PORT_PADANGBAI, destination: "Gili Trawangan", time: "09:30", duration: 120, price: 250000 },
  { boatReg: "GOLDEN-QUEEN-I", origin: PORT_PADANGBAI, destination: "Gili Air", time: "09:30", duration: 165, price: 250000 },
  { boatReg: "GOLDEN-QUEEN-I", origin: PORT_PADANGBAI, destination: "Bangsal", time: "09:30", duration: 180, price: 250000 },
  { boatReg: "GILI-GILI-FASTBOAT", origin: PORT_PADANGBAI, destination: "Gili Trawangan", time: "09:30", duration: 120, price: 250000 },
  { boatReg: "GILI-GILI-FASTBOAT", origin: PORT_PADANGBAI, destination: "Gili Air", time: "09:30", duration: 150, price: 250000 },
  { boatReg: "GILI-GILI-FASTBOAT", origin: PORT_PADANGBAI, destination: "Bangsal", time: "09:30", duration: 180, price: 250000 },
  { boatReg: "WAHANA-VIRENDRA", origin: "Gili Trawangan", destination: "Gili Air", time: "09:30", duration: 10, price: 275000 },
  { boatReg: "WAHANA-VIRENDRA", origin: "Gili Trawangan", destination: "Bangsal", time: "09:30", duration: 30, price: 275000 },
  { boatReg: "WAHANA-VIRENDRA", origin: "Gili Trawangan", destination: PORT_PADANGBAI, time: "09:30", duration: 105, price: 275000 },
  { boatReg: "EKA-JAYA-I", origin: "Gili Trawangan", destination: PORT_PADANGBAI, time: "10:00", duration: 180, price: 385000 },
  { boatReg: "WIJAYA-II", origin: "Bangsal", destination: PORT_PADANGBAI, time: "10:00", duration: 120, price: 225000 },
  { boatReg: "WAHANA-VIRENDRA", origin: "Gili Air", destination: PORT_PADANGBAI, time: "10:00", duration: 75, price: 275000 },
  { boatReg: "EKA-JAYA-I", origin: "Gili Air", destination: PORT_PADANGBAI, time: "10:30", duration: 150, price: 385000 },
  { boatReg: "WAHANA-VIRENDRA", origin: "Bangsal", destination: PORT_PADANGBAI, time: "10:30", duration: 45, price: 275000 },
  { boatReg: "EKA-JAYA-I", origin: "Bangsal", destination: PORT_PADANGBAI, time: "11:00", duration: 120, price: 385000 },
  { boatReg: "GOLDEN-QUEEN-I", origin: "Gili Trawangan", destination: PORT_PADANGBAI, time: "11:30", duration: 180, price: 250000 },
  { boatReg: "GOLDEN-QUEEN-II", origin: "Gili Trawangan", destination: PORT_PADANGBAI, time: "11:30", duration: 120, price: 250000 },
  { boatReg: "OSTINA", origin: "Gili Trawangan", destination: PORT_PADANGBAI, time: "11:30", duration: 120, price: 250000 },
  { boatReg: "GOLDEN-QUEEN-II", origin: "Gili Air", destination: PORT_PADANGBAI, time: "11:45", duration: 105, price: 250000 },
  { boatReg: "OSTINA", origin: "Gili Air", destination: PORT_PADANGBAI, time: "11:45", duration: 105, price: 250000 },
  { boatReg: "WIJAYA-I", origin: "Gili Trawangan", destination: PORT_PADANGBAI, time: "12:00", duration: 150, price: 225000 },
  { boatReg: "INAMI-LUXURY", origin: "Gili Trawangan", destination: PORT_PADANGBAI, time: "12:00", duration: 120, price: 250000 },
  { boatReg: "GOLDEN-QUEEN-II", origin: "Bangsal", destination: PORT_PADANGBAI, time: "12:00", duration: 90, price: 250000 },
  { boatReg: "OSTINA", origin: "Bangsal", destination: PORT_PADANGBAI, time: "12:00", duration: 90, price: 250000 },
  { boatReg: "WIJAYA-I", origin: "Gili Air", destination: PORT_PADANGBAI, time: "12:15", duration: 135, price: 225000 },
  { boatReg: "INAMI-LUXURY", origin: "Gili Air", destination: PORT_PADANGBAI, time: "12:15", duration: 105, price: 250000 },
  { boatReg: "GOLDEN-QUEEN-I", origin: "Gili Air", destination: PORT_PADANGBAI, time: "12:15", duration: 135, price: 250000 },
  { boatReg: "WIJAYA-I", origin: "Bangsal", destination: PORT_PADANGBAI, time: "12:30", duration: 120, price: 225000 },
  { boatReg: "INAMI-LUXURY", origin: "Bangsal", destination: PORT_PADANGBAI, time: "12:30", duration: 90, price: 250000 },
  { boatReg: "GOLDEN-QUEEN-I", origin: "Bangsal", destination: PORT_PADANGBAI, time: "12:30", duration: 120, price: 250000 },
  { boatReg: "EKA-JAYA-II", origin: PORT_PADANGBAI, destination: "Gili Trawangan", time: "13:00", duration: 90, price: 385000 },
  { boatReg: "EKA-JAYA-II", origin: PORT_PADANGBAI, destination: "Gili Air", time: "13:00", duration: 140, price: 385000 },
  { boatReg: "EKA-JAYA-II", origin: PORT_PADANGBAI, destination: "Bangsal", time: "13:00", duration: 165, price: 385000 },
  { boatReg: "WIJAYA-II", origin: PORT_PADANGBAI, destination: "Gili Trawangan", time: "13:00", duration: 90, price: 225000 },
  { boatReg: "WAHANA-VIRENDRA", origin: PORT_PADANGBAI, destination: "Gili Trawangan", time: "13:30", duration: 90, price: 250000 },
  { boatReg: "WAHANA-VIRENDRA", origin: PORT_PADANGBAI, destination: "Gili Air", time: "13:30", duration: 120, price: 250000 },
  { boatReg: "WAHANA-VIRENDRA", origin: PORT_PADANGBAI, destination: "Bangsal", time: "13:30", duration: 135, price: 250000 },
  { boatReg: "EKA-JAYA-II", origin: "Gili Trawangan", destination: PORT_PADANGBAI, time: "15:00", duration: 150, price: 385000 },
  { boatReg: "EKA-JAYA-II", origin: "Gili Air", destination: PORT_PADANGBAI, time: "15:20", duration: 130, price: 385000 },
  { boatReg: "EKA-JAYA-II", origin: "Bangsal", destination: PORT_PADANGBAI, time: "15:45", duration: 105, price: 385000 },
  { boatReg: "WAHANA-VIRENDRA", origin: "Gili Trawangan", destination: PORT_PADANGBAI, time: "15:30", duration: 120, price: 275000 },
  { boatReg: "WAHANA-VIRENDRA", origin: "Gili Air", destination: PORT_PADANGBAI, time: "15:45", duration: 105, price: 275000 },
  { boatReg: "WAHANA-VIRENDRA", origin: "Bangsal", destination: PORT_PADANGBAI, time: "16:00", duration: 90, price: 275000 },
];

export type SeedRealResult = {
  operators: number;
  boats: number;
  schedules: number;
  legsGenerated: number;
  operatorEmails: string[];
};

export async function seedRealData(opts: {
  defaultPassword?: string;
} = {}): Promise<SeedRealResult> {
  const opPasswordHash = await bcrypt.hash(
    opts.defaultPassword ?? "changeme123",
    12,
  );

  // Operators
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

  // Boats
  const boatIds: Record<string, string> = {};
  for (const b of BOATS) {
    const opId = operatorIds[b.operatorKey];
    if (!opId) continue;
    const seatLayout = generateSeatLayout(b.capacity);
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
        seatLayout,
      },
      update: {
        operatorId: opId,
        name: b.name,
        capacity: b.capacity,
        description: b.description,
        seatLayout,
        status: "ACTIVE",
      },
    });
    boatIds[b.reg] = row.id;
  }

  // Schedules
  const pricingTiers = [
    { minOccupancyPct: 50, multiplier: 1.1 },
    { minOccupancyPct: 80, multiplier: 1.25 },
  ];

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
            pricingTiers,
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
            pricingTiers,
          },
        });
    scheduleIds.push(row.id);
  }

  // Generate upcoming legs
  let totalLegs = 0;
  for (const sid of scheduleIds) {
    const n = await generateLegsForSchedule(sid);
    totalLegs += n;
  }

  return {
    operators: OPERATORS.length,
    boats: BOATS.length,
    schedules: scheduleIds.length,
    legsGenerated: totalLegs,
    operatorEmails: OPERATORS.map((o) => o.email),
  };
}
