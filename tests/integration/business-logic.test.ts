import { expect, test, describe, beforeAll, afterAll } from "vitest";
import { prisma } from "../../src/lib/db/client";
import { createPayment } from "../../src/server/paymentService";
import { recordStockMovement } from "../../src/server/inventoryService";
import { InvoiceType, PaymentDirection, StockMovementType } from "@prisma/client";
import { newIdempotencyKey } from "../../src/lib/utils";
import crypto from "crypto";

describe("Phase 6 - Business Logic & Concurrency", () => {
  let org: any;
  let customer: any;
  let product: any;
  let warehouse: any;

  beforeAll(async () => {
    const uniqueSuffix = crypto.randomUUID().substring(0, 8);
    org = await prisma.organization.create({
      data: { name: `Org ${uniqueSuffix}`, state: "Delhi", stateCode: "07" }
    });
    customer = await prisma.customer.create({
      data: { organizationId: org.id, name: `Cust ${uniqueSuffix}` }
    });
    product = await prisma.product.create({
      data: { organizationId: org.id, name: `Prod ${uniqueSuffix}`, salePrice: 100 }
    });
    warehouse = await prisma.warehouse.create({
      data: { organizationId: org.id, name: `WH ${uniqueSuffix}`, isDefault: true, isActive: true }
    });
  });

  afterAll(async () => {
    await prisma.organization.delete({ where: { id: org.id } }).catch(() => {});
  });

  test("1. Payment Overpayment Race Condition", async () => {
    // Create an invoice
    const inv = await prisma.invoice.create({
      data: {
        organizationId: org.id,
        customerId: customer.id,
        type: InvoiceType.TAX_INVOICE,
        status: "ISSUED",
        number: "INV-RACE-01",
        sequence: 1,
        sellerState: "Delhi",
        sellerStateCode: "07",
        subtotal: 100,
        taxableTotal: 100,
        cgstTotal: 0,
        sgstTotal: 0,
        igstTotal: 0,
        roundOff: 0,
        grandTotal: 100,
        idempotencyKey: newIdempotencyKey(),
        amountPaid: 0, // Starts at 0
      }
    });

    // Fire 3 concurrent payments of 100 each. 
    // They have different idempotency keys, so they are independent payments.
    // If business logic race condition exists, they might all read amountPaid=0
    // and successfully process, resulting in amountPaid=100 (if overwritten) or 300 (if incremented blindly).
    
    const results = await Promise.allSettled([
      createPayment(prisma, {
        organizationId: org.id,
        direction: PaymentDirection.RECEIVED,
        amount: 100,
        customerId: customer.id,
        invoiceId: inv.id,
        idempotencyKey: newIdempotencyKey()
      }),
      createPayment(prisma, {
        organizationId: org.id,
        direction: PaymentDirection.RECEIVED,
        amount: 100,
        customerId: customer.id,
        invoiceId: inv.id,
        idempotencyKey: newIdempotencyKey()
      }),
      createPayment(prisma, {
        organizationId: org.id,
        direction: PaymentDirection.RECEIVED,
        amount: 100,
        customerId: customer.id,
        invoiceId: inv.id,
        idempotencyKey: newIdempotencyKey()
      })
    ]);

    const finalInv = await prisma.invoice.findUnique({ where: { id: inv.id } });
    
    // We expect the payment logic to reject overpayment! 
    // If it allows overpayment, amountPaid will be > 100, or the total payments created will sum to 300.
    const payments = await prisma.payment.findMany({ where: { invoiceId: inv.id } });
    const totalPayments = payments.reduce((sum, p) => sum + Number(p.amount), 0);
    
    console.log("Total Payments Created:", totalPayments);
    console.log("Invoice amountPaid:", finalInv?.amountPaid);
    
    // Test that the race condition is PREVENTED.
    expect(totalPayments).toBe(100);
    expect(Number(finalInv?.amountPaid)).toBe(100);
  });

  test("2. Inventory Inbound Concurrency / Duplicate Rows", async () => {
    // Create a new product for this test to ensure it has no existing StockBalance
    const p2 = await prisma.product.create({
      data: { organizationId: org.id, name: `Prod2`, salePrice: 100 }
    });

    // Fire 5 concurrent inbound stock movements (e.g. from 5 concurrent purchase receipts)
    await Promise.allSettled([
      recordStockMovement(prisma, {
        organizationId: org.id,
        warehouseId: warehouse.id,
        productId: p2.id,
        type: StockMovementType.OPENING,
        quantity: 10,
        referenceType: "OPENING",
        referenceId: "1",
      }),
      recordStockMovement(prisma, {
        organizationId: org.id,
        warehouseId: warehouse.id,
        productId: p2.id,
        type: StockMovementType.OPENING,
        quantity: 10,
        referenceType: "OPENING",
        referenceId: "2",
      }),
      recordStockMovement(prisma, {
        organizationId: org.id,
        warehouseId: warehouse.id,
        productId: p2.id,
        type: StockMovementType.OPENING,
        quantity: 10,
        referenceType: "OPENING",
        referenceId: "3",
      })
    ]);

    // Check how many StockBalance rows were created!
    const balances = await prisma.stockBalance.findMany({
      where: { organizationId: org.id, productId: p2.id, warehouseId: warehouse.id, locationId: null }
    });

    console.log("StockBalance rows created:", balances.length);
    // Should be exactly 1!
    expect(balances.length).toBe(1);
    expect(Number(balances[0].quantity)).toBe(30);
  });
});
