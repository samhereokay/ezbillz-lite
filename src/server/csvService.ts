import { parse } from "csv-parse";
import { stringify } from "csv-stringify";
import { z } from "zod";
import { prisma } from "@/lib/db/client";

export class CsvError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CsvError";
  }
}

export async function parseCsvFile<T>(
  fileBuffer: Buffer,
  schema: z.ZodSchema<T>,
  rowMapper: (row: any) => any
): Promise<{ valid: T[]; errors: string[] }> {
  return new Promise((resolve, reject) => {
    const valid: T[] = [];
    const errors: string[] = [];

    const MAX_ROWS = 5000;
    const MAX_RECORD_SIZE = 100000;

    const parser = parse({
      columns: true,
      skip_empty_lines: true,
      trim: true,
      bom: true, // Handle UTF-8 BOM
      max_record_size: MAX_RECORD_SIZE,
      relax_column_count: false, // Ensure strict column count matching headers
    });

    let rowIndex = 1; // 1 represents the header row

    parser.on("readable", function () {
      let record;
      while ((record = parser.read()) !== null) {
        rowIndex++;
        if (rowIndex > MAX_ROWS) {
          parser.destroy(new CsvError(`Exceeded maximum allowed rows (${MAX_ROWS})`));
          return;
        }
        try {
          const mapped = rowMapper(record);
          const parsed = schema.safeParse(mapped);
          if (parsed.success) {
            valid.push(parsed.data);
          } else {
            const errs = parsed.error.errors.map((e) => {
              const field = e.path.join(".");
              return field ? `[${field}] ${e.message}` : e.message;
            }).join(", ");
            errors.push(`Row ${rowIndex}: ${errs}`);
          }
        } catch (err: any) {
          errors.push(`Row ${rowIndex}: ${err.message}`);
        }
      }
    });

    parser.on("error", function (err: Error) {
      reject(new CsvError(`Failed to parse CSV: ${err.message}`));
    });

    parser.on("end", function () {
      if (rowIndex === 1) {
        resolve({ valid: [], errors: ["No valid CSV data found or missing headers"] });
        return;
      }
      if (valid.length === 0) {
        resolve({ valid: [], errors: ["No valid records found in CSV"] });
        return;
      }
      resolve({ valid, errors });
    });

    parser.write(fileBuffer);
    parser.end();
  });
}

// ---------------------------------------------------------------------------
// IMPORT PRODUCTS
// ---------------------------------------------------------------------------

const productCsvSchema = z.object({
  name: z.string().min(1, "Name is required").max(255),
  sku: z.string().max(255).optional(),
  hsnCode: z.string().max(255).optional(),
  salePrice: z.number().nonnegative("Sale price must be >= 0"),
  purchasePrice: z.number().nonnegative("Purchase price must be >= 0").optional(),
  gstRatePercent: z.number().min(0).max(100).default(0),
});

export async function importProductsCsv(organizationId: string, fileBuffer: Buffer) {
  const result = await parseCsvFile(
    fileBuffer,
    productCsvSchema,
    (row) => ({
      name: row.Name || row.name,
      sku: row.SKU || row.sku || undefined,
      hsnCode: row.HSN || row.hsnCode || undefined,
      salePrice: Number(row.SalePrice || row.salePrice || 0),
      purchasePrice: row.PurchasePrice || row.purchasePrice ? Number(row.PurchasePrice || row.purchasePrice) : undefined,
      gstRatePercent: row.GSTRate || row.gstRatePercent ? Number(row.GSTRate || row.gstRatePercent) : 0,
    })
  );

  if (result.errors.length > 0) {
    return result; // Reject entirely if there are errors (Lite V1)
  }

  // Check duplicates in the DB
  const skus = result.valid.map(p => p.sku).filter(Boolean) as string[];
  if (skus.length > 0) {
      const existing = await prisma.product.findMany({
          where: { organizationId, sku: { in: skus } },
          select: { sku: true }
      });
      if (existing.length > 0) {
          const exSkus = existing.map(e => e.sku).join(", ");
          result.errors.push(`Duplicate SKUs found in database: ${exSkus}`);
          return result;
      }
  }

  // Transactional insert
  await prisma.$transaction(async (tx) => {
    await tx.product.createMany({
      data: result.valid.map((p) => ({
        organizationId,
        name: p.name,
        sku: p.sku,
        hsnCode: p.hsnCode,
        salePrice: p.salePrice,
        purchasePrice: p.purchasePrice,
        gstRatePercent: p.gstRatePercent,
      })),
    });
  });

  return result;
}

// ---------------------------------------------------------------------------
// EXPORT PRODUCTS
// ---------------------------------------------------------------------------

function escapeFormula(val: any): string {
  if (typeof val === "string" && /^[=+\-@]/.test(val)) {
    return "'" + val; // Prevent CSV injection
  }
  return String(val ?? "");
}

export async function exportProductsCsv(organizationId: string): Promise<string> {
  const products = await prisma.product.findMany({
    where: { organizationId, deletedAt: null },
    orderBy: { createdAt: "desc" },
  });

  const records = products.map((p) => ({
    Name: escapeFormula(p.name),
    SKU: escapeFormula(p.sku),
    HSN: escapeFormula(p.hsnCode),
    SalePrice: p.salePrice.toString(),
    PurchasePrice: p.purchasePrice?.toString() || "",
    GSTRate: p.gstRatePercent.toString(),
  }));

  return new Promise((resolve, reject) => {
    stringify(records, { header: true }, (err: Error | undefined, output: string) => {
      if (err) reject(err);
      else resolve(output);
    });
  });
}

// ---------------------------------------------------------------------------
// IMPORT CUSTOMERS
// ---------------------------------------------------------------------------

const customerCsvSchema = z.object({
  name: z.string().min(1, "Name is required").max(255),
  gstin: z.string().max(255).optional(),
  state: z.string().max(255).optional(),
  stateCode: z.string().max(255).optional(),
  phone: z.string().max(255).optional(),
  email: z.string().email().max(255).optional().or(z.literal("")),
  addressLine1: z.string().max(1000).optional(),
});

export async function importCustomersCsv(organizationId: string, fileBuffer: Buffer) {
  const result = await parseCsvFile(
    fileBuffer,
    customerCsvSchema,
    (row) => ({
      name: row.Name || row.name,
      gstin: row.GSTIN || row.gstin || undefined,
      state: row.State || row.state || undefined,
      stateCode: row.StateCode || row.stateCode || undefined,
      phone: row.Phone || row.phone || undefined,
      email: row.Email || row.email || undefined,
      addressLine1: row.Address || row.addressLine1 || undefined,
    })
  );

  if (result.errors.length > 0) return result;

  await prisma.$transaction(async (tx) => {
    await tx.customer.createMany({
      data: result.valid.map((c) => ({
        organizationId,
        name: c.name,
        gstin: c.gstin,
        state: c.state,
        stateCode: c.stateCode,
        phone: c.phone,
        email: c.email || undefined,
        addressLine1: c.addressLine1,
      })),
    });
  });

  return result;
}

export async function exportCustomersCsv(organizationId: string): Promise<string> {
  const customers = await prisma.customer.findMany({
    where: { organizationId, deletedAt: null },
    orderBy: { createdAt: "desc" },
  });
  const records = customers.map((c) => ({
    Name: escapeFormula(c.name),
    GSTIN: escapeFormula(c.gstin),
    State: escapeFormula(c.state),
    StateCode: escapeFormula(c.stateCode),
    Phone: escapeFormula(c.phone),
    Email: escapeFormula(c.email),
    Address: escapeFormula(c.addressLine1),
  }));
  return new Promise((resolve, reject) => {
    stringify(records, { header: true }, (err: Error | undefined, output: string) => {
      if (err) reject(err); else resolve(output);
    });
  });
}

// ---------------------------------------------------------------------------
// IMPORT SUPPLIERS
// ---------------------------------------------------------------------------

const supplierCsvSchema = z.object({
  name: z.string().min(1, "Name is required").max(255),
  gstin: z.string().max(255).optional(),
  state: z.string().max(255).optional(),
  stateCode: z.string().max(255).optional(),
  phone: z.string().max(255).optional(),
  email: z.string().email().max(255).optional().or(z.literal("")),
});

export async function importSuppliersCsv(organizationId: string, fileBuffer: Buffer) {
  const result = await parseCsvFile(
    fileBuffer,
    supplierCsvSchema,
    (row) => ({
      name: row.Name || row.name,
      gstin: row.GSTIN || row.gstin || undefined,
      state: row.State || row.state || undefined,
      stateCode: row.StateCode || row.stateCode || undefined,
      phone: row.Phone || row.phone || undefined,
      email: row.Email || row.email || undefined,
    })
  );

  if (result.errors.length > 0) return result;

  await prisma.$transaction(async (tx) => {
    await tx.supplier.createMany({
      data: result.valid.map((c) => ({
        organizationId,
        name: c.name,
        gstin: c.gstin,
        state: c.state,
        stateCode: c.stateCode,
        phone: c.phone,
        email: c.email || undefined,
      })),
    });
  });

  return result;
}

export async function exportSuppliersCsv(organizationId: string): Promise<string> {
  const suppliers = await prisma.supplier.findMany({
    where: { organizationId, deletedAt: null },
    orderBy: { createdAt: "desc" },
  });
  const records = suppliers.map((c) => ({
    Name: escapeFormula(c.name),
    GSTIN: escapeFormula(c.gstin),
    State: escapeFormula(c.state),
    StateCode: escapeFormula(c.stateCode),
    Phone: escapeFormula(c.phone),
    Email: escapeFormula(c.email),
  }));
  return new Promise((resolve, reject) => {
    stringify(records, { header: true }, (err: Error | undefined, output: string) => {
      if (err) reject(err); else resolve(output);
    });
  });
}

// ---------------------------------------------------------------------------
// EXPORT STOCK
// ---------------------------------------------------------------------------

export async function exportStockBalanceCsv(organizationId: string): Promise<string> {
  const balances = await prisma.stockBalance.findMany({
    where: { organizationId },
    include: { product: true, warehouse: true, location: true },
    orderBy: { updatedAt: "desc" },
  });
  const records = balances.map((b) => ({
    Product: escapeFormula(b.product.name),
    SKU: escapeFormula(b.product.sku),
    Warehouse: escapeFormula(b.warehouse.name),
    Location: escapeFormula(b.location?.name),
    Quantity: b.quantity.toString(),
  }));
  return new Promise((resolve, reject) => {
    stringify(records, { header: true }, (err: Error | undefined, output: string) => {
      if (err) reject(err); else resolve(output);
    });
  });
}

export async function exportStockLedgerCsv(organizationId: string): Promise<string> {
  const movements = await prisma.stockMovement.findMany({
    where: { organizationId },
    include: { product: true, Warehouse: true, Location: true },
    orderBy: { createdAt: "desc" },
  });
  const records = movements.map((m) => ({
    Date: m.createdAt.toISOString(),
    Product: escapeFormula(m.product.name),
    SKU: escapeFormula(m.product.sku),
    Warehouse: escapeFormula(m.Warehouse?.name),
    Location: escapeFormula(m.Location?.name),
    Type: escapeFormula(m.type),
    Quantity: m.quantity.toString(),
    ReferenceType: escapeFormula(m.referenceType),
    ReferenceID: escapeFormula(m.referenceId),
  }));
  return new Promise((resolve, reject) => {
    stringify(records, { header: true }, (err: Error | undefined, output: string) => {
      if (err) reject(err); else resolve(output);
    });
  });
}