import { test, expect, Page } from '@playwright/test';

const TS = Date.now();
const TEST_EMAIL = `qa_drafts_${TS}@ezbillz-test.com`;
const TEST_PASSWORD = 'SecurePass_2026!';
const BIZ_NAME = `QA Drafts ${TS}`;

async function signupAndLogin(page: Page) {
  await page.goto('/signup');
  await page.waitForTimeout(1000);
  await page.fill('#businessName', BIZ_NAME);
  await page.fill('#name', 'QA Tester');
  await page.fill('#email', TEST_EMAIL);
  await page.fill('#password', TEST_PASSWORD);
  await page.fill('#confirmPassword', TEST_PASSWORD);
  await page.click('#signup-submit');
  await page.waitForURL('**/dashboard', { timeout: 15000 });
}

test.describe.serial('Drafts Recovery E2E', () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await signupAndLogin(page);
  });

  test.afterAll(async () => {
    await page.close();
  });

  // A — Invoice recovery
  test('A — Invoice recovery', async () => {
    await page.goto('/invoices/new');
    
    // Switch to TAX_INVOICE if not already
    await page.locator('select').first().selectOption('TAX_INVOICE');
    
    // Fill data
    await page.fill('input[placeholder="Acme Corp"]', 'Draft Customer');
    
    // Wait for auto-save (debounce is 1.5s, wait 2s)
    await expect(page.getByText('Saving draft...')).toBeVisible();
    await expect(page.getByText(/Draft saved at/)).toBeVisible({ timeout: 15000 });
    
    // Refresh page
    await page.reload();
    
    // Recover
    await expect(page.locator('text=You have an unsaved draft')).toBeVisible();
    await page.click('button:has-text("Recover Draft")');
    
    // Verify
    await expect(page.locator('input[placeholder="Acme Corp"]')).toHaveValue('Draft Customer');
    
    // Clear draft for next tests
    await page.click('button:has-text("Discard")');
  });

  // B — Quotation recovery
  test('B — Quotation recovery', async () => {
    await page.goto('/invoices/new');
    await page.locator('select').first().selectOption('QUOTATION');
    await page.fill('input[placeholder="Acme Corp"]', 'Quote Customer');
    await expect(page.getByText('Saving draft...')).toBeVisible();
    await expect(page.getByText(/Draft saved at/)).toBeVisible({ timeout: 15000 });
    await page.reload();
    await expect(page.locator('text=You have an unsaved draft')).toBeVisible();
    await page.click('button:has-text("Recover Draft")');
    await expect(page.locator('input[placeholder="Acme Corp"]')).toHaveValue('Quote Customer');
    await page.click('button:has-text("Discard")');
  });

  // C — Delivery Challan recovery
  test('C — Delivery Challan recovery', async () => {
    await page.goto('/invoices/new');
    await page.locator('select').first().selectOption('DELIVERY_CHALLAN');
    await page.fill('input[placeholder="Acme Corp"]', 'Challan Customer');
    await expect(page.getByText('Saving draft...')).toBeVisible();
    await expect(page.getByText(/Draft saved at/)).toBeVisible({ timeout: 15000 });
    await page.reload();
    await expect(page.locator('text=You have an unsaved draft')).toBeVisible();
    await page.click('button:has-text("Recover Draft")');
    await expect(page.locator('input[placeholder="Acme Corp"]')).toHaveValue('Challan Customer');
    await page.click('button:has-text("Discard")');
  });

  // D — Purchase recovery
  test('D — Purchase recovery', async () => {
    await page.goto('/purchases');
    await page.click('button:has-text("Record Purchase")');
    
    await page.fill('input[placeholder="BILL-001"]', 'DRAFT-BILL');
    await expect(page.getByText('Saving draft...')).toBeVisible();
    await expect(page.getByText(/Draft saved at/)).toBeVisible({ timeout: 15000 });
    
    await page.reload();
    await page.click('button:has-text("Record Purchase")'); // Re-open modal
    await expect(page.locator('text=You have an unsaved draft')).toBeVisible();
    await page.click('button:has-text("Recover Draft")');
    await expect(page.locator('input[placeholder="BILL-001"]')).toHaveValue('DRAFT-BILL');
    await page.click('button:has-text("Discard")');
  });

  // E — Discard
  test('E — Discard', async () => {
    await page.goto('/customers');
    await page.click('button:has-text("Add Customer")');
    await page.fill('input[placeholder="Acme Corp"]', 'Discard Test');
    await expect(page.getByText('Saving draft...')).toBeVisible();
    await expect(page.getByText(/Draft saved at/)).toBeVisible({ timeout: 15000 });
    
    await page.reload();
    await page.click('button:has-text("Add Customer")');
    await expect(page.locator('text=You have an unsaved draft')).toBeVisible();
    await page.click('button:has-text("Discard")');
    await expect(page.locator('text=You have an unsaved draft')).not.toBeVisible();
  });

  // F — Successful submission
  test('F — Successful submission consumes draft', async () => {
    await page.goto('/customers');
    await page.click('button:has-text("Add Customer")');
    await page.fill('input[placeholder="Acme Corp"]', 'Submit Test Customer');
    await expect(page.getByText('Saving draft...')).toBeVisible();
    await expect(page.getByText(/Draft saved at/)).toBeVisible({ timeout: 15000 });
    
    // Submit
    await page.click('button:has-text("Save Customer")');
    
    // Should be in table and draft cleared
    await expect(page.locator('td:has-text("Submit Test Customer")')).toBeVisible();
    
    // Reopen modal to ensure no draft banner
    await page.click('button:has-text("Add Customer")');
    await expect(page.locator('text=You have an unsaved draft')).not.toBeVisible();
  });

  // G — Failed submission
  test('G — Failed submission preserves draft', async () => {
    await page.goto('/customers');
    await page.click('button:has-text("Add Customer")');
    // Clear the name (violates HTML5 required)
    await page.evaluate(() => {
      document.querySelector('input[placeholder="Acme Corp"]')?.removeAttribute('required');
    });
    // This will trigger server validation error
    await page.fill('input[placeholder="Acme Corp"]', '');
    await page.fill('input[placeholder="GSTIN"]', '12345'); // invalid GST
    
    await expect(page.getByText('Saving draft...')).toBeVisible();
    await expect(page.getByText(/Draft saved at/)).toBeVisible({ timeout: 15000 });
    
    await page.click('button:has-text("Save Customer")');
    
    // Expect error toast
    await expect(page.locator('.toast.error, .toast-error, div:has-text("Validation failed")')).toBeVisible({ timeout: 5000 });
    
    // Reload and check draft remains
    await page.reload();
    await page.click('button:has-text("Add Customer")');
    await expect(page.locator('text=You have an unsaved draft')).toBeVisible();
  });
});
