import { PrismaClient, InvoiceType, StockMovementType, InvoiceStatus } from "@prisma/client";
import { createInvoice } from "../src/server/invoiceService";
import { newIdempotencyKey } from "../src/lib/utils";
import assert from "assert";

const prisma = new PrismaClient();

async function run() {
  console.log("Setting up integration test data...");
  const org = await prisma.organization.create({
    data: {
      id: "org_" + Date.now(),
      name: "Test Org",
      state: "Maharashtra",
      stateCode: "27", // Maharashtra
      invoiceNextSeq: 1,
      quotationNextSeq: 1,
    }
  });

  const customer = await prisma.customer.create({
    data: {
      id: "cust_" + Date.now(),
      organizationId: org.id,
      name: "Test Customer",
      stateCode: "27", // Intra-state
    }
  });

  const product = await prisma.product.create({
    data: {
      id: "prod_" + Date.now(),
      organizationId: org.id,
      name: "Test Product",
      salePrice: 100,
      gstRatePercent: 18,
    }
  });

  console.log("1. Quotation creation does not mutate stock.");
  const quotation = await createInvoice(prisma, {
    organizationId: org.id,
    customerId: customer.id,
    type: InvoiceType.QUOTATION,
    idempotencyKey: newIdempotencyKey(),
    lines: [
      { productId: product.id, description: "Test", quantity: 2, unitPrice: 100, gstRatePercent: 18, discountPercent: 0 }
    ]
  });

  const stockBefore = await prisma.stockMovement.count({ where: { organizationId: org.id } });
  assert.strictEqual(stockBefore, 0, "Stock should not be mutated for quotation");
  assert.ok(quotation.number.startsWith("QTN-"), "Quotation number should use QTN prefix");

  console.log("2. Quotation -> Invoice conversion");
  // Simulate POST /api/invoices/[id]/convert
  const convertedInvoice = await prisma.$transaction(async (tx) => {
    const invoice = await createInvoice(tx as any, {
      organizationId: org.id,
      customerId: customer.id,
      type: InvoiceType.TAX_INVOICE,
      idempotencyKey: newIdempotencyKey(),
      lines: quotation.items.map((i: any) => ({
        productId: i.productId!, description: i.description, quantity: Number(i.quantity), unitPrice: Number(i.unitPrice), gstRatePercent: Number(i.gstRatePercent), discountPercent: 0, priceIncludesTax: false
      }))
    });
    
    await tx.invoice.update({
      where: { id: quotation.id },
      data: { status: InvoiceStatus.CONVERTED, linkedInvoiceId: invoice.id }
    });
    
    return invoice;
  });

  const stockAfter = await prisma.stockMovement.count({ where: { organizationId: org.id } });
  assert.strictEqual(stockAfter, 1, "Stock should be mutated EXACTLY ONCE for tax invoice");
  
  const q2 = await prisma.invoice.findUnique({ where: { id: quotation.id } });
  assert.strictEqual(q2?.status, InvoiceStatus.CONVERTED, "Quotation should be marked converted");
  assert.strictEqual(q2?.linkedInvoiceId, convertedInvoice.id, "Linked invoice ID should match");
  assert.ok(convertedInvoice.number.startsWith("INV-"), "Converted invoice should use INV prefix");

  console.log("3. Duplicate invoice");
  const duplicatedInvoice = await createInvoice(prisma, {
    organizationId: org.id,
    customerId: convertedInvoice.customerId,
    type: convertedInvoice.type,
    idempotencyKey: newIdempotencyKey(),
    lines: convertedInvoice.items.map((i: any) => ({
      productId: i.productId!, description: i.description, quantity: Number(i.quantity), unitPrice: Number(i.unitPrice), gstRatePercent: Number(i.gstRatePercent), discountPercent: 0, priceIncludesTax: false
    }))
  });

  assert.ok(duplicatedInvoice.id !== convertedInvoice.id, "Duplicated invoice should have a new ID");
  assert.ok(duplicatedInvoice.number !== convertedInvoice.number, "Duplicated invoice should have a new number");
  assert.strictEqual(Number(duplicatedInvoice.amountPaid), 0, "Duplicated invoice should not copy payment state");
  
  const stockFinal = await prisma.stockMovement.count({ where: { organizationId: org.id } });
  assert.strictEqual(stockFinal, 2, "Duplication of TAX_INVOICE correctly triggers another stock issue");

  console.log("All explicit tests PASSED.");
}

run().catch(console.error).finally(() => prisma.$disconnect());
