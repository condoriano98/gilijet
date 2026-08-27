const { PrismaClient } = require('@prisma/client');

const prismaProd = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } }
});

const prismaStaging = new PrismaClient({
  datasources: { db: { url: process.env.POSTGRES_PRISMA_URL || 'postgresql://postgres:=iManue!177314@db.ftsxkurnklasglfphfmg.supabase.co:6543/postgres' } }
});

async function migrateData() {
  try {
    console.log('🔄 Connecting via Prisma...\n');

    // Test connections
    await prismaProd.$queryRaw`SELECT 1`;
    console.log('✓ Connected to production');

    await prismaStaging.$queryRaw`SELECT 1`;
    console.log('✓ Connected to staging\n');

    console.log('📊 Starting data migration...\n');

    // Get list of tables using Prisma's raw query
    const tablesQuery = `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`;
    const tables = await prismaProd.$queryRawUnsafe(tablesQuery);

    console.log(`Found ${tables.length} tables\n`);

    // Disable FKs in staging
    await prismaStaging.$queryRawUnsafe('SET session_replication_role = replica');

    let migrated = 0;
    let totalRows = 0;

    for (const tbl of tables) {
      const tableName = tbl.tablename;

      try {
        // Get data from production
        const selectQuery = `SELECT * FROM public."${tableName}"`;
        const data = await prismaProd.$queryRawUnsafe(selectQuery);

        if (!data || data.length === 0) {
          console.log(`  ✓ ${tableName}: 0 rows`);
          migrated++;
          continue;
        }

        // Delete from staging
        await prismaStaging.$queryRawUnsafe(`DELETE FROM public."${tableName}"`);

        // Insert into staging row by row
        let inserted = 0;
        for (const row of data) {
          const cols = Object.keys(row);
          const values = cols.map(c => row[c]);

          // Build placeholders and values
          let query = `INSERT INTO public."${tableName}" (`;
          query += cols.map(c => `"${c}"`).join(', ');
          query += ') VALUES (';
          query += cols.map((_, i) => `$${i + 1}`).join(', ');
          query += ')';

          await prismaStaging.$queryRawUnsafe(query, ...values);
          inserted++;
        }

        console.log(`  ✓ ${tableName}: ${inserted} rows`);
        migrated++;
        totalRows += inserted;
      } catch (err) {
        console.error(`  ✗ ${tableName}: ${err.message.substring(0, 80)}`);
      }
    }

    // Re-enable FKs
    await prismaStaging.$queryRawUnsafe('SET session_replication_role = default');

    console.log(`\n✅ Migration complete: ${migrated}/${tables.length} tables, ${totalRows} rows\n`);

  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    await prismaProd.$disconnect();
    await prismaStaging.$disconnect();
  }
}

migrateData();
