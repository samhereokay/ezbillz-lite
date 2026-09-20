# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: session-revocation.spec.ts >> Phase 10: Real HTTP Session Revocation >> Old cookie/JWT -> authenticated request -> sessionVersion mismatch -> authentication rejected
- Location: tests/e2e/session-revocation.spec.ts:25:7

# Error details

```
Error: expect(received).toBeTruthy()

Received: false
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | import { PrismaClient } from '@prisma/client';
  3  | import crypto from 'crypto';
  4  | 
  5  | const prisma = new PrismaClient({
  6  |   datasources: {
  7  |     db: {
  8  |       url: process.env.DATABASE_URL || 'postgresql://ezbillz_test_user:ezbillz_test_password@127.0.0.1:5435/ezbillz_test?schema=public'
  9  |     }
  10 |   }
  11 | });
  12 | 
  13 | test.describe('Phase 10: Real HTTP Session Revocation', () => {
  14 |   const uniqueSuffix = crypto.randomUUID().substring(0, 8);
  15 |   const email = `session_e2e_${uniqueSuffix}@example.com`;
  16 |   const password = 'SecurePassword123!';
  17 |   let userId: string;
  18 | 
  19 |   test.afterAll(async () => {
  20 |     if (userId) {
  21 |       await prisma.user.deleteMany({ where: { id: userId } });
  22 |     }
  23 |   });
  24 | 
  25 |   test('Old cookie/JWT -> authenticated request -> sessionVersion mismatch -> authentication rejected', async ({ request, page }) => {
  26 |     // 1. Create a user via signup API
  27 |     const signupRes = await request.post('/api/auth/signup', {
  28 |       data: {
  29 |         name: 'E2E Session User',
  30 |         email,
  31 |         password,
  32 |         businessName: 'E2E Corp',
  33 |         state: 'MH',
  34 |         stateCode: '27'
  35 |       }
  36 |     });
> 37 |     expect(signupRes.ok()).toBeTruthy();
     |                            ^ Error: expect(received).toBeTruthy()
  38 |     const signupData = await signupRes.json();
  39 |     userId = signupData.userId;
  40 | 
  41 |     // 2. Login via browser to get the session cookie
  42 |     await page.goto('/login');
  43 |     await page.fill('input[type="email"]', email);
  44 |     await page.fill('input[type="password"]', password);
  45 |     await Promise.all([
  46 |       page.waitForURL('**/dashboard'),
  47 |       page.click('button[type="submit"]')
  48 |     ]);
  49 | 
  50 |     // 3. Extract the session cookie
  51 |     const cookies = await page.context().cookies();
  52 |     const sessionCookie = cookies.find(c => c.name.includes('next-auth.session-token'));
  53 |     expect(sessionCookie).toBeDefined();
  54 | 
  55 |     // 4. Make an authenticated API request using the raw request context (which inherits browser context cookies)
  56 |     const validRes = await request.get('/api/customers');
  57 |     expect(validRes.status()).toBe(200);
  58 | 
  59 |     // 5. Increment the sessionVersion directly in the database (simulate global logout or password change)
  60 |     await prisma.user.update({
  61 |       where: { id: userId },
  62 |       data: { sessionVersion: { increment: 1 } }
  63 |     });
  64 | 
  65 |     // 6. Make another authenticated API request using the EXACT SAME cookie context
  66 |     const rejectedRes = await request.get('/api/customers');
  67 |     
  68 |     // In our architecture, the jwt callback returns {} when sessionVersion mismatches,
  69 |     // which results in an empty session. requireOrgContext then throws UnauthorizedError.
  70 |     // In Next.js API routes, uncaught UnauthorizedError or explicit 401 response should occur.
  71 |     expect(rejectedRes.status()).toBe(401);
  72 | 
  73 |     // 7. Test fresh login works
  74 |     // Clear cookies first
  75 |     await page.context().clearCookies();
  76 |     await page.goto('/login');
  77 |     await page.fill('input[type="email"]', email);
  78 |     await page.fill('input[type="password"]', password);
  79 |     await Promise.all([
  80 |       page.waitForURL('**/dashboard'),
  81 |       page.click('button[type="submit"]')
  82 |     ]);
  83 | 
  84 |     const newRes = await page.request.get('/api/customers');
  85 |     expect(newRes.status()).toBe(200);
  86 |   });
  87 | });
  88 | 
```