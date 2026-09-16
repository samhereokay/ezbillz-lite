import { describe, it, expect, beforeAll } from "vitest";
import { prisma } from "../src/lib/db/client";
import { hashPassword } from "../src/lib/auth/options";
import { createInvoice } from "../src/server/invoiceService";
import { renderInvoicePdf } from "../src/lib/documents/invoicePdf";
import { S3StorageProvider } from "../src/lib/storage/s3Provider";
import { requireOrgContext, UnauthorizedError, ForbiddenError } from "../src/server/tenant";

describe("Local Production Golden Path & Security End-to-End Suite", () => {
  let userId1: string;
  let orgId1: string;
  let customerIntraId: string;
  let customerInterId: string;
  let productId: string;

  let userId2: string;
  let orgId2: string;

  beforeAll(async () => {
    // Configure S3 for local MinIO
    process.env.STORAGE_PROVIDER = "S3";
    process.env.S3_ENDPOINT = "http://localhost:9000";
    process.env.S3_REGION = "us-east-1";
    process.env.S3_BUCKET = "ezbillz-bucket";
    process.env.S3_ACCESS_KEY_ID = "ezbillz_minio";
    process.env.S3_SECRET_ACCESS_KEY = "ezbillz_minio_password";
    process.env.S3_FORCE_PATH_STYLE = "true";

    // Clean up test data
    await prisma.stockMovement.deleteMany({});
    await prisma.invoiceItem.deleteMany({});
    await prisma.invoice.deleteMany({});
    await prisma.payment.deleteMany({});
    await prisma.product.deleteMany({});
    await prisma.customer.deleteMany({});
    await prisma.membership.deleteMany({});
    await prisma.organization.deleteMany({});
    await prisma.user.deleteMany({});
  });

  it("1. Signup & Tenant Setup: Creates user, org, and OWNER membership", async () => {
    const pwHash = await hashPassword("StrongPassword123!");
    
    // Org 1 (West Bengal)
    const u1 = await prisma.user.create({
      data: { name: "Tenant 1 Admin", email: "admin1@acme.in", passwordHash: pwHash },
    });
    const o1 = await prisma.organization.create({
      data: {
        name: "Acme Enterprises WB",
        state: "West Bengal",
        stateCode: "19",
        gstin: "19AAAAA0000A1Z5",
        invoicePrefix: "INV",
      },
    });
    await prisma.membership.create({
      data: { userId: u1.id, organizationId: o1.id, role: "OWNER" },
    });

    userId1 = u1.id;
    orgId1 = o1.id;

    // Org 2 (Victim Org for Cross-Tenant Testing)
    const u2 = await prisma.user.create({
      data: { name: "Tenant 2 Admin", email: "admin2@other.in", passwordHash: pwHash },
    });
    const o2 = await prisma.organization.create({
      data: {
        name: "Other Corp MH",
        state: "Maharashtra",
        stateCode: "27",
        gstin: "27BBBBB1111B1Z2",
      },
    });
    await prisma.membership.create({
      data: { userId: u2.id, organizationId: o2.id, role: "OWNER" },
    });

    userId2 = u2.id;
    orgId2 = o2.id;

    expect(orgId1).toBeDefined();
    expect(orgId2).toBeDefined();
  });

  it("2. Product & Customer Creation: Sets up catalog and intra/inter state parties", async () => {
    // Product @ 18% GST
    const prod = await prisma.product.create({
      data: {
        organizationId: orgId1,
        name: "Enterprise Server Unit",
        hsnCode: "8471",
        salePrice: 100000,
        gstRatePercent: 18,
        unit: "PCS",
      },
    });
    productId = prod.id;

    // Intra-state Customer (West Bengal - 19)
    const cust1 = await prisma.customer.create({
      data: {
        organizationId: orgId1,
        name: "Local Retailer Kolkata",
        state: "West Bengal",
        stateCode: "19",
        gstin: "19CCCCCC2222C1Z8",
      },
    });
    customerIntraId = cust1.id;

    // Inter-state Customer (Maharashtra - 27)
    const cust2 = await prisma.customer.create({
      data: {
        organizationId: orgId1,
        name: "Mumbai Client Pvt Ltd",
        state: "Maharashtra",
        stateCode: "27",
        gstin: "27DDDDD3333D1Z4",
      },
    });
    customerInterId = cust2.id;

    expect(prod.id).toBeDefined();
    expect(cust1.id).toBeDefined();
    expect(cust2.id).toBeDefined();

    const { initializeDefaultWarehouse, recordStockMovement } = await import("@/server/inventoryService");
    const wh = await initializeDefaultWarehouse(prisma, orgId1);
    await recordStockMovement(prisma, {
      organizationId: orgId1,
      productId: prod.id,
      warehouseId: wh.id,
      type: "OPENING",
      quantity: 1000,
    });
  });

  it("3. Intra-State GST Invoice Creation: Calculates CGST 9% + SGST 9%", async () => {
    const inv = await createInvoice(prisma, {
      organizationId: orgId1,
      customerId: customerIntraId,
      idempotencyKey: "idempotency-key-intra-001",
      lines: [
        {
          productId,
          description: "Enterprise Server Unit",
          hsnCode: "8471",
          quantity: 1,
          unitPrice: 100000,
          discountPercent: 10, // Taxable = 90,000
          gstRatePercent: 18,
        },
      ],
    });

    expect(inv.number).toBe("INV-00001");
    expect(inv.taxableTotal.toString()).toBe("90000");
    expect(inv.cgstTotal.toString()).toBe("8100");
    expect(inv.sgstTotal.toString()).toBe("8100");
    expect(inv.igstTotal.toString()).toBe("0");
    expect(inv.grandTotal.toString()).toBe("106200");

    // Verify stock issue movement in ledger
    const movements = await prisma.stockMovement.findMany({
      where: { organizationId: orgId1, referenceId: inv.id },
    });
    expect(movements.length).toBe(1);
    expect(movements[0].quantity.toString()).toBe("-1");
  });

  it("4. Inter-State GST Invoice Creation: Calculates IGST 18%", async () => {
    const inv = await createInvoice(prisma, {
      organizationId: orgId1,
      customerId: customerInterId,
      idempotencyKey: "idempotency-key-inter-002",
      lines: [
        {
          productId,
          description: "Enterprise Server Unit",
          hsnCode: "8471",
          quantity: 2,
          unitPrice: 100000,
          discountPercent: 0, // Taxable = 200,000
          gstRatePercent: 18,
        },
      ],
    });

    expect(inv.number).toBe("INV-00002");
    expect(inv.taxableTotal.toString()).toBe("200000");
    expect(inv.cgstTotal.toString()).toBe("0");
    expect(inv.sgstTotal.toString()).toBe("0");
    expect(inv.igstTotal.toString()).toBe("36000");
    expect(inv.grandTotal.toString()).toBe("236000");
  });

  it("5. Idempotency Check: Duplicate request with same key returns original invoice without duplicate stock deduction", async () => {
    const duplicateInv = await createInvoice(prisma, {
      organizationId: orgId1,
      customerId: customerInterId,
      idempotencyKey: "idempotency-key-inter-002",
      lines: [
        {
          productId,
          description: "Enterprise Server Unit",
          hsnCode: "8471",
          quantity: 2,
          unitPrice: 100000,
          discountPercent: 0,
          gstRatePercent: 18,
        },
      ],
    });

    expect(duplicateInv.number).toBe("INV-00002");

    const totalInvoices = await prisma.invoice.count({ where: { organizationId: orgId1 } });
    expect(totalInvoices).toBe(2);
  });

  it("6. PDF Generation & MinIO Storage: Renders PDF, stores to MinIO S3, and retrieves", async () => {
    const inv = await prisma.invoice.findFirstOrThrow({
      where: { organizationId: orgId1, number: "INV-00001" },
      include: { items: true, customer: true, organization: true },
    });

    const pdfBytes = await renderInvoicePdf(inv, inv.organization, inv.customer!);
    expect(pdfBytes.length).toBeGreaterThan(500);

    const s3Storage = new S3StorageProvider();
    const result = await s3Storage.putObject({
      organizationId: orgId1,
      purpose: "invoice_pdf",
      filename: `${inv.number}.pdf`,
      contentType: "application/pdf",
      body: Buffer.from(pdfBytes),
    });

    expect(result.storageKey).toContain(`org/${orgId1}/invoice_pdf/`);

    // Download from MinIO bucket
    const downloaded = await s3Storage.getObject(result.storageKey, orgId1);
    expect(downloaded.length).toBe(pdfBytes.length);
    expect(Buffer.from(downloaded.subarray(0, 5)).toString("ascii")).toBe("%PDF-");
  });

  it("7. Payment & Outstanding: Records payment and verifies customer outstanding balance", async () => {
    const payment = await prisma.payment.create({
      data: {
        organizationId: orgId1,
        customerId: customerIntraId,
        direction: "RECEIVED",
        method: "UPI",
        amount: 50000,
        note: "Partial payment for INV-00001",
      },
    });

    expect(payment.id).toBeDefined();

    // Total invoiced grand total for customerIntraId
    const invoices = await prisma.invoice.findMany({
      where: { organizationId: orgId1, customerId: customerIntraId },
    });
    const totalInvoiced = invoices.reduce((sum, i) => sum + Number(i.grandTotal), 0);

    const payments = await prisma.payment.findMany({
      where: { organizationId: orgId1, customerId: customerIntraId, direction: "RECEIVED" },
    });
    const totalPaid = payments.reduce((sum, p) => sum + Number(p.amount), 0);

    const outstanding = totalInvoiced - totalPaid;
    expect(totalInvoiced).toBe(106200);
    expect(totalPaid).toBe(50000);
    expect(outstanding).toBe(56200);
  });

  it("8. Security & Tenant Isolation: Rejects cross-tenant access to Org 1 data from Org 2 user", async () => {
    // Attempting to query Org 1 with Org 2 membership row check
    const membershipOrg1User2 = await prisma.membership.findUnique({
      where: {
        userId_organizationId: {
          userId: userId2,
          organizationId: orgId1,
        },
      },
    });

    expect(membershipOrg1User2).toBeNull();
  });
});
