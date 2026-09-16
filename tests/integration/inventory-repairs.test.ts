import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma } from "@/lib/db/client";
import { recordStockMovement, InventoryError } from "@/server/inventoryService";
import { StockMovementType } from "@prisma/client";

describe("Phase 13 Repair Tests", () => {
  let orgId: string;
  let warehouseId: string;
  let productId: string;

  beforeEach(async () => {
    const org = await prisma.organization.create({
      data: { name: "Repair Org", state: "Test", stateCode: "99" },
    });
    orgId = org.id;

    const warehouse = await prisma.warehouse.create({
      data: { organizationId: orgId, name: "Repair Warehouse", isActive: true },
    });
    warehouseId = warehouse.id;

    const product = await prisma.product.create({
      data: { organizationId: orgId, name: "Repair Product", salePrice: 100 },
    });
    productId = product.id;
  });

  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { name: "Repair Org" } });
  });

  describe("Warehouse", () => {
    it("cross-tenant warehouse rejected", async () => {
      const org2 = await prisma.organization.create({
        data: { name: "Other Org", state: "Test", stateCode: "99" },
      });
      await expect(recordStockMovement(prisma, {
        organizationId: org2.id,
        productId,
        warehouseId,
        type: StockMovementType.OPENING,
        quantity: 10,
      })).rejects.toThrow("Warehouse does not belong to this organization.");
    });

    it("inactive warehouse rejected", async () => {
      const inactiveWh = await prisma.warehouse.create({
        data: { organizationId: orgId, name: "Inactive", isActive: false },
      });
      await expect(recordStockMovement(prisma, {
        organizationId: orgId,
        productId,
        warehouseId: inactiveWh.id,
        type: StockMovementType.OPENING,
        quantity: 10,
      })).rejects.toThrow("Warehouse is inactive.");
    });

    it("missing warehouse rejected", async () => {
      await expect(recordStockMovement(prisma, {
        organizationId: orgId,
        productId,
        warehouseId: "clzzzzzzzzzzzzzzzzzzzzzz",
        type: StockMovementType.OPENING,
        quantity: 10,
      })).rejects.toThrow("Warehouse not found.");
    });
  });

  describe("Location", () => {
    it("cross-tenant location rejected", async () => {
      const loc = await prisma.location.create({
        data: { organizationId: orgId, warehouseId, name: "Loc1", isActive: true },
      });
      const org2 = await prisma.organization.create({
        data: { name: "Other Org", state: "Test", stateCode: "99" },
      });
      const wh2 = await prisma.warehouse.create({
        data: { organizationId: org2.id, name: "WH2", isActive: true },
      });
      await expect(recordStockMovement(prisma, {
        organizationId: org2.id,
        productId,
        warehouseId: wh2.id,
        locationId: loc.id,
        type: StockMovementType.OPENING,
        quantity: 10,
      })).rejects.toThrow("Invalid location.");
    });

    it("location must belong to supplied warehouse", async () => {
      const wh2 = await prisma.warehouse.create({
        data: { organizationId: orgId, name: "WH2", isActive: true },
      });
      const loc = await prisma.location.create({
        data: { organizationId: orgId, warehouseId: wh2.id, name: "Loc1", isActive: true },
      });
      await expect(recordStockMovement(prisma, {
        organizationId: orgId,
        productId,
        warehouseId,
        locationId: loc.id,
        type: StockMovementType.OPENING,
        quantity: 10,
      })).rejects.toThrow("Invalid location.");
    });
  });

  describe("StockBalance Uniqueness", () => {
    it("duplicate NULL-location balance rejected", async () => {
      await prisma.stockBalance.create({
        data: { organizationId: orgId, warehouseId, productId, quantity: 10 },
      });
      
      // Attempting to create another row with null locationId should fail at DB level
      await expect(prisma.stockBalance.create({
        data: { organizationId: orgId, warehouseId, productId, quantity: 20 },
      })).rejects.toThrow();
    });

    it("duplicate non-NULL-location balance rejected", async () => {
      const loc = await prisma.location.create({
        data: { organizationId: orgId, warehouseId, name: "Loc1", isActive: true },
      });
      await prisma.stockBalance.create({
        data: { organizationId: orgId, warehouseId, locationId: loc.id, productId, quantity: 10 },
      });
      
      await expect(prisma.stockBalance.create({
        data: { organizationId: orgId, warehouseId, locationId: loc.id, productId, quantity: 20 },
      })).rejects.toThrow();
    });
  });

  describe("History Deletion", () => {
    it("deleting/archiving warehouse cannot delete StockMovement", async () => {
      const localProduct = await prisma.product.create({
        data: { organizationId: orgId, name: "History Product", salePrice: 100 },
      });
      await recordStockMovement(prisma, {
        organizationId: orgId,
        productId: localProduct.id,
        warehouseId,
        type: StockMovementType.OPENING,
        quantity: 10,
      });

      // Try to delete the warehouse
      await expect(prisma.warehouse.delete({ where: { id: warehouseId } })).rejects.toThrow();
    });

    it("deleting/archiving location cannot delete StockMovement", async () => {
      const loc = await prisma.location.create({
        data: { organizationId: orgId, warehouseId, name: "Loc1", isActive: true },
      });
      const localProduct2 = await prisma.product.create({
        data: { organizationId: orgId, name: "History Product 2", salePrice: 100 },
      });
      await recordStockMovement(prisma, {
        organizationId: orgId,
        productId: localProduct2.id,
        warehouseId,
        locationId: loc.id,
        type: StockMovementType.OPENING,
        quantity: 10,
      });

      // Try to delete the location
      await expect(prisma.location.delete({ where: { id: loc.id } })).rejects.toThrow();
    });
  });
});