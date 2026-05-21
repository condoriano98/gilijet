/**
 * Real-world operator + schedule seed for Padangbai ↔ Gili Islands.
 *
 * Run with: npm run db:seed:real
 *
 * Idempotent — uses upsert/findFirst so re-running is safe. Adds real
 * companies on top of any existing seed data (does not delete demo).
 *
 * Source: published contract rates table for Padang Bai fast-boat
 * operators. ONE WAY price is per passenger IDR.
 *
 * Note on multi-destination departures: many of these boats sail one
 * physical voyage that calls at Gili Trawangan, Gili Air, then Bangsal.
 * The schema models each (origin, destination) pair as its own Schedule,
 * which means seat inventory is tracked per-segment. For the MVP this is
 * acceptable; a future "voyage" abstraction would unify them.
 */

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { generateLegsForSchedule } from "../lib/legs";
import { generateSeatLayout } from "../lib/seat-map";

const prisma = new PrismaClient();

// Default capacity per fast-boat (real-world: 40-80 — we pick 60 as a sane default)
const DEFAULT_CAPACITY = 60;

const PORT_PADANGBAI = "Padang Bai";

type SeedOperator = {
  key: string;
  email: string;
  companyName: string;
  contactPerson: string;
  phoneNumber: string;
};

const OPERATORS: SeedOperator[] = [
  {
    key: "eka-jaya",
    email: "eka-jaya@gilijet.local",
    companyName: "PT. BALI EKA JAYA",
    contactPerson: "Bali Eka Jaya",
    phoneNumber: "+62 361 234 5670",
  },
  {
    key: "wijaya",
    email: "wijaya@gilijet.local",
    companyName: "PT. WIJAYA BUYUK ABADI",
    contactPerson: "Wijaya Buyuk Abadi",
    phoneNumber: "+62 361 234 5671",
  },
  {
    key: "golden-queen",
    email: "golden-queen@gilijet.local",
    companyName: "PT. GOLDEN QUEEN BALI",
    contactPerson: "Golden Queen Bali",
    phoneNumber: "+62 361 234 5672",
  },
  {
    key: "ostina",
    email: "ostina@gilijet.local",
    companyName: "PT. OSTINA",
    contactPerson: "Ostina",
    phoneNumber: "+62 361 234 5673",
  },
  {
    key: "inami",
    email: "inami@gilijet.local",
    companyName: "PT. INAMI CRUISE",
    contactPerson: "Inami Cruise",
    phoneNumber: "+62 361 234 5674",
  },
  {
    key: "gili-gili",
    email: "gili-gili@gilijet.local",
    companyName: "PT. GILI GILI FASTBOAT",
    contactPerson: "Gili Gili Fastboat",
    phoneNumber: "+62 361 234 5675",
  },
  {
    key: "wahana",
    email: "wahana@gilijet.local",
    companyName: "PT. WAHANA GILI OCEAN",
    contactPerson: "Wahana Gili Ocean",
    phoneNumber: "+62 361 234 5676",
  },
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
  /** HH:MM */
  time: string;
  /** Minutes */
  duration: number;
  /** IDR */
  price: number;
};

// Parsed from the published contract-rates table.
const SCHEDULES: SeedSchedule[] = [
  // EKA JAYA I — 08:30 from Padang Bai (calls Gili T → Gili Air → Bangsal)
  { boatReg: "EKA-JAYA-I", origin: PORT_PADANGBAI, destination: "Gili Trawangan", time: "08:30", duration: 90, price: 385000 },
  { boatReg: "EKA-JAYA-I", origin: PORT_PADANGBAI, destination: "Gili Air", time: "08:30", duration: 115, price: 385000 },
  { boatReg: "EKA-JAYA-I", origin: PORT_PADANGBAI, destination: "Bangsal", time: "08:30", duration: 135, price: 385000 },
  // WIJAYA II — Gili Trawangan → Padang Bai 09:00
  { boatReg: "WIJAYA-II", origin: "Gili Trawangan", destination: PORT_PADANGBAI, time: "09:00", duration: 180, price: 225000 },
  // GOLDEN QUEEN II — Padang Bai 09:00
  { boatReg: "GOLDEN-QUEEN-II", origin: PORT_PADANGBAI, destination: "Gili Trawangan", time: "09:00", duration: 120, price: 250000 },
  { boatReg: "GOLDEN-QUEEN-II", origin: PORT_PADANGBAI, destination: "Gili Air", time: "09:00", duration: 150, price: 250000 },
  { boatReg: "GOLDEN-QUEEN-II", origin: PORT_PADANGBAI, destination: "Bangsal", time: "09:00", duration: 165, price: 250000 },
  // OSTINA — Padang Bai 09:00
  { boatReg: "OSTINA", origin: PORT_PADANGBAI, destination: "Gili Trawangan", time: "09:00", duration: 120, price: 250000 },
  { boatReg: "OSTINA", origin: PORT_PADANGBAI, destination: "Gili Air", time: "09:00", duration: 150, price: 250000 },
  { boatReg: "OSTINA", origin: PORT_PADANGBAI, destination: "Bangsal", time: "09:00", duration: 165, price: 250000 },
  // WIJAYA I — Padang Bai 09:30
  { boatReg: "WIJAYA-I", origin: PORT_PADANGBAI, destination: "Gili Trawangan", time: "09:30", duration: 120, price: 225000 },
  { boatReg: "WIJAYA-I", origin: PORT_PADANGBAI, destination: "Gili Air", time: "09:30", duration: 150, price: 225000 },
  { boatReg: "WIJAYA-I", origin: PORT_PADANGBAI, destination: "Bangsal", time: "09:30", duration: 180, price: 225000 },
  // WIJAYA II — Gili Air → Padang Bai 09:30
  { boatReg: "WIJAYA-II", origin: "Gili Air", destination: PORT_PADANGBAI, time: "09:30", duration: 150, price: 225000 },
  // INAMI LUXURY — Padang Bai 09:30
  { boatReg: "INAMI-LUXURY", origin: PORT_PADANGBAI, destination: "Gili Trawangan", time: "09:30", duration: 120, price: 250000 },
  { boatReg: "INAMI-LUXURY", origin: PORT_PADANGBAI, destination: "Gili Air", time: "09:30", duration: 150, price: 250000 },
  { boatReg: "INAMI-LUXURY", origin: PORT_PADANGBAI, destination: "Bangsal", time: "09:30", duration: 180, price: 250000 },
  // GOLDEN QUEEN I — Padang Bai 09:30
  { boatReg: "GOLDEN-QUEEN-I", origin: PORT_PADANGBAI, destination: "Gili Trawangan", time: "09:30", duration: 120, price: 250000 },
  { boatReg: "GOLDEN-QUEEN-I", origin: PORT_PADANGBAI, destination: "Gili Air", time: "09:30", duration: 165, price: 250000 },
  { boatReg: "GOLDEN-QUEEN-I", origin: PORT_PADANGBAI, destination: "Bangsal", time: "09:30", duration: 180, price: 250000 },
  // GILI-GILI FASTBOAT — Padang Bai 09:30
  { boatReg: "GILI-GILI-FASTBOAT", origin: PORT_PADANGBAI, destination: "Gili Trawangan", time: "09:30", duration: 120, price: 250000 },
  { boatReg: "GILI-GILI-FASTBOAT", origin: PORT_PADANGBAI, destination: "Gili Air", time: "09:30", duration: 150, price: 250000 },
  { boatReg: "GILI-GILI-FASTBOAT", origin: PORT_PADANGBAI, destination: "Bangsal", time: "09:30", duration: 180, price: 250000 },
  // WAHANA VIRENDRA — Gili Trawangan 09:30 (short hops + return)
  { boatReg: "WAHANA-VIRENDRA", origin: "Gili Trawangan", destination: "Gili Air", time: "09:30", duration: 10, price: 275000 },
  { boatReg: "WAHANA-VIRENDRA", origin: "Gili Trawangan", destination: "Bangsal", time: "09:30", duration: 30, price: 275000 },
  { boatReg: "WAHANA-VIRENDRA", origin: "Gili Trawangan", destination: PORT_PADANGBAI, time: "09:30", duration: 105, price: 275000 },
  // EKA JAYA I — Gili Trawangan → Padang Bai 10:00
  { boatReg: "EKA-JAYA-I", origin: "Gili Trawangan", destination: PORT_PADANGBAI, time: "10:00", duration: 180, price: 385000 },
  // WIJAYA II — Bangsal → Padang Bai 10:00
  { boatReg: "WIJAYA-II", origin: "Bangsal", destination: PORT_PADANGBAI, time: "10:00", duration: 120, price: 225000 },
  // WAHANA VIRENDRA — Gili Air → Padang Bai 10:00
  { boatReg: "WAHANA-VIRENDRA", origin: "Gili Air", destination: PORT_PADANGBAI, time: "10:00", duration: 75, price: 275000 },
  // EKA JAYA I — Gili Air → Padang Bai 10:30
  { boatReg: "EKA-JAYA-I", origin: "Gili Air", destination: PORT_PADANGBAI, time: "10:30", duration: 150, price: 385000 },
  // WAHANA VIRENDRA — Bangsal → Padang Bai 10:30
  { boatReg: "WAHANA-VIRENDRA", origin: "Bangsal", destination: PORT_PADANGBAI, time: "10:30", duration: 45, price: 275000 },
  // EKA JAYA I — Bangsal → Padang Bai 11:00
  { boatReg: "EKA-JAYA-I", origin: "Bangsal", destination: PORT_PADANGBAI, time: "11:00", duration: 120, price: 385000 },
  // GOLDEN QUEEN I & II — returns 11:30
  { boatReg: "GOLDEN-QUEEN-I", origin: "Gili Trawangan", destination: PORT_PADANGBAI, time: "11:30", duration: 180, price: 250000 },
  { boatReg: "GOLDEN-QUEEN-II", origin: "Gili Trawangan", destination: PORT_PADANGBAI, time: "11:30", duration: 120, price: 250000 },
  // OSTINA — Gili Trawangan → Padang Bai 11:30
  { boatReg: "OSTINA", origin: "Gili Trawangan", destination: PORT_PADANGBAI, time: "11:30", duration: 120, price: 250000 },
  // 11:45
  { boatReg: "GOLDEN-QUEEN-II", origin: "Gili Air", destination: PORT_PADANGBAI, time: "11:45", duration: 105, price: 250000 },
  { boatReg: "OSTINA", origin: "Gili Air", destination: PORT_PADANGBAI, time: "11:45", duration: 105, price: 250000 },
  // 12:00 — WIJAYA I, INAMI, GOLDEN QUEEN II, OSTINA
  { boatReg: "WIJAYA-I", origin: "Gili Trawangan", destination: PORT_PADANGBAI, time: "12:00", duration: 150, price: 225000 },
  { boatReg: "INAMI-LUXURY", origin: "Gili Trawangan", destination: PORT_PADANGBAI, time: "12:00", duration: 120, price: 250000 },
  { boatReg: "GOLDEN-QUEEN-II", origin: "Bangsal", destination: PORT_PADANGBAI, time: "12:00", duration: 90, price: 250000 },
  { boatReg: "OSTINA", origin: "Bangsal", destination: PORT_PADANGBAI, time: "12:00", duration: 90, price: 250000 },
  // 12:15
  { boatReg: "WIJAYA-I", origin: "Gili Air", destination: PORT_PADANGBAI, time: "12:15", duration: 135, price: 225000 },
  { boatReg: "INAMI-LUXURY", origin: "Gili Air", destination: PORT_PADANGBAI, time: "12:15", duration: 105, price: 250000 },
  { boatReg: "GOLDEN-QUEEN-I", origin: "Gili Air", destination: PORT_PADANGBAI, time: "12:15", duration: 135, price: 250000 },
  // 12:30
  { boatReg: "WIJAYA-I", origin: "Bangsal", destination: PORT_PADANGBAI, time: "12:30", duration: 120, price: 225000 },
  { boatReg: "INAMI-LUXURY", origin: "Bangsal", destination: PORT_PADANGBAI, time: "12:30", duration: 90, price: 250000 },
  { boatReg: "GOLDEN-QUEEN-I", origin: "Bangsal", destination: PORT_PADANGBAI, time: "12:30", duration: 120, price: 250000 },
  // 13:00 — EKA JAYA II, WIJAYA II
  { boatReg: "EKA-JAYA-II", origin: PORT_PADANGBAI, destination: "Gili Trawangan", time: "13:00", duration: 90, price: 385000 },
  { boatReg: "EKA-JAYA-II", origin: PORT_PADANGBAI, destination: "Gili Air", time: "13:00", duration: 140, price: 385000 },
  { boatReg: "EKA-JAYA-II", origin: PORT_PADANGBAI, destination: "Bangsal", time: "13:00", duration: 165, price: 385000 },
  { boatReg: "WIJAYA-II", origin: PORT_PADANGBAI, destination: "Gili Trawangan", time: "13:00", duration: 90, price: 225000 },
  // 13:30 — WAHANA VIRENDRA outbound
  { boatReg: "WAHANA-VIRENDRA", origin: PORT_PADANGBAI, destination: "Gili Trawangan", time: "13:30", duration: 90, price: 250000 },
  { boatReg: "WAHANA-VIRENDRA", origin: PORT_PADANGBAI, destination: "Gili Air", time: "13:30", duration: 120, price: 250000 },
  { boatReg: "WAHANA-VIRENDRA", origin: PORT_PADANGBAI, destination: "Bangsal", time: "13:30", duration: 135, price: 250000 },
  // 15:00 / 15:20 / 15:45 — EKA JAYA II reverse
  { boatReg: "EKA-JAYA-II", origin: "Gili Trawangan", destination: PORT_PADANGBAI, time: "15:00", duration: 150, price: 385000 },
  { boatReg: "EKA-JAYA-II", origin: "Gili Air", destination: PORT_PADANGBAI, time: "15:20", duration: 130, price: 385000 },
  { boatReg: "EKA-JAYA-II", origin: "Bangsal", destination: PORT_PADANGBAI, time: "15:45", duration: 105, price: 385000 },
  // WAHANA VIRENDRA evening returns
  { boatReg: "WAHANA-VIRENDRA", origin: "Gili Trawangan", destination: PORT_PADANGBAI, time: "15:30", duration: 120, price: 275000 },
  { boatReg: "WAHANA-VIRENDRA", origin: "Gili Air", destination: PORT_PADANGBAI, time: "15:45", duration: 105, price: 275000 },
  { boatReg: "WAHANA-VIRENDRA", origin: "Bangsal", destination: PORT_PADANGBAI, time: "16:00", duration: 90, price: 275000 },
];

async function main() {
  console.log("→ Seeding real Padang Bai ↔ Gili operators…\n");

  const opPasswordHash = await bcrypt.hash(
    process.env.SEED_OPERATOR_PASSWORD ?? "changeme123",
    12,
  );

  // ---- Operators ----
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
    console.log(`✓ operator: ${op.companyName}`);
  }

  // ---- Boats ----
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
    console.log(`✓ boat: ${row.name} (cap ${row.capacity})`);
  }

  // ---- Schedules ----
  const pricingTiers = [
    { minOccupancyPct: 50, multiplier: 1.1 },
    { minOccupancyPct: 80, multiplier: 1.25 },
  ];

  const scheduleIds: string[] = [];
  for (const s of SCHEDULES) {
    const boatId = boatIds[s.boatReg];
    if (!boatId) {
      console.warn(`! skip ${s.boatReg}: boat not seeded`);
      continue;
    }
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
    console.log(
      `✓ ${s.origin} → ${s.destination} @ ${s.time} · ${s.boatReg} · IDR ${s.price.toLocaleString("id-ID")} (${s.duration}m)`,
    );
  }

  // ---- Generate upcoming legs ----
  let totalLegs = 0;
  for (const sid of scheduleIds) {
    const n = await generateLegsForSchedule(sid);
    totalLegs += n;
  }

  console.log(`\n✓ Generated ${totalLegs} upcoming legs across ${scheduleIds.length} schedules`);
  console.log(`\nOperator login: any of the @gilijet.local emails / changeme123`);
  console.log(`Example: ${OPERATORS[0].email} / changeme123\n`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
