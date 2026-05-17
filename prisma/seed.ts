import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const adminEmail =
    process.env.SEED_ADMIN_EMAIL ?? "admin@gilijet.local";
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
  console.log(`✓ operator: ${operator.email} (status=${operator.status})`);

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

  const schedule = await prisma.schedule.findFirst({
    where: { boatId: boat.id, originPort: "Sanur" },
  });
  if (!schedule) {
    const created = await prisma.schedule.create({
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
    console.log(`✓ schedule: ${created.originPort} → ${created.destinationPort}`);
  } else {
    console.log(`✓ schedule (exists): ${schedule.originPort} → ${schedule.destinationPort}`);
  }

  console.log("\nLogin credentials (change in production):");
  console.log(`  admin    → ${adminEmail} / ${adminPassword}`);
  console.log(`  operator → ${operatorEmail} / ${operatorPassword}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
