const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: 'postgresql://ezbillz_test_user:ezbillz_test_password@127.0.0.1:5435/ezbillz_test?schema=public'
    }
  }
});
async function main() {
  try {
    await prisma.$connect();
    console.log("Connected successfully");
    const count = await prisma.user.count();
    console.log("User count:", count);
  } catch (e) {
    console.error("Connection failed", e);
  } finally {
    await prisma.$disconnect();
  }
}
main();
