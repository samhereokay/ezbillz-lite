// scripts/verify-test-db.js
const { URL } = require('url');

const dbUrl = process.env.DATABASE_URL;

if (!dbUrl) {
  console.error("❌ ERROR: DATABASE_URL is not set.");
  process.exit(1);
}

try {
  const url = new URL(dbUrl);
  
  const hostname = url.hostname;
  const port = url.port;
  const pathname = url.pathname.replace(/^\//, '');

  console.log(`Verifying Database Connection Safety:`);
  console.log(`- Host: ${hostname}`);
  console.log(`- Port: ${port}`);
  console.log(`- Database: ${pathname}`);
  
  if (hostname !== '127.0.0.1' && hostname !== 'localhost' && hostname !== 'test-postgres') {
    console.error(`❌ ERROR: Test database hostname must be 127.0.0.1, localhost, or test-postgres. Found: ${hostname}`);
    process.exit(1);
  }

  if (port !== '5435' && port !== '5432') {
    console.error(`❌ ERROR: Test database port must be 5435 or 5432. Found: ${port}`);
    process.exit(1);
  }

  if (pathname !== 'ezbillz_test') {
    console.error(`❌ ERROR: Test database name must be ezbillz_test. Found: ${pathname}`);
    process.exit(1);
  }

  // Explicit safety checks against production
  if (hostname === 'postgres' || hostname === '172.24.0.3' || hostname === '0.0.0.0') {
    console.error(`❌ ERROR: FATAL: Production hostname detected! Aborting!`);
    process.exit(1);
  }

  if (pathname === 'ezbillz') {
    console.error(`❌ ERROR: FATAL: Production database name 'ezbillz' detected! Aborting!`);
    process.exit(1);
  }
  
  if (url.username !== 'ezbillz_test_user') {
    console.error(`❌ ERROR: Test user is not 'ezbillz_test_user'. Found: ${url.username}`);
    process.exit(1);
  }

  console.log(`✅ SAFETY VERIFIED: DATABASE_URL is explicitly the isolated test database.`);
  process.exit(0);

} catch (e) {
  console.error("❌ ERROR: Failed to parse DATABASE_URL.", e.message);
  process.exit(1);
}
