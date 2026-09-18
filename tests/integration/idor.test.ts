import { expect, test, describe, beforeAll, afterAll } from "vitest";
import { prisma } from "../../src/lib/db/client";
import { createInvoice } from "../../src/server/invoiceService";
import { createPayment } from "../../src/server/paymentService";
import { recordStockMovement } from "../../src/server/inventoryService";
import { InvoiceType, PaymentDirection, StockMovementType } from "@prisma/client";
import { newIdempotencyKey } from "../../src/lib/utils";
import crypto from "crypto";

describe("IDOR / Cross-Tenant Object Injection", () => {
  let orgA: any, orgB: any;
  let customerB: any, supplierB: any, productB: any, warehouseA: any;
  
  beforeAll(async () => {
    const uniqueSuffix = crypto.randomUUID().substring(0, 8);
    
    orgA = await prisma.organization.create({
      data: { name: `Org A ${uniqueSuffix}`, state: "Maharashtra", stateCode: "27" }
    });
    orgB = await prisma.organization.create({
      data: { name: `Org B ${uniqueSuffix}`, state: "Karnataka", stateCode: "29" }
    });
    
    warehouseA = await prisma.warehouse.create({
      data: { organizationId: orgA.id, name: `WH A ${uniqueSuffix}`, isDefault: true, isActive: true }
    });

    customerB = await prisma.customer.create({
      data: { organizationId: orgB.id, name: `Customer B ${uniqueSuffix}` }
    });
    supplierB = await prisma.supplier.create({
      data: { organizationId: orgB.id, name: `Supplier B ${uniqueSuffix}` }
    });
    productB = await prisma.product.create({
      data: { organizationId: orgB.id, name: `Product B ${uniqueSuffix}`, salePrice: 100 }
    });
  });

  afterAll(async () => {
    // Clean up ONLY the data created by this test
    if (orgA?.id) {
      await prisma.organization.delete({ where: { id: orgA.id } });
    }
    if (orgB?.id) {
      await prisma.organization.delete({ where: { id: orgB.id } });
    }
  });

  test("Invoice Service rejects cross-tenant productId", async () => {
    const customerA = await prisma.customer.create({
      data: { organizationId: orgA.id, name: "Customer A" }
    });

    await expect(
      createInvoice(prisma, {
        organizationId: orgA.id,
        customerId: customerA.id,
        idempotencyKey: newIdempotencyKey(),
        lines: [
          {
            productId: productB.id,
            description: "Hacked product",
            quantity: 1,
            unitPrice: 100,
            gstRatePercent: 18,
            taxableValue: 100,
            cgstAmount: 9,
            sgstAmount: 9,
            igstAmount: 0,
            lineTotal: 118,
          }
        ]
      })
    ).rejects.toThrow(/Product.*not found|does not belong/i);
  });

  test("Inventory Service rejects cross-tenant productId", async () => {
    await expect(
      recordStockMovement(prisma, {
        organizationId: orgA.id,
        warehouseId: warehouseA.id,
        productId: productB.id,
        type: StockMovementType.ADJUSTMENT,
        quantity: 10,
      })
    ).rejects.toThrow(/Product.*not found|does not belong/i);
  });

  test("Payment Service rejects cross-tenant customerId and supplierId", async () => {
    await expect(
      createPayment(prisma, {
        organizationId: orgA.id,
        direction: PaymentDirection.RECEIVED,
        amount: 100,
        customerId: customerB.id,
        idempotencyKey: newIdempotencyKey(),
      })
    ).rejects.toThrow(/Customer.*not found|does not belong/i);

    await expect(
      createPayment(prisma, {
        organizationId: orgA.id,
        direction: PaymentDirection.PAID,
        amount: 100,
        supplierId: supplierB.id,
        idempotencyKey: newIdempotencyKey(),
      })
    ).rejects.toThrow(/Supplier.*not found|does not belong/i);
  });
});
