import { Prisma, PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

import { generateLegsForSchedule } from "../lib/legs";
import { buildQrPayload, signTicketCode } from "../lib/qr";
import { newBookingReference, newTicketCode } from "../lib/references";
import { computeBookingPrice } from "../lib/pricing";
import { computeRefundDeadline } from "../lib/refunds";

const prisma = new PrismaClient();

async function main() {
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "admin@gilijet.local";
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

  const boat = await prisma.boat.upsert({
    where: { registrationNumber: "SAMPLE-001" },
    create: {
      operatorId: operator.id,
      name: "Sample Express I",
      registrationNumber: "SAMPLE-001",
      capacity: 50,
      photos: [],
      description: "Sample boat seeded for development.",
      status: "ACTIVE",
    },
    update: {},
  });
  console.log(`✓ boat: ${boat.name} (cap ${boat.capacity})`);

  let schedule = await prisma.schedule.findFirst({
    where: { boatId: boat.id, originPort: "Sanur" },
  });
  if (!schedule) {
    schedule = await prisma.schedule.create({
      data: {
        boatId: boat.id,
        originPort: "Sanur",
        destinationPort: "Nusa Penida",
        departureTime: "09:00",
        durationMinutes: 45,
        basePrice: 250000,
        daysOfWeek: [1, 2, 3, 4, 5, 6, 7],
        status: "ACTIVE",
      },
    });
    console.log(`✓ schedule: ${schedule.originPort} → ${schedule.destinationPort}`);
  } else {
    console.log(
      `✓ schedule (exists): ${schedule.originPort} → ${schedule.destinationPort}`,
    );
  }

  // Phase 3 needs concrete departures and a couple of test tickets so the
  // scanner has something real to validate.
  const generated = await generateLegsForSchedule(schedule.id);
  if (generated > 0) console.log(`✓ generated ${generated} upcoming legs`);

  if (process.env.SEED_DEMO_BOOKINGS !== "0") {
    const upcomingLeg = await prisma.leg.findFirst({
      where: { scheduleId: schedule.id, status: "OPEN" },
      orderBy: { departureDate: "asc" },
    });
    if (upcomingLeg) {
      const demoBookings = await prisma.booking.count({
        where: { legId: upcomingLeg.id, customerEmail: "demo@gilijet.local" },
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
  const price = computeBookingPrice({
    unitPrice: args.unitPrice,
    quantity: args.passengers.length,
  });

  const ref = newBookingReference();
  const booking = await prisma.booking.create({
    data: {
      bookingReference: ref,
      legId,
      customerName: args.customerName,
      customerEmail: "demo@gilijet.local",
      customerPhone: "+6281200000000",
      totalAmount: price.totalAmount,
      commissionAmount: price.commissionAmount,
      operatorAmount: price.operatorAmount,
      status: "CONFIRMED",
      refundDeadline: computeRefundDeadline(departureDate),
      payment: {
        create: {
          amount: price.totalAmount,
          method: "qris",
          status: "SUCCESSFUL",
          paidAt: new Date(),
          gatewayProvider: "xendit",
        },
      },
    },
  });

  await prisma.leg.update({
    where: { id: legId },
    data: { availableSeats: { decrement: args.passengers.length } },
  });

  for (let i = 0; i < args.passengers.length; i++) {
    const ticketCode = newTicketCode(ref, i + 1);
    const qrHash = signTicketCode(ticketCode);
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
      `   • ${ticketCode}  →  QR payload: ${buildQrPayload(ticketCode)}`,
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
