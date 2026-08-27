const { PrismaClient } = require('@prisma/client');

const prismaProd = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } }
});

async function inspect() {
  try {
    const result = await prismaProd.$queryRawUnsafe('SELECT * FROM public."Operator"');
    console.log('Operator data:', result);

    const result2 = await prismaProd.$queryRawUnsafe('SELECT * FROM public."Admin"');
    console.log('Admin data:', result2);

    await prismaProd.$disconnect();
  } catch (err) {
    console.error('Error:', err.message);
  }
}

inspect();
