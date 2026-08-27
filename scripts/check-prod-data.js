const { PrismaClient } = require('@prisma/client');

const prismaProd = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } }
});

async function checkData() {
  try {
    console.log('Checking production data...\n');

    const customerCount = await prismaProd.$queryRawUnsafe('SELECT COUNT(*) as count FROM public."Customer"');
    console.log('Customer count:', customerCount);

    const customers = await prismaProd.$queryRawUnsafe('SELECT * FROM public."Customer" LIMIT 2');
    console.log('Sample customers:', customers);

    const allTables = await prismaProd.$queryRawUnsafe(`
      SELECT tablename,
             (SELECT count(*) FROM information_schema.tables t2 WHERE t2.table_name = t1.tablename LIMIT 1) as row_count
      FROM pg_tables t1
      WHERE schemaname = 'public'
      ORDER BY tablename
    `);
    console.log('\nAll tables:', allTables);

    await prismaProd.$disconnect();
  } catch (err) {
    console.error('Error:', err.message);
  }
}

checkData();
