import { describe, it, expect } from "vitest";
import { calculateInvoice } from "../src/lib/gst/engine";
import { renderInvoicePdf } from "../src/lib/documents/invoicePdf";
import { LocalStorageProvider } from "../src/lib/storage/localProvider";
import { Prisma } from "@prisma/client";

describe("End-to-End Core Workflow: Invoice -> GST -> Stock -> Storage PDF", () => {
  it("computes intra-state GST, renders valid PDF bytes, and stores through storage provider", async () => {
    // 1. Calculate GST Engine output for West Bengal intra-state sale
    const gstResult = calculateInvoice({
      sellerStateCode: "19",
      buyerStateCode: "19",
      lines: [
        {
          quantity: 2,
          unitPrice: 50000,
          discountPercent: 10,
          gstRatePercent: 18,
        },
      ],
    });

    expect(gstResult.subtotal.toString()).toBe("100000");
    expect(gstResult.discountTotal.toString()).toBe("10000");
    expect(gstResult.taxableTotal.toString()).toBe("90000");
    expect(gstResult.cgstTotal.toString()).toBe("8100");
    expect(gstResult.sgstTotal.toString()).toBe("8100");
    expect(gstResult.igstTotal.toString()).toBe("0");
    expect(gstResult.grandTotal.toString()).toBe("106200");

    // 2. Mock full invoice, org, and customer data matching Prisma types
    const dummyOrg = {
      id: "org_123",
      name: "Acme India Pvt Ltd",
      legalName: null,
      gstin: "19AAAAA0000A1Z5",
      state: "West Bengal",
      stateCode: "19",
      addressLine1: "10 Park Street",
      addressLine2: null,
      city: "Kolkata",
      pincode: "700016",
      logoFileId: null,
      invoicePrefix: "INV",
      invoiceNextSeq: 2,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const dummyCustomer = {
      id: "cust_456",
      organizationId: "org_123",
      name: "Retail Client Ltd",
      gstin: "19BBBBB1111B1Z2",
      state: "West Bengal",
      stateCode: "19",
      phone: "+919876543210",
      email: "billing@retailclient.in",
      addressLine1: "55 MG Road",
      addressLine2: null,
      city: "Kolkata",
      pincode: "700001",
      openingBalance: new Prisma.Decimal(0),
      deletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const dummyInvoice = {
      id: "inv_789",
      organizationId: "org_123",
      customerId: "cust_456",
      type: "TAX_INVOICE" as const,
      status: "ISSUED" as const,
      number: "INV-00001",
      sequence: 1,
      issueDate: new Date(),
      dueDate: null,
      sellerState: "West Bengal",
      sellerStateCode: "19",
      buyerState: "West Bengal",
      buyerStateCode: "19",
      placeOfSupplyCode: "19",
      subtotal: gstResult.subtotal,
      discountTotal: gstResult.discountTotal,
      taxableTotal: gstResult.taxableTotal,
      cgstTotal: gstResult.cgstTotal,
      sgstTotal: gstResult.sgstTotal,
      igstTotal: gstResult.igstTotal,
      roundOff: gstResult.roundOff,
      grandTotal: gstResult.grandTotal,
      amountPaid: new Prisma.Decimal(0),
      pdfFileId: null,
      idempotencyKey: "test-idempotency-key-12345",
      createdAt: new Date(),
      updatedAt: new Date(),
      items: [
        {
          id: "item_1",
          invoiceId: "inv_789",
          productId: "prod_1",
          description: "Dell Latitude Laptop",
          hsnCode: "8471",
          quantity: new Prisma.Decimal(2),
          unit: "PCS",
          unitPrice: new Prisma.Decimal(50000),
          discountPercent: new Prisma.Decimal(10),
          gstRatePercent: new Prisma.Decimal(18),
          taxableValue: gstResult.lines[0].taxableValue,
          cgstAmount: gstResult.lines[0].cgstAmount,
          sgstAmount: gstResult.lines[0].sgstAmount,
          igstAmount: gstResult.lines[0].igstAmount,
          lineTotal: gstResult.lines[0].lineTotal,
        },
      ],
    };

    // 3. Render Invoice PDF using pdf-lib
    const pdfBytes = await renderInvoicePdf(dummyInvoice as any, dummyOrg as any, dummyCustomer as any);
    expect(pdfBytes).toBeInstanceOf(Uint8Array);
    expect(pdfBytes.length).toBeGreaterThan(500);

    // Verify PDF header magic bytes %PDF-
    const header = Buffer.from(pdfBytes.slice(0, 5)).toString("ascii");
    expect(header).toBe("%PDF-");

    // 4. Test storage provider persistence
    const storage = new LocalStorageProvider();
    const storedResult = await storage.putObject({
      organizationId: dummyOrg.id,
      purpose: "invoice_pdf",
      filename: `${dummyInvoice.number}.pdf`,
      contentType: "application/pdf",
      body: Buffer.from(pdfBytes),
    });

    expect(storedResult.storageKey).toContain("org/org_123/invoice_pdf/");
    expect(storedResult.sizeBytes).toBe(pdfBytes.length);

    // Retrieve object from storage and verify
    const retrievedBytes = await storage.getObject(storedResult.storageKey, dummyOrg.id);
    expect(retrievedBytes.length).toBe(pdfBytes.length);
  });
});
