/**
 * CLI wrapper for the real Padang Bai ↔ Gili seed.
 *
 * Run with: npm run db:seed:real
 *
 * Shared logic lives in lib/seed-data.ts so the same data can also be
 * imported by the /api/admin/seed-real endpoint for production seeding
 * without a local DB connection.
 */

import { seedRealData } from "../lib/seed-data";
import { prisma } from "../lib/db";

async function main() {
  console.log("→ Seeding real Padang Bai ↔ Gili operators…\n");
  const result = await seedRealData({
    defaultPassword: process.env.SEED_OPERATOR_PASSWORD ?? "changeme123",
  });

  console.log(`\n✓ ${result.operators} operators`);
  console.log(`✓ ${result.boats} boats`);
  console.log(`✓ ${result.schedules} schedules`);
  console.log(`✓ ${result.legsGenerated} upcoming legs generated\n`);

  console.log("Operator logins (password: changeme123):");
  for (const email of result.operatorEmails) {
    console.log(`  ${email}`);
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
