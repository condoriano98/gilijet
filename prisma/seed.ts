import { Prisma, PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

import { generateLegsForSchedule, seasonSeedParams } from "../lib/legs";
import { activeSchedule } from "../lib/operator-data";
import { ymdInZone } from "../lib/datetime";
import { buildQrPayload, signTicketCode } from "../lib/qr";
import { newBookingReference, newTicketCode } from "../lib/references";
import { computeBookingPrice } from "../lib/pricing";
import { computeRefundDeadline } from "../lib/refunds";

const prisma = new PrismaClient();

async function main() {
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "admin@gilifast.local";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "changeme123";
  const operatorEmail =
    process.env.SEED_OPERATOR_EMAIL ?? "operator@example.com";
  const operatorPassword =
    process.env.SEED_OPERATOR_PASSWORD ?? "changeme123";

  const adminHash = await bcrypt.hash(adminPassword, 12);
  const opHash = await bcrypt.hash(operatorPassword, 12);

  const admin = await prisma.admin.upsert({
    where: { email: adminEmail },
    create: {
      email: adminEmail,
      passwordHash: adminHash,
      fullName: "Platform Admin",
      role: "SUPER_ADMIN",
    },
    update: {},
  });
  console.log(`✓ admin: ${admin.email}`);

  const operator = await prisma.operator.upsert({
    where: { email: operatorEmail },
    create: {
      email: operatorEmail,
      passwordHash: opHash,
      companyName: "Sanur Fast Boats (sample)",
      contactPerson: "Wayan Putra",
      phoneNumber: "+6281234567890",
      status: "ACTIVE",
      documentsVerified: true,
      bankAccountInfo: {
        bankName: "BCA",
        accountNumber: "1234567890",
        accountHolder: "Sanur Fast Boats",
      },
    },
    update: {},
  });
  console.log(`✓ operator: ${operator.email} (${operator.status})`);

  // A second operator so the marketplace has variety.
  const operator2Email = "demo2@gilifast.local";
  const operator2 = await prisma.operator.upsert({
    where: { email: operator2Email },
    create: {
      email: operator2Email,
      passwordHash: opHash,
      companyName: "Gili Getaway Express (sample)",
      contactPerson: "Made Surya",
      phoneNumber: "+6281298765432",
      status: "ACTIVE",
      documentsVerified: true,
      bankAccountInfo: {
        bankName: "Mandiri",
        accountNumber: "9876543210",
        accountHolder: "Gili Getaway Express",
      },
    },
    update: {},
  });
  console.log(`✓ operator: ${operator2.email} (${operator2.status})`);

  // -------- Boats --------
  const BOATS: Array<{
    operatorId: string;
    name: string;
    registrationNumber: string;
    capacity: number;
    description: string;
  }> = [
    {
      operatorId: operator.id,
      name: "Sanur Express I",
      registrationNumber: "SAMPLE-001",
      capacity: 50,
      description: "Fast boat, AC cabin, life jackets included.",
    },
    {
      operatorId: operator.id,
      name: "Sanur Express II",
      registrationNumber: "SAMPLE-002",
      capacity: 80,
      description: "Larger fast boat with open deck.",
    },
    {
      operatorId: operator2.id,
      name: "Gili Cat I",
      registrationNumber: "SAMPLE-003",
      capacity: 60,
      description: "Premium fast boat with WiFi and snacks.",
    },
    {
      operatorId: operator2.id,
      name: "Gili Cat II",
      registrationNumber: "SAMPLE-004",
      capacity: 45,
      description: "Speedboat with reclining seats.",
    },
  ];

  const boats: Record<string, { id: string; capacity: number }> = {};
  for (const b of BOATS) {
    const boat = await prisma.boat.upsert({
      where: { registrationNumber: b.registrationNumber },
      create: {
        operatorId: b.operatorId,
        name: b.name,
        registrationNumber: b.registrationNumber,
        capacity: b.capacity,
        photos: [],
        description: b.description,
        status: "ACTIVE",
      },
      update: {},
    });
    boats[b.registrationNumber] = { id: boat.id, capacity: boat.capacity };
    console.log(`✓ boat: ${boat.name} (cap ${boat.capacity})`);
  }

  // -------- Schedules --------
  const SCHEDULES: Array<{
    boatReg: string;
    originPort: string;
    destinationPort: string;
    departureTime: string;
    durationMinutes: number;
    basePrice: number;
  }> = [
    // Sanur Fast Boats — Bali ↔ Nusa Islands
    {
      boatReg: "SAMPLE-001",
      originPort: "Sanur",
      destinationPort: "Nusa Penida",
      departureTime: "09:00",
      durationMinutes: 45,
      basePrice: 250000,
    },
    {
      boatReg: "SAMPLE-001",
      originPort: "Nusa Penida",
      destinationPort: "Sanur",
      departureTime: "16:00",
      durationMinutes: 45,
      basePrice: 250000,
    },
    {
      boatReg: "SAMPLE-002",
      originPort: "Sanur",
      destinationPort: "Nusa Lembongan",
      departureTime: "10:30",
      durationMinutes: 35,
      basePrice: 200000,
    },
    {
      boatReg: "SAMPLE-002",
      originPort: "Nusa Lembongan",
      destinationPort: "Sanur",
      departureTime: "15:30",
      durationMinutes: 35,
      basePrice: 200000,
    },
    // Gili Getaway — Bali ↔ Gili Islands ↔ Lombok
    {
      boatReg: "SAMPLE-003",
      originPort: "Padang Bai",
      destinationPort: "Gili Trawangan",
      departureTime: "08:00",
      durationMinutes: 150,
      basePrice: 425000,
    },
    {
      boatReg: "SAMPLE-003",
      originPort: "Padang Bai",
      destinationPort: "Gili Air",
      departureTime: "08:00",
      durationMinutes: 135,
      basePrice: 425000,
    },
    {
      boatReg: "SAMPLE-003",
      originPort: "Gili Trawangan",
      destinationPort: "Padang Bai",
      departureTime: "11:30",
      durationMinutes: 150,
      basePrice: 425000,
    },
    {
      boatReg: "SAMPLE-004",
      originPort: "Padang Bai",
      destinationPort: "Lombok",
      departureTime: "13:00",
      durationMinutes: 180,
      basePrice: 395000,
    },
    {
      boatReg: "SAMPLE-004",
      originPort: "Bangsal",
      destinationPort: "Gili Trawangan",
      departureTime: "09:30",
      durationMinutes: 25,
      basePrice: 85000,
    },
    {
      boatReg: "SAMPLE-004",
      originPort: "Bangsal",
      destinationPort: "Gili Air",
      departureTime: "12:00",
      durationMinutes: 20,
      basePrice: 85000,
    },
  ];

  const allSchedules: Array<{ id: string; originPort: string; destinationPort: string }> = [];
  for (const s of SCHEDULES) {
    // Without deletedAt this matches a retired schedule and hands it back to
    // generateLegsForSchedule below, which resurrects it: hidden from search
    // but with live legs that /book/[legId] will still sell.
    const existing = await prisma.schedule.findFirst({
      where: {
        boatId: boats[s.boatReg].id,
        originPort: s.originPort,
        destinationPort: s.destinationPort,
        departureTime: s.departureTime,
        ...activeSchedule,
      },
    });
    // Yield pricing: prices increase when >50% full (+10%) or >80% full (+25%)
    const pricingTiers = [
      { minOccupancyPct: 50, multiplier: 1.1 },
      { minOccupancyPct: 80, multiplier: 1.25 },
    ];
    const schedule =
      existing ??
      (await prisma.schedule.create({
        data: {
          boatId: boats[s.boatReg].id,
          originPort: s.originPort,
          destinationPort: s.destinationPort,
          departureTime: s.departureTime,
          durationMinutes: s.durationMinutes,
          basePrice: s.basePrice,
          daysOfWeek: [1, 2, 3, 4, 5, 6, 7],
          status: "ACTIVE",
          pricingTiers,
        },
      }));
    allSchedules.push({
      id: schedule.id,
      originPort: schedule.originPort,
      destinationPort: schedule.destinationPort,
    });
    console.log(
      `✓ schedule: ${schedule.originPort} → ${schedule.destinationPort} @ ${s.departureTime}`,
    );
  }

  // Backwards-compat: the demo booking block below expects a single named `schedule`.
  const schedule = await prisma.schedule.findFirstOrThrow({
    where: {
      boatId: boats["SAMPLE-001"].id,
      originPort: "Sanur",
      destinationPort: "Nusa Penida",
    },
  });

  // Phase 3 needs concrete departures and a couple of test tickets so the
  // scanner has something real to validate.
  const { startAt, daysAhead } = seasonSeedParams();
  let totalGenerated = 0;
  for (const s of allSchedules) {
    const n = await generateLegsForSchedule(s.id, daysAhead, startAt);
    totalGenerated += n;
  }
  if (totalGenerated > 0) {
    console.log(`✓ generated ${totalGenerated} upcoming legs across ${allSchedules.length} schedules`);
  }

  if (process.env.SEED_DEMO_BOOKINGS !== "0") {
    const upcomingLeg = await prisma.leg.findFirst({
      where: { scheduleId: schedule.id, status: "OPEN" },
      orderBy: { departureDate: "asc" },
    });
    if (upcomingLeg) {
      const demoBookings = await prisma.booking.count({
        where: { legId: upcomingLeg.id, customerEmail: "demo@gilifast.local" },
      });
      if (demoBookings === 0) {
        await seedDemoBooking(upcomingLeg.id, upcomingLeg.departureDate, {
          customerName: "Demo Andika",
          passengers: ["Demo Andika", "Demo Sari"],
          unitPrice: Number(upcomingLeg.basePrice),
        });
        await seedDemoBooking(upcomingLeg.id, upcomingLeg.departureDate, {
          customerName: "Demo Made",
          passengers: ["Demo Made"],
          unitPrice: Number(upcomingLeg.basePrice),
        });
        console.log(
          "✓ 2 demo bookings + 3 tickets created on the next upcoming leg",
        );
      }
    }
  }

  console.log("\nLogin credentials (change in production):");
  console.log(`  admin    → ${adminEmail} / ${adminPassword}`);
  console.log(`  operator → ${operatorEmail} / ${operatorPassword}`);
  console.log(
    "\nTip: ticket QR payloads are emitted to stdout for any newly-created demo bookings,",
  );
  console.log(
    "     copy/paste one into https://www.the-qrcode-generator.com to test the scanner.",
  );
}

async function seedDemoBooking(
  legId: string,
  departureDate: Date,
  args: {
    customerName: string;
    passengers: string[];
    unitPrice: number;
  },
): Promise<void> {
  const leg = await prisma.leg.findUniqueOrThrow({ where: { id: legId } });
  const price = computeBookingPrice({
    unitPrice: args.unitPrice,
    quantity: args.passengers.length,
  });

  const ref = newBookingReference();
  const booking = await prisma.booking.create({
    data: {
      bookingReference: ref,
      legId,
      operatorId: leg.operatorId,
      customerName: args.customerName,
      customerEmail: "demo@gilifast.local",
      customerPhone: "+6281200000000",
      totalAmount: price.totalAmount,
      commissionAmount: price.commissionAmount,
      operatorAmount: price.operatorAmount,
      status: "CONFIRMED",
      refundDeadline: computeRefundDeadline(departureDate),
      payment: {
        create: {
          amount: price.totalAmount,
          method: "QRIS",
          status: "SUCCESSFUL",
          paidAt: new Date(),
          gatewayProvider: "DOKU",
        },
      },
    },
  });

  await prisma.leg.update({
    where: { id: legId },
    data: { availableSeats: { decrement: args.passengers.length } },
  });

  const departureYmd = ymdInZone(departureDate);
  for (let i = 0; i < args.passengers.length; i++) {
    const ticketCode = newTicketCode(ref, i + 1);
    const qrHash = signTicketCode(ticketCode, departureYmd);
    await prisma.ticket.create({
      data: {
        bookingId: booking.id,
        ticketCode,
        passengerName: args.passengers[i],
        qrHash,
        status: "ISSUED",
      },
    });
    console.log(
      `   • ${ticketCode}  →  QR payload: ${buildQrPayload(ticketCode, departureDate)}`,
    );
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
