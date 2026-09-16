import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma } from "@/lib/db/client";
import { recordStockMovement, initializeDefaultWarehouse, InventoryError } from "@/server/inventoryService";
import { StockMovementType } from "@prisma/client";

describe("Inventory Service", () => {
  let orgId: string;
  let warehouseId: string;
  let productId: string;

  beforeEach(async () => {
    const org = await prisma.organization.create({
      data: {
        name: "Inv Test Org",
        state: "Test",
        stateCode: "99",
      },
    });
    orgId = org.id;

    const warehouse = await initializeDefaultWarehouse(prisma, orgId);
    warehouseId = warehouse.id;

    const product = await prisma.product.create({
      data: {
        organizationId: orgId,
        name: "Test Product",
        salePrice: 100,
      }
    });
    productId = product.id;
  });

  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { name: "Inv Test Org" } });
  });

  it("should initialize default warehouse", async () => {
    const warehouse = await initializeDefaultWarehouse(prisma, orgId);
    expect(warehouse.id).toBe(warehouseId);
    expect(warehouse.name).toBe("Main Warehouse");
  });

  it("should record opening stock safely", async () => {
    const movement = await recordStockMovement(prisma, {
      organizationId: orgId,
      productId,
      warehouseId,
      type: StockMovementType.OPENING,
      quantity: 100,
    });
    expect(movement.quantity.toNumber()).toBe(100);
    expect(movement.type).toBe("OPENING");

    const balance = await prisma.stockBalance.findFirst({
      where: { organizationId: orgId, productId, warehouseId }
    });
    expect(balance?.quantity.toNumber()).toBe(100);
  });

  it("should prevent negative stock", async () => {
    await expect(recordStockMovement(prisma, {
      organizationId: orgId,
      productId,
      warehouseId,
      type: StockMovementType.SALE_ISSUE,
      quantity: 50,
    })).rejects.toThrow(InventoryError);
  });

  it("should process valid outbound stock", async () => {
    await recordStockMovement(prisma, {
      organizationId: orgId,
      productId,
      warehouseId,
      type: StockMovementType.OPENING,
      quantity: 100,
    });

    await recordStockMovement(prisma, {
      organizationId: orgId,
      productId,
      warehouseId,
      type: StockMovementType.SALE_ISSUE,
      quantity: 30,
    });

    const balance = await prisma.stockBalance.findFirst({
      where: { organizationId: orgId, productId, warehouseId }
    });
    expect(balance?.quantity.toNumber()).toBe(70);
  });

  it("should enforce idempotency", async () => {
    await recordStockMovement(prisma, {
      organizationId: orgId,
      productId,
      warehouseId,
      type: StockMovementType.PURCHASE_RECEIPT,
      quantity: 50,
      referenceType: "PURCHASE",
      referenceId: "PURCHASE-123",
    });

    // Replay exact same request
    await recordStockMovement(prisma, {
      organizationId: orgId,
      productId,
      warehouseId,
      type: StockMovementType.PURCHASE_RECEIPT,
      quantity: 50,
      referenceType: "PURCHASE",
      referenceId: "PURCHASE-123",
    });

    // Should only have 50 in balance, not 100
    const balance = await prisma.stockBalance.findFirst({
      where: { organizationId: orgId, productId, warehouseId }
    });
    expect(balance?.quantity.toNumber()).toBe(50);
    
    const movements = await prisma.stockMovement.findMany({
      where: { referenceId: "PURCHASE-123" }
    });
    expect(movements.length).toBe(1);
  });
  
  it("should safely handle concurrent stock OUT", async () => {
    await recordStockMovement(prisma, {
      organizationId: orgId,
      productId,
      warehouseId,
      type: StockMovementType.OPENING,
      quantity: 10,
    });

    // We try to issue 6 items concurrently, twice. It should fail one of them.
    const p1 = recordStockMovement(prisma, {
      organizationId: orgId, productId, warehouseId,
      type: StockMovementType.SALE_ISSUE, quantity: 6,
    });
    
    const p2 = recordStockMovement(prisma, {
      organizationId: orgId, productId, warehouseId,
      type: StockMovementType.SALE_ISSUE, quantity: 6,
    });
    
    const results = await Promise.allSettled([p1, p2]);
    const succeeded = results.filter(r => r.status === "fulfilled").length;
    const failed = results.filter(r => r.status === "rejected").length;
    
    expect(succeeded).toBe(1);
    expect(failed).toBe(1);
    
    const balance = await prisma.stockBalance.findFirst({
      where: { organizationId: orgId, productId, warehouseId }
    });
    expect(balance?.quantity.toNumber()).toBe(4);
  });
});
