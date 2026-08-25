import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";

const prisma = new PrismaClient();

async function seedPorts() {
  const csvPath = path.join(process.cwd(), "port_database.csv");

  if (!fs.existsSync(csvPath)) {
    console.error("❌ port_database.csv not found");
    process.exit(1);
  }

  const fileStream = fs.createReadStream(csvPath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  const ports: Array<{
    name: string;
    island: string;
    shortCode: string;
  }> = [];

  let lineNumber = 0;
  for await (const line of rl) {
    lineNumber++;
    if (lineNumber === 1) continue; // Skip header

    const [name, region, alias, displayLabel] = line.split(",").map(s => s.trim());

    if (!name || !region) {
      console.warn(`⚠️  Skipping line ${lineNumber}: missing name or region`);
      continue;
    }

    ports.push({
      name,
      island: region,
      shortCode: "", // Will generate unique codes below
    });
  }

  // Generate unique 3-char short codes
  const used = new Set<string>();
  for (const port of ports) {
    let code = port.name.substring(0, 3).toUpperCase();
    let suffix = 0;

    // If collision, try adding number (KUS, KUS2 -> KUS, KUA, KUB...)
    while (used.has(code)) {
      suffix++;
      if (suffix <= 9) {
        code = port.name.substring(0, 2).toUpperCase() + suffix;
      } else {
        // Fallback: use last 2 chars + first letter of region
        code = (port.name.slice(-2) + port.island.substring(0, 1)).toUpperCase();
      }
    }

    used.add(code);
    port.shortCode = code;
  }

  console.log(`📥 Importing ${ports.length} ports...`);

  for (const port of ports) {
    await prisma.port.upsert({
      where: { shortCode: port.shortCode },
      update: {
        name: port.name,
        island: port.island,
        isActive: true,
        deletedAt: null,
      },
      create: {
        name: port.name,
        island: port.island,
        shortCode: port.shortCode,
        slug: port.name.toLowerCase().replace(/\s+/g, "-"),
        isActive: true,
      },
    });
  }

  console.log(`✅ Seeded ${ports.length} ports`);

  const result = await prisma.port.groupBy({
    by: ["island"],
    where: { isActive: true },
    _count: true,
  });

  console.log("\nPorts by region:");
  result
    .sort((a, b) => (a.island || "Other").localeCompare(b.island || "Other"))
    .forEach((g) => {
      console.log(`  ${g.island || "Other"}: ${g._count}`);
    });

  await prisma.$disconnect();
}

seedPorts().catch((e) => {
  console.error(e);
  process.exit(1);
});
