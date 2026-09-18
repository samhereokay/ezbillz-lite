import { test, expect } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL || 'postgresql://ezbillz_test_user:ezbillz_test_password@127.0.0.1:5435/ezbillz_test?schema=public'
    }
  }
});

test.describe('Phase 10: Real HTTP Session Revocation', () => {
  const uniqueSuffix = crypto.randomUUID().substring(0, 8);
  const email = `session_e2e_${uniqueSuffix}@example.com`;
  const password = 'SecurePassword123!';
  let userId: string;

  test.afterAll(async () => {
    if (userId) {
      await prisma.user.deleteMany({ where: { id: userId } });
    }
  });

  test('Old cookie/JWT -> authenticated request -> sessionVersion mismatch -> authentication rejected', async ({ request, page }) => {
    // 1. Create a user via signup API
    const signupRes = await request.post('/api/auth/signup', {
      data: {
        name: 'E2E Session User',
        email,
        password,
        businessName: 'E2E Corp',
        state: 'MH',
        stateCode: '27'
      }
    });
    expect(signupRes.ok()).toBeTruthy();
    const signupData = await signupRes.json();
    userId = signupData.userId;

    // 2. Login via browser to get the session cookie
    await page.goto('/login');
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', password);
    await Promise.all([
      page.waitForURL('**/dashboard'),
      page.click('button[type="submit"]')
    ]);

    // 3. Extract the session cookie
    const cookies = await page.context().cookies();
    const sessionCookie = cookies.find(c => c.name.includes('next-auth.session-token'));
    expect(sessionCookie).toBeDefined();

    // 4. Make an authenticated API request using the raw request context (which inherits browser context cookies)
    const validRes = await request.get('/api/customers');
    expect(validRes.status()).toBe(200);

    // 5. Increment the sessionVersion directly in the database (simulate global logout or password change)
    await prisma.user.update({
      where: { id: userId },
      data: { sessionVersion: { increment: 1 } }
    });

    // 6. Make another authenticated API request using the EXACT SAME cookie context
    const rejectedRes = await request.get('/api/customers');
    
    // In our architecture, the jwt callback returns {} when sessionVersion mismatches,
    // which results in an empty session. requireOrgContext then throws UnauthorizedError.
    // In Next.js API routes, uncaught UnauthorizedError or explicit 401 response should occur.
    expect(rejectedRes.status()).toBe(401);

    // 7. Test fresh login works
    // Clear cookies first
    await page.context().clearCookies();
    await page.goto('/login');
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', password);
    await Promise.all([
      page.waitForURL('**/dashboard'),
      page.click('button[type="submit"]')
    ]);

    const newRes = await page.request.get('/api/customers');
    expect(newRes.status()).toBe(200);
  });
});
