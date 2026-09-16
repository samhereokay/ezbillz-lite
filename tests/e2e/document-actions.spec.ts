import { test, expect, Page } from '@playwright/test';

const TS = Date.now();
const TEST_EMAIL = `qa_doc_${TS}@ezbillz-test.com`;
const TEST_PASSWORD = 'SecurePass_2026!';
const BIZ_NAME = `QA Business Doc ${TS}`;

async function signup(page: Page) {
  await page.goto('/signup');
  await page.waitForTimeout(1000);
  await expect(page.locator('h2:has-text("Create your account")')).toBeVisible();

  await page.fill('#businessName', BIZ_NAME);
  await page.fill('#name', 'QA Tester');
  await page.fill('#email', TEST_EMAIL);
  await page.fill('#password', TEST_PASSWORD);
  await page.fill('#confirmPassword', TEST_PASSWORD);
  await page.click('#signup-submit');

  await page.waitForURL('**/dashboard', { timeout: 15000 });
}

test.describe.serial('Document Actions (Duplicate & Convert)', () => {
  let customerId: string;
  let productId: string;
  
  test('1. Setup Account, Customer, and Product', async ({ page }) => {
    await signup(page);

    // Create Customer
    await page.goto('/customers/new');
    await page.fill('input[placeholder="Acme Corp"]', 'Doc Tester');
    await page.fill('input[placeholder="1234567890"]', '9999999999');
    await page.click('button:has-text("Save Customer")');
    await page.waitForURL('**/customers');

    // Create Product
    await page.goto('/products/new');
    await page.fill('input[placeholder="MacBook Pro"]', 'Doc Product');
    await page.fill('input[placeholder="1999.00"]', '100');
    await page.click('button:has-text("Save Product")');
    await page.waitForURL('**/products');
  });

  test('2. Quotation Creation and Conversion to Invoice', async ({ page, request }) => {
    // We can use UI or API to create quotation. UI is preferred.
    await page.goto('/login');
    await page.fill('#email', TEST_EMAIL);
    await page.fill('#password', TEST_PASSWORD);
    await page.click('#login-submit');
    await page.waitForURL('**/dashboard');

    // Create Quotation
    await page.goto('/quotations/new');
    await page.waitForTimeout(500); // let fetch resolve
    
    // Select customer
    await page.selectOption('#customer-select', { index: 1 });
    
    // Add product
    await page.selectOption('select:has-text("— Pick from catalog or enter manually —")', { index: 1 });
    
    // Submit
    await page.click('button[type="submit"]');
    
    // Wait for redirect to invoice detail
    await page.waitForURL(/\/invoices\/c[a-z0-9]+/);
    
    // Assert quotation was created
    await expect(page.locator('.page-title')).toContainText('QTN-00000');
    
    // Test conversion
    page.on('dialog', dialog => dialog.accept());
    await page.click('#convert-quotation-btn');
    
    // Wait for the new invoice page
    // The page reloads to a new ID
    await page.waitForTimeout(2000); 
    await expect(page.locator('.page-title')).toContainText('INV-00000');
    
    // Quotation should still exist if we go to /quotations
    await page.goto('/quotations');
    await expect(page.locator('text=QTN-00000')).toBeVisible();
    await expect(page.locator('text=CONVERTED')).toBeVisible();
  });

  test('3. Invoice Duplication', async ({ page }) => {
    await page.goto('/login');
    await page.fill('#email', TEST_EMAIL);
    await page.fill('#password', TEST_PASSWORD);
    await page.click('#login-submit');
    await page.waitForURL('**/dashboard');
    
    // Go to the invoice we just converted
    await page.goto('/invoices');
    await page.click('text=INV-00000');
    await page.waitForURL(/\/invoices\/c[a-z0-9]+/);
    
    page.on('dialog', dialog => dialog.accept());
    await page.click('#duplicate-btn');
    
    await page.waitForTimeout(2000); 
    await expect(page.locator('.page-title')).toContainText('INV-00001');
  });
});
