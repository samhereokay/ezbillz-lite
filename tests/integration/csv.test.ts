import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { importProductsCsv, exportProductsCsv } from "@/server/csvService";
import { prisma } from "@/lib/db/client";
import { parseCsvFile } from "@/server/csvService";
import { z } from "zod";

describe("CSV Service", () => {
  let orgId: string;

  beforeEach(async () => {
    const org = await prisma.organization.create({
      data: {
        name: "CSV Test Org",
        state: "Test",
        stateCode: "99",
      },
    });
    orgId = org.id;
  });

  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { name: "CSV Test Org" } });
  });

  it("should parse valid CSV buffer correctly", async () => {
    const csvData = "Name,SKU,HSN,SalePrice,PurchasePrice,GSTRate\nWidget A,WID-A,1234,100.50,50,18\nWidget B,, , 200,,0\n";
    const buffer = Buffer.from(csvData, "utf-8");
    
    const result = await parseCsvFile(
      buffer,
      z.object({ name: z.string(), salePrice: z.number() }),
      (row) => ({ name: row.Name, salePrice: Number(row.SalePrice) })
    );

    expect(result.errors.length).toBe(0);
    expect(result.valid.length).toBe(2);
    expect(result.valid[0].name).toBe("Widget A");
    expect(result.valid[1].salePrice).toBe(200);
  });

  it("should catch validation errors in CSV data", async () => {
    const csvData = "Name,SalePrice\n,100\nValid,invalid_number\n";
    const buffer = Buffer.from(csvData, "utf-8");
    
    const result = await parseCsvFile(
      buffer,
      z.object({ name: z.string().min(1), salePrice: z.number() }),
      (row) => ({ name: row.Name, salePrice: Number(row.SalePrice) })
    );

    expect(result.valid.length).toBe(0);
    expect(result.errors.length).toBe(2);
    expect(result.errors[0]).toContain("Row 2");
    expect(result.errors[1]).toContain("Row 3");
  });

  it("should import products transactionally", async () => {
    const csvData = "Name,SKU,HSN,SalePrice,PurchasePrice,GSTRate\nProduct 1,P1,1234,10,5,18\nProduct 2,P2,5678,20,10,5\n";
    const buffer = Buffer.from(csvData, "utf-8");

    const result = await importProductsCsv(orgId, buffer);
    expect(result.errors.length).toBe(0);
    expect(result.valid.length).toBe(2);

    const products = await prisma.product.findMany({ where: { organizationId: orgId } });
    expect(products.length).toBe(2);
    expect(products.find(p => p.sku === "P1")).toBeDefined();
  });

  it("should reject duplicates", async () => {
    await prisma.product.create({
      data: { organizationId: orgId, name: "Existing", sku: "EXIST-1", salePrice: 10 }
    });

    const csvData = "Name,SKU,SalePrice\nNew Prod,EXIST-1,20\n";
    const buffer = Buffer.from(csvData, "utf-8");

    const result = await importProductsCsv(orgId, buffer);
    expect(result.errors.length).toBe(1);
    expect(result.errors[0]).toContain("Duplicate SKUs");
  });

  it("should export products safely escaping formulas", async () => {
    await prisma.product.create({
      data: { organizationId: orgId, name: "=cmd|' /C calc'!A0", sku: "+123", salePrice: 10 }
    });

    const output = await exportProductsCsv(orgId);
    expect(output).toContain("'=cmd|");
    expect(output).toContain("'+123");
  });
});
