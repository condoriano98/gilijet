import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";

const prisma = new PrismaClient();

// Operator lookups are by companyName string match (no dedicated key in the
// source CSV) — same approach scripts/seed-schedules-from-csv.ts already
// uses for the same operator. A row whose company has no matching Operator
// (e.g. "GILIFAST", which is the platform itself, not a boat operator) is
// seeded with operatorId = null rather than skipped.
async function seedPicContacts() {
  const csvPath = path.join(process.cwd(), "trigger_tiket.csv");

  if (!fs.existsSync(csvPath)) {
    console.error("❌ trigger_tiket.csv not found");
    process.exit(1);
  }

  const existing = await prisma.operatorPicContact.count();
  if (existing > 0) {
    console.error(
      `❌ OperatorPicContact already has ${existing} row(s). This script has no dedupe key, so re-running it would create duplicates. Aborting — clear the table first if you really mean to reseed.`,
    );
    process.exit(1);
  }

  const fileStream = fs.createReadStream(csvPath);
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  let lineNumber = 0;
  let inserted = 0;
  for await (const line of rl) {
    lineNumber++;
    if (lineNumber === 1) continue; // header
    if (!line.trim()) continue;

    const [companyName, nohpNotifikasi, emailNotifikasi, nohpKonfirmasiTrigger, emailKonfirmasiTrigger] =
      line.split(",").map((s) => s.trim());

    if (!companyName) {
      console.warn(`⚠️  Skipping line ${lineNumber}: missing companyname`);
      continue;
    }

    const operator = await prisma.operator.findFirst({
      where: { companyName, deletedAt: null },
      select: { id: true },
    });

    if (!operator) {
      console.warn(
        `⚠️  Line ${lineNumber}: no active Operator matches "${companyName}" — seeding with operatorId = null`,
      );
    }

    await prisma.operatorPicContact.create({
      data: {
        operatorId: operator?.id ?? null,
        nohpNotifikasi: nohpNotifikasi || null,
        emailNotifikasi: emailNotifikasi || null,
        nohpKonfirmasiTrigger: nohpKonfirmasiTrigger || null,
        emailKonfirmasiTrigger: emailKonfirmasiTrigger || null,
      },
    });
    inserted++;
  }

  console.log(`✅ Inserted ${inserted} OperatorPicContact row(s)`);
  await prisma.$disconnect();
}

seedPicContacts().catch((e) => {
  console.error(e);
  process.exit(1);
});
