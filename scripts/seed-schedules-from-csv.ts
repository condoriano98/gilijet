/**
 * Seed schedules directly from CSV - reset & recreate with full port names (origin - region format).
 *
 * Usage:
 *   pnpm seed:schedules
 */

import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type PriceRow = {
  PRICE_CODE: string;
  name: string;
  originPort: string;
  destinationPort: string;
  departureTime: string;
  arrivalTime: string;
  durationMinutes: string;
  basePrice: string;
};

function parseCSV(content: string): PriceRow[] {
  const lines = content.split("\n");
  const headers = lines[0]!.split(",").map((h) => h.trim().replace(/^"(.*)"$/, "$1"));
  const rows: PriceRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (!line) continue;

    const fields: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let j = 0; j < line.length; j++) {
      const char = line[j];
      if (char === '"') {
        if (inQuotes && line[j + 1] === '"') {
          current += '"';
          j++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === "," && !inQuotes) {
        fields.push(current.trim().replace(/^"(.*)"$/, "$1"));
        current = "";
      } else {
        current += char;
      }
    }
    fields.push(current.trim().replace(/^"(.*)"$/, "$1"));

    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length && j < fields.length; j++) {
      row[headers[j]!] = fields[j] || "";
    }

    rows.push(row as PriceRow);
  }

  return rows;
}

async function main() {
  const csvPath = path.join(process.cwd(), "price_schedule_pt wahana virendra group.csv");

  if (!fs.existsSync(csvPath)) {
    throw new Error(`CSV not found at ${csvPath}`);
  }

  const content = fs.readFileSync(csvPath, "utf-8");
  const rows = parseCSV(content);

  // Get or create operator
  const operator = await prisma.operator.findFirst({
    where: { companyName: "PT WAHANA VIRENDRA GROUP", deletedAt: null },
  });

  if (!operator) {
    throw new Error("Operator PT WAHANA VIRENDRA GROUP not found. Create it in dashboard first.");
  }

  // Get boats by name
  const boatNames = [...new Set(rows.map((r) => r.name))];
  const boats = await prisma.boat.findMany({
    where: { operatorId: operator.id, name: { in: boatNames }, deletedAt: null },
  });

  const boatMap = new Map(boats.map((b) => [b.name, b.id]));
  const missingBoats = boatNames.filter((name) => !boatMap.has(name));
  if (missingBoats.length > 0) {
    throw new Error(`Boats not found: ${missingBoats.join(", ")}. Create them in dashboard first.`);
  }

  // Reset: soft-delete all existing schedules for this operator
  await prisma.schedule.updateMany({
    where: { boat: { operatorId: operator.id }, deletedAt: null },
    data: { deletedAt: new Date(), status: "INACTIVE" },
  });
  console.log("✓ Soft-deleted existing schedules");

  // Group by unique departure (boat, origin, destination, departure time)
  const departures = new Map<
    string,
    {
      boat: string;
      originPort: string;
      destinationPort: string;
      departureTime: string;
      arrivalTime: string;
      durationMinutes: number;
      basePrice: number;
    }
  >();

  for (const row of rows) {
    const key = `${row.name}|${row.originPort}|${row.destinationPort}|${row.departureTime}`;
    if (!departures.has(key)) {
      departures.set(key, {
        boat: row.name,
        originPort: row.originPort,
        destinationPort: row.destinationPort,
        departureTime: row.departureTime,
        arrivalTime: row.arrivalTime,
        durationMinutes: parseInt(row.durationMinutes, 10),
        basePrice: parseInt(row.basePrice.replace(/,/g, ""), 10),
      });
    }
  }

  console.log(`Creating ${departures.size} schedules...`);

  // Build port name map (extract just port name from "Port - Region" format)
  const portNameToId = new Map<string, string>();
  for (const port of boats[0] ? [] : []) {} // placeholder
  const allPorts = await prisma.port.findMany({ select: { id: true, name: true } });
  for (const port of allPorts) {
    portNameToId.set(port.name, port.id);
  }

  let created = 0;
  for (const dep of departures.values()) {
    const boatId = boatMap.get(dep.boat)!;

    // Extract port name (before " - " for "Port - Region" format)
    const originPortName = dep.originPort.split(" - ")[0]!.trim();
    const destPortName = dep.destinationPort.split(" - ")[0]!.trim();
    const originPortId = portNameToId.get(originPortName);
    const destPortId = portNameToId.get(destPortName);

    // Extract just port name (remove region suffix)
    const originPortNameOnly = dep.originPort.split(" - ")[0]!.trim();
    const destPortNameOnly = dep.destinationPort.split(" - ")[0]!.trim();

    // Pad departure time to HH:MM format (e.g., "9:30" → "09:30")
    const [hours, minutes] = dep.departureTime.split(":");
    const paddedTime = `${hours?.padStart(2, "0")}:${minutes}`;

    await prisma.schedule.create({
      data: {
        boatId,
        originPort: originPortNameOnly,
        destinationPort: destPortNameOnly,
        originPortId: originPortId || null,
        destinationPortId: destPortId || null,
        departureTime: paddedTime,
        durationMinutes: dep.durationMinutes,
        basePrice: dep.basePrice,
        daysOfWeek: [1, 2, 3, 4, 5, 6, 7],
        status: "ACTIVE",
        pricingTiers: [],
      },
    });
    created++;
  }

  console.log(`✓ Created ${created} schedules`);

  // Generate legs
  const { generateLegsForSchedule, seasonSeedParams } = await import("../lib/legs");
  const schedules = await prisma.schedule.findMany({
    where: { boat: { operatorId: operator.id }, status: "ACTIVE", deletedAt: null },
    select: { id: true },
  });

  const season = seasonSeedParams();
  let totalLegs = 0;
  for (const schedule of schedules) {
    totalLegs += await generateLegsForSchedule(schedule.id, season.daysAhead, season.startAt);
  }

  console.log(`✓ Generated ${totalLegs} legs`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
