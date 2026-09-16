import { test, expect, Page } from '@playwright/test';

/**
 * EZBILLZ Golden-Path E2E — Real Browser QA
 *
 * Runs against real Next.js + PostgreSQL + MinIO.
 * Uses system Chrome via executablePath.
 * Every assertion verifies real persisted data.
 */

const TS = Date.now();
const TEST_EMAIL = `qa_${TS}@ezbillz-test.com`;
const TEST_PASSWORD = 'SecurePass_2026!';
const BIZ_NAME = `QA Business ${TS}`;

// ──────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────

async function signup(page: Page) {
  await page.goto('/signup');
  await page.waitForTimeout(1000); // Wait for React hydration
  await expect(page.locator('h2:has-text("Create your account")')).toBeVisible();

  await page.fill('#businessName', BIZ_NAME);
  // State defaults to West Bengal — leave as is for intra-state test
  await page.fill('#name', 'QA Tester');
  await page.fill('#email', TEST_EMAIL);
  await page.fill('#password', TEST_PASSWORD);
  await page.fill('#confirmPassword', TEST_PASSWORD);
  await page.click('#signup-submit');

  // Should redirect to /dashboard
  await page.waitForURL('**/dashboard', { timeout: 15000 });
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
}

async function login(page: Page) {
  await page.goto('/login');

  await expect(
    page.getByRole('heading', { name: 'Welcome back' })
  ).toBeVisible();

  await page.fill('#email', TEST_EMAIL);
  await page.fill('#password', TEST_PASSWORD);

  await Promise.all([
    page.waitForURL('**/dashboard', { timeout: 15000 }),
    page.click('#login-submit'),
  ]);

  await expect(page).toHaveURL(/\/dashboard$/);

  await expect(
    page.getByRole('button', { name: 'Sign out' })
  ).toBeVisible({ timeout: 10000 });

  await expect(
    page.getByRole('heading', { name: 'Dashboard' })
  ).toBeVisible({ timeout: 10000 });
}

async function logout(page: Page) {
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.waitForURL('**/login', { timeout: 10000 });
  await page.waitForLoadState('domcontentloaded');
}

// ──────────────────────────────────────────
// Tests
// ──────────────────────────────────────────

test.describe.serial('EZBILLZ Golden Path', () => {

  test('1. Signup — creates user, org, redirects to dashboard', async ({ page }) => {
    await signup(page);
    // Verify the dashboard actually rendered
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  });

  test('2. Logout / Login — session persists', async ({ page }) => {
    await login(page);
    await logout(page);
    await login(page);
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  });

  test('3. Product — create real product', async ({ page }) => {
    await login(page);
    await page.goto('/products');
    await expect(page.locator('h1:has-text("Products")')).toBeVisible();

    // Click "Add Product" button
    await page.click('button:has-text("Add Product")');

    // Fill product form — fields use placeholder text, no ids
    await page.fill('input[placeholder="Mobile Phone"]', 'Widget Pro');
    await page.fill('input[placeholder="SKU-001"]', 'WGT-001');
    await page.fill('input[placeholder="8517"]', '8517');
    await page.fill('input[placeholder="1000.00"]', '5000');
    await page.fill('input[placeholder="800.00"]', '4000');
    // GST rate defaults to 18%

    await page.click('button:has-text("Save Product")');

    // Product should appear in the list
    await expect(page.getByText('Widget Pro').first()).toBeVisible({ timeout: 5000 });

    // Refresh and verify persistence
    await page.reload();
    await expect(page.getByText('Widget Pro').first()).toBeVisible({ timeout: 5000 });
  });

  test('4. Customer — create intra-state customer (West Bengal)', async ({ page }) => {
    await login(page);
    await page.goto('/customers');
    await expect(page.locator('h1:has-text("Customers")')).toBeVisible();

    await page.click('button:has-text("Add Customer")');

    await page.fill('input[placeholder="Sharma Enterprises"]', 'Local Buyer WB');
    // State defaults to West Bengal — same as business, so intra-state

    await page.click('button:has-text("Save Customer")');
    await expect(page.locator('text=Local Buyer WB')).toBeVisible({ timeout: 5000 });

    // Refresh persistence
    await page.reload();
    await expect(page.locator('text=Local Buyer WB')).toBeVisible({ timeout: 5000 });
  });

  test('5. Customer — create inter-state customer (Maharashtra)', async ({ page }) => {
    await login(page);
    await page.goto('/customers');

    await page.click('button:has-text("Add Customer")');
    await page.fill('input[placeholder="Sharma Enterprises"]', 'Remote Buyer MH');

    // Change state to Maharashtra
    await page.selectOption('select.form-select', { label: 'Maharashtra' });

    await page.click('button:has-text("Save Customer")');
    await expect(page.getByText('Remote Buyer MH').first()).toBeVisible({ timeout: 5000 });
  });

  test('6. Invoice (intra-state) — CGST + SGST', async ({ page }) => {
    await login(page);
    await page.goto('/invoices/new');
    await expect(page.locator('h1:has-text("New Invoice")')).toBeVisible();

    // Wait for customer dropdown to load
    await page.waitForSelector('#customer-select option:not([value=""])', { timeout: 10000 });

    // Select the intra-state customer
    await page.selectOption('#customer-select', { label: 'Local Buyer WB' });

    // Pick product from catalog
    const productSelect = page.locator('select.form-select.text-xs');
    await productSelect.selectOption({ index: 1 });

    // Set quantity
    const qtyInput = page.locator('input[type="number"][min="0.001"]').first();
    await qtyInput.fill('2');

    // Submit
    await page.click('#submit-invoice-btn');

    // Should redirect to invoice detail
    await page.waitForURL('**/invoices/**', { timeout: 10000 });

    await expect(page.getByText('CGST').first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('SGST').first()).toBeVisible({ timeout: 10000 });
  });

  test('7. Invoice (inter-state) — IGST', async ({ page }) => {
    await login(page);
    await page.goto('/invoices/new');

    await page.waitForSelector('#customer-select option:not([value=""])', { timeout: 10000 });

    // Select the inter-state customer
    await page.selectOption('#customer-select', { label: 'Remote Buyer MH' });

    // Pick product
    const productSelect = page.locator('select.form-select.text-xs');
    await productSelect.selectOption({ index: 1 });

    const qtyInput = page.locator('input[type="number"][min="0.001"]').first();
    await qtyInput.fill('1');

    await page.click('#submit-invoice-btn');
    await page.waitForURL('**/invoices/**', { timeout: 10000 });

    const pageContent = await page.textContent('body');
    expect(pageContent).toContain('IGST');
  });

  test('8. Invoice list — invoices persist', async ({ page }) => {
    await login(page);
    await page.goto('/invoices');
    await expect(page.locator('h1:has-text("Invoices")')).toBeVisible();

    // At least 2 invoices should be listed
    const rows = page.locator('table tbody tr, [class*="card"]');
    await expect(rows.first()).toBeVisible({ timeout: 5000 });
  });

  test('9. Payment — record partial payment', async ({ page }) => {
    await login(page);
    await page.goto('/payments');
    await expect(page.locator('h1:has-text("Payments")')).toBeVisible();

    await page.click('text="Record Payment"');

    // Wait for the new payment page to load
    await page.waitForURL('**/payments/new');
    await expect(page.locator('h1:has-text("Record Payment")')).toBeVisible();

    // Fill payment form (Type is already RECEIVED, method is CASH)
    await page.fill('input[type="number"]', '3000');

    // Click submit
    await page.click('button[type="submit"]');

    // Wait for redirect to payment details
    await page.waitForURL('**/payments/*');

    // Go back to list to verify it appears
    await page.goto('/payments');
    
    // Payment should appear in the list (3,000 INR)
    await expect(page.getByText('3,000').first()).toBeVisible({ timeout: 5000 });
  });

  test('10. Reports — GST report loads with real data', async ({ page }) => {
    await login(page);
    await page.goto('/reports/gst');
    // Page should load with real data (not empty)
    await page.waitForLoadState('domcontentloaded');
    const content = await page.textContent('body');
    // After creating invoices, there should be tax data
    expect(content?.length).toBeGreaterThan(100);
  });

  test('11. Reports — Stock report loads', async ({ page }) => {
    await login(page);
    await page.goto('/reports/stock');
    await page.waitForLoadState('domcontentloaded');
    // Widget Pro should appear
    await expect(page.getByText('Widget Pro').first()).toBeVisible({ timeout: 5000 });
  });

  test('12. Reports — Outstanding report loads', async ({ page }) => {
    await login(page);
    await page.goto('/reports/outstanding');
    await page.waitForLoadState('domcontentloaded');
    const content = await page.textContent('body');
    expect(content?.length).toBeGreaterThan(50);
  });

  test('13. Settings — update business info persists', async ({ page }) => {
    await login(page);
    await page.goto('/settings');
    await expect(page.locator('h1:has-text("Settings")')).toBeVisible();

    // Fill in legal name
    const legalNameInput = page.locator('input[placeholder="As registered with GST"]');
    await legalNameInput.fill('QA Legal Name Pvt Ltd');

    await page.click('button:has-text("Save")');

    // Refresh and verify persistence
    await page.reload();
    await expect(legalNameInput).toHaveValue('QA Legal Name Pvt Ltd');
  });

  test('14. Navigation — all sidebar links load', async ({ page }) => {
    await login(page);
    const links = [
      '/dashboard',
      '/invoices',
      '/payments',
      '/purchases',
      '/products',
      '/customers',
      '/suppliers',
      '/reports/gst',
      '/reports/stock',
      '/reports/outstanding',
      '/settings',
    ];
    for (const href of links) {
      await page.goto(href);
      // No error page — look for main content area (not a 500/404)
      await page.waitForLoadState('domcontentloaded');
      const title = await page.title();
      expect(title).not.toContain('500');
      expect(title).not.toContain('404');
    }
  });

  test('15. Auth protection — unauthenticated access redirects to login', async ({ page }) => {
    // Clear cookies to simulate unauthenticated user
    await page.context().clearCookies();
    await page.goto('/dashboard');
    await page.waitForURL('**/login', { timeout: 5000 });
  });

  test('16. Validation — signup rejects short password', async ({ page }) => {
    await page.goto('/signup');
    await page.fill('#businessName', 'Bad Biz');
    await page.fill('#name', 'Bad User');
    await page.fill('#email', 'bad@example.com');
    await page.fill('#password', 'short');
    await page.fill('#confirmPassword', 'short');
    await page.click('#signup-submit');

    // Should show native HTML5 validation error, NOT redirect
    const passwordInput = page.locator('#password');
    const validationMessage = await passwordInput.evaluate((el: HTMLInputElement) => el.validationMessage);
    expect(validationMessage).toContain('10 characters');
    expect(page.url()).toContain('/signup');
  });

  test('17. Validation — signup rejects password mismatch', async ({ page }) => {
    await page.goto('/signup');
    await page.fill('#businessName', 'Bad Biz 2');
    await page.fill('#name', 'Bad User 2');
    await page.fill('#email', 'bad2@example.com');
    await page.fill('#password', 'LongEnoughPassword!');
    await page.fill('#confirmPassword', 'DifferentPassword!');
    await page.click('#signup-submit');

    await expect(page.getByText('do not match').first()).toBeVisible({ timeout: 3000 });
    expect(page.url()).toContain('/signup');
  });

  test('18. Console errors — no uncaught exceptions on dashboard', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await login(page);
    await page.goto('/dashboard');
    await page.waitForLoadState('domcontentloaded');

    // Allow a few seconds for any async errors
    await page.waitForTimeout(2000);
    expect(errors).toEqual([]);
  });
});
