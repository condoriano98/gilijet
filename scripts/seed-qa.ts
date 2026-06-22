/**
 * Deterministic QA seed.
 *
 * Re-runs are safe — every row is upserted by a fixed natural key
 * (email / registrationNumber / a synthetic slug stored in a stable
 * field). The intent is that Playwright selectors and persona-tester
 * walkthroughs can rely on the same IDs across runs.
 *
 * Run: `pnpm seed:qa`
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

import { generateLegsForSchedule } from "../lib/legs";
import { ymdInZone } from "../lib/datetime";
import { signTicketCode } from "../lib/qr";
import { newBookingReference, newTicketCode } from "../lib/references";
import { computeBookingPrice } from "../lib/pricing";
import { computeRefundDeadline, snapshotCurrentPolicy } from "../lib/refunds";

const prisma = new PrismaClient();

const QA = {
  adminEmail: "qa-admin@gilijet.local",
  operatorEmail: "qa-operator@gilijet.local",
  customerEmail: "qa-customer@gilijet.local",
  password: "qaqaqaqa",
  boatReg: "QA-BOAT-001",
  schedules: [
    { originPort: "Sanur", destinationPort: "Nusa Penida", departureTime: "08:00" },
    { originPort: "Sanur", destinationPort: "Nusa Lembongan", departureTime: "10:00" },
    { originPort: "Nusa Penida", destinationPort: "Sanur", departureTime: "16:00" },
  ],
};

async function main() {
  const host = (process.env.DATABASE_URL ?? "").match(/@([^/:]+)/)?.[1] ?? "?";
  if (/prod|production/i.test(process.env.DATABASE_URL ?? "")) {
    throw new Error(
      `Refusing to QA-seed a production-looking DB (${host}). Set DATABASE_URL to a dev/test DB.`,
    );
  }

  const passHash = await bcrypt.hash(QA.password, 12);

  // -------- Admin --------
  const admin = await prisma.admin.upsert({
    where: { email: QA.adminEmail },
    create: {
      email: QA.adminEmail,
      passwordHash: passHash,
      fullName: "QA Admin",
      role: "SUPER_ADMIN",
    },
    update: { passwordHash: passHash },
  });
  console.log(`✓ admin    ${admin.email}`);

  // -------- Operator --------
  const operator = await prisma.operator.upsert({
    where: { email: QA.operatorEmail },
    create: {
      email: QA.operatorEmail,
      passwordHash: passHash,
      companyName: "QA Boats",
      contactPerson: "QA Operator",
      phoneNumber: "+6280000000001",
      status: "ACTIVE",
      documentsVerified: true,
      bankAccountInfo: {
        bankName: "QA Bank",
        accountNumber: "0000000000",
        accountHolder: "QA Boats",
      },
    },
    update: { passwordHash: passHash, status: "ACTIVE" },
  });
  console.log(`✓ operator ${operator.email}`);

  // -------- Customer --------
  const customer = await prisma.customer.upsert({
    where: { email: QA.customerEmail },
    create: {
      email: QA.customerEmail,
      passwordHash: passHash,
      fullName: "QA Customer",
      phoneNumber: "+6280000000002",
    },
    update: { passwordHash: passHash },
  });
  console.log(`✓ customer ${customer.email}`);

  // -------- Boat --------
  const boat = await prisma.boat.upsert({
    where: { registrationNumber: QA.boatReg },
    create: {
      operatorId: operator.id,
      name: "QA Boat",
      registrationNumber: QA.boatReg,
      capacity: 30,
      photos: [],
      description: "Deterministic QA boat — do not delete.",
      status: "ACTIVE",
    },
    update: { operatorId: operator.id, status: "ACTIVE" },
  });
  console.log(`✓ boat     ${boat.name} (${boat.registrationNumber})`);

  // -------- Schedules --------
  const scheduleIds: string[] = [];
  for (const s of QA.schedules) {
    const existing = await prisma.schedule.findFirst({
      where: {
        boatId: boat.id,
        originPort: s.originPort,
        destinationPort: s.destinationPort,
        departureTime: s.departureTime,
      },
    });
    const sch =
      existing ??
      (await prisma.schedule.create({
        data: {
          boatId: boat.id,
          originPort: s.originPort,
          destinationPort: s.destinationPort,
          departureTime: s.departureTime,
          durationMinutes: 45,
          basePrice: 250000,
          daysOfWeek: [1, 2, 3, 4, 5, 6, 7],
          status: "ACTIVE",
          pricingTiers: [],
        },
      }));
    scheduleIds.push(sch.id);
    console.log(
      `✓ schedule ${sch.originPort} → ${sch.destinationPort} @ ${s.departureTime}`,
    );
  }

  // -------- Legs --------
  let totalLegs = 0;
  for (const id of scheduleIds) {
    totalLegs += await generateLegsForSchedule(id);
  }
  console.log(`✓ legs     ${totalLegs} generated`);

  // -------- A paid booking on the first upcoming leg of schedule #1 --------
  const firstLeg = await prisma.leg.findFirst({
    where: { scheduleId: scheduleIds[0], status: "OPEN" },
    orderBy: { departureDate: "asc" },
  });

  if (firstLeg) {
    const existingBooking = await prisma.booking.findFirst({
      where: { legId: firstLeg.id, customerEmail: QA.customerEmail },
    });

    let bookingId = existingBooking?.id;
    if (!existingBooking) {
      const price = computeBookingPrice({
        unitPrice: Number(firstLeg.basePrice),
        quantity: 1,
      });
      const ref = newBookingReference();
      const booking = await prisma.booking.create({
        data: {
          bookingReference: ref,
          legId: firstLeg.id,
          operatorId: operator.id,
          customerId: customer.id,
          customerName: customer.fullName,
          customerEmail: QA.customerEmail,
          customerPhone: customer.phoneNumber ?? "+6280000000002",
          totalAmount: price.totalAmount,
          commissionAmount: price.commissionAmount,
          operatorAmount: price.operatorAmount,
          status: "CONFIRMED",
          refundDeadline: computeRefundDeadline(firstLeg.departureDate),
          refundPolicySnapshot: snapshotCurrentPolicy({
            departure: firstLeg.departureDate,
            deadline: computeRefundDeadline(firstLeg.departureDate),
          }),
          payment: {
            create: {
              amount: price.totalAmount,
              method: "QRIS",
              status: "SUCCESSFUL",
              paidAt: new Date(),
              gatewayProvider: "XENDIT",
            },
          },
        },
      });
      bookingId = booking.id;

      await prisma.leg.update({
        where: { id: firstLeg.id },
        data: { availableSeats: { decrement: 1 } },
      });

      const ticketCode = newTicketCode(ref, 1);
      await prisma.ticket.create({
        data: {
          bookingId: booking.id,
          ticketCode,
          passengerName: customer.fullName,
          qrHash: signTicketCode(ticketCode, ymdInZone(firstLeg.departureDate)),
          status: "ISSUED",
        },
      });
      console.log(`✓ booking  ${ref} (paid + 1 ticket)`);
    } else {
      console.log(`✓ booking  ${existingBooking.bookingReference} (exists)`);
    }

    // -------- A pending refund on that booking --------
    if (bookingId) {
      const existingRefund = await prisma.refund.findUnique({
        where: { bookingId },
      });
      if (!existingRefund) {
        const booking = await prisma.booking.findUniqueOrThrow({
          where: { id: bookingId },
        });
        await prisma.refund.create({
          data: {
            bookingId,
            originalAmount: booking.totalAmount,
            refundAmount: booking.totalAmount,
            reason: "CUSTOMER_REQUEST",
            status: "PENDING",
          },
        });
        console.log(`✓ refund   PENDING on booking ${booking.bookingReference}`);
      } else {
        console.log(`✓ refund   ${existingRefund.status} (exists)`);
      }
    }
  } else {
    console.warn(
      "⚠ no upcoming leg generated for the first QA schedule — skipping booking + refund seed",
    );
  }

  // -------- A second operator + boat + schedules --------
  // Gives "popular routes" multi-operator counts and "active operators" ≥ 2.
  const operator2 = await prisma.operator.upsert({
    where: { email: "qa-operator2@gilijet.local" },
    create: {
      email: "qa-operator2@gilijet.local",
      passwordHash: passHash,
      companyName: "Bali Fast Cruise",
      contactPerson: "QA Operator 2",
      phoneNumber: "+6280000000003",
      status: "ACTIVE",
      documentsVerified: true,
      bankAccountInfo: {
        bankName: "QA Bank",
        accountNumber: "0000000001",
        accountHolder: "Bali Fast Cruise",
      },
    },
    update: { passwordHash: passHash, status: "ACTIVE" },
  });

  const boat2 = await prisma.boat.upsert({
    where: { registrationNumber: "QA-BOAT-002" },
    create: {
      operatorId: operator2.id,
      name: "Bali Fast 2",
      registrationNumber: "QA-BOAT-002",
      capacity: 40,
      photos: [],
      description: "Second QA boat — for multi-operator route counts.",
      status: "ACTIVE",
    },
    update: { operatorId: operator2.id, status: "ACTIVE" },
  });

  const overlappingSchedules = [
    { originPort: "Sanur", destinationPort: "Nusa Penida", departureTime: "09:00" },
    { originPort: "Sanur", destinationPort: "Nusa Lembongan", departureTime: "11:00" },
  ];
  const schedule2Ids: string[] = [];
  for (const s of overlappingSchedules) {
    const existing = await prisma.schedule.findFirst({
      where: {
        boatId: boat2.id,
        originPort: s.originPort,
        destinationPort: s.destinationPort,
        departureTime: s.departureTime,
      },
    });
    const sch =
      existing ??
      (await prisma.schedule.create({
        data: {
          boatId: boat2.id,
          originPort: s.originPort,
          destinationPort: s.destinationPort,
          departureTime: s.departureTime,
          durationMinutes: 50,
          basePrice: 275000,
          daysOfWeek: [1, 2, 3, 4, 5, 6, 7],
          status: "ACTIVE",
          pricingTiers: [],
        },
      }));
    schedule2Ids.push(sch.id);
  }
  for (const id of schedule2Ids) {
    await generateLegsForSchedule(id);
  }
  console.log(
    `✓ operator ${operator2.email} + ${schedule2Ids.length} schedules`,
  );

  // -------- Reviewers (drives the reviews carousel + raises trust counts) --------
  const REVIEWERS: Array<{ name: string; rating: number; text: string }> = [
    {
      name: "Lina Pranata",
      rating: 5,
      text: "Booking was effortless and the boat left exactly on time. QR e-ticket scanned in seconds at the dock — best fast-boat experience I've had to the Gilis.",
    },
    {
      name: "Budi Santoso",
      rating: 5,
      text: "Refund policy is the clearest I've seen in Indonesian transport. Crew was friendly and the crossing was smooth even in choppy water.",
    },
    {
      name: "Sarah Whitfield",
      rating: 4,
      text: "Loved the price transparency — no hidden fees at the dock. Boarding could be a bit faster but the boat itself was clean and comfortable.",
    },
    {
      name: "Made Suweca",
      rating: 5,
      text: "I use Gilijet weekly for work. Reliable schedules, instant tickets, and customer support actually responds within minutes on WhatsApp.",
    },
    {
      name: "Anya Kusuma",
      rating: 5,
      text: "Sanur to Nusa Penida in under an hour — perfect day trip. The e-ticket reminder the morning of the trip was a nice touch.",
    },
  ];

  for (let i = 0; i < REVIEWERS.length; i++) {
    const r = REVIEWERS[i]!;
    const email = `reviewer-${i + 1}@gilijet.local`;

    const reviewer = await prisma.customer.upsert({
      where: { email },
      create: {
        email,
        passwordHash: passHash,
        fullName: r.name,
        phoneNumber: `+62800000010${i}`,
      },
      update: { fullName: r.name },
    });

    // Pick a leg from whichever schedule rotates through; use scheduleIds[i % 3].
    const targetScheduleId = scheduleIds[i % scheduleIds.length]!;
    const leg = await prisma.leg.findFirst({
      where: { scheduleId: targetScheduleId, status: "OPEN" },
      orderBy: { departureDate: "asc" },
      skip: i,
    });
    if (!leg) continue;

    const existing = await prisma.booking.findFirst({
      where: { legId: leg.id, customerEmail: email },
    });
    if (existing) {
      // already seeded, ensure review exists
      const hasReview = await prisma.review.findUnique({
        where: { bookingId: existing.id },
      });
      if (!hasReview) {
        await prisma.review.create({
          data: {
            customerId: reviewer.id,
            bookingId: existing.id,
            scheduleId: targetScheduleId,
            rating: r.rating,
            text: r.text,
          },
        });
      }
      continue;
    }

    const price = computeBookingPrice({
      unitPrice: Number(leg.basePrice),
      quantity: 1,
    });
    const ref = newBookingReference();
    const booking = await prisma.booking.create({
      data: {
        bookingReference: ref,
        legId: leg.id,
        operatorId: operator.id,
        customerId: reviewer.id,
        customerName: reviewer.fullName,
        customerEmail: email,
        customerPhone: reviewer.phoneNumber ?? "+6280000000000",
        totalAmount: price.totalAmount,
        commissionAmount: price.commissionAmount,
        operatorAmount: price.operatorAmount,
        status: "CONFIRMED",
        refundDeadline: computeRefundDeadline(leg.departureDate),
        refundPolicySnapshot: snapshotCurrentPolicy({
          departure: leg.departureDate,
          deadline: computeRefundDeadline(leg.departureDate),
        }),
        payment: {
          create: {
            amount: price.totalAmount,
            method: "QRIS",
            status: "SUCCESSFUL",
            paidAt: new Date(),
            gatewayProvider: "XENDIT",
          },
        },
      },
    });
    await prisma.leg.update({
      where: { id: leg.id },
      data: { availableSeats: { decrement: 1 } },
    });
    const ticketCode = newTicketCode(ref, 1);
    await prisma.ticket.create({
      data: {
        bookingId: booking.id,
        ticketCode,
        passengerName: reviewer.fullName,
        qrHash: signTicketCode(ticketCode, ymdInZone(leg.departureDate)),
        status: "ISSUED",
      },
    });

    await prisma.review.create({
      data: {
        customerId: reviewer.id,
        bookingId: booking.id,
        scheduleId: targetScheduleId,
        rating: r.rating,
        text: r.text,
      },
    });
  }
  console.log(`✓ reviews  ${REVIEWERS.length} seeded`);

  console.log(`\nQA personas (password: ${QA.password}):`);
  console.log(`  admin    → ${QA.adminEmail}`);
  console.log(`  operator → ${QA.operatorEmail}`);
  console.log(`  customer → ${QA.customerEmail}`);
  console.log(`  db host  → ${host}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
