/**
 * Link schedules to Port table by matching port names.
 * Sets originPortId and destinationPortId by looking up Port records.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Linking schedules to ports...");

  // Get all unique port names from schedules
  const schedules = await prisma.schedule.findMany({
    select: { id: true, originPort: true, destinationPort: true },
  });

  const portNames = new Set<string>();
  schedules.forEach((s) => {
    portNames.add(s.originPort);
    portNames.add(s.destinationPort);
  });

  // Get all ports
  const ports = await prisma.port.findMany({
    select: { id: true, name: true },
  });

  const portMap = new Map(ports.map((p) => [p.name, p.id]));

  console.log(`Found ${portNames.size} unique port names in schedules`);
  console.log(`Found ${ports.length} ports in Port table`);

  // Check for unmatched ports
  const unmatched = Array.from(portNames).filter((name) => !portMap.has(name));
  if (unmatched.length > 0) {
    console.warn(`⚠ Unmatched ports: ${unmatched.join(", ")}`);
    console.warn("These will not be linked. Check port names in CSV vs Port table.");
  }

  // Update schedules
  let updated = 0;
  for (const schedule of schedules) {
    const originPortId = portMap.get(schedule.originPort);
    const destinationPortId = portMap.get(schedule.destinationPort);

    if (originPortId || destinationPortId) {
      await prisma.schedule.update({
        where: { id: schedule.id },
        data: {
          ...(originPortId && { originPortId }),
          ...(destinationPortId && { destinationPortId }),
        },
      });
      updated++;
    }
  }

  console.log(`✓ Updated ${updated} schedules with port IDs`);

  // Show sample
  const sample = await prisma.schedule.findMany({
    where: { originPortId: { not: null } },
    select: {
      originPort: true,
      originPortId: true,
      destinationPort: true,
      destinationPortId: true,
    },
    take: 5,
  });

  console.log("\nSample linked schedules:");
  sample.forEach((s) => {
    console.log(`  ${s.originPort} (${s.originPortId}) → ${s.destinationPort} (${s.destinationPortId})`);
  });
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
