import { expect, test, describe, beforeAll, afterAll, vi } from "vitest";
import { parseCsvFile, CsvError } from "../../src/server/csvService";
import { z } from "zod";

describe("CSV Content Validation", () => {
  const schema = z.object({
    name: z.string().min(1).max(255),
    email: z.string().email().max(255),
  });

  const rowMapper = (row: any) => ({
    name: row.name || row.Name,
    email: row.email || row.Email,
  });

  test("A. Valid CSV", async () => {
    const csv = "name,email\nAlice,alice@example.com";
    const res = await parseCsvFile(Buffer.from(csv), schema, rowMapper);
    expect(res.errors.length).toBe(0);
    expect(res.valid.length).toBe(1);
    expect(res.valid[0].name).toBe("Alice");
  });

  test("B. Binary/non-text bytes", async () => {
    // Random binary bytes
    const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
    const res = await parseCsvFile(buf, schema, rowMapper).catch(e => e);
    // Should either throw CsvError or return errors in validation
    if (res instanceof Error) {
      expect(res.message).toBeDefined();
    } else {
      expect(res.errors.length).toBeGreaterThan(0);
      expect(res.valid.length).toBe(0);
    }
  });

  test("C. HTML content", async () => {
    const csv = "<html><script>alert(1)</script></html>";
    const res = await parseCsvFile(Buffer.from(csv), schema, rowMapper).catch(e => e);
    if (res instanceof Error) {
      expect(res.message).toBeDefined();
    } else {
      expect(res.errors.length).toBeGreaterThan(0);
      expect(res.valid.length).toBe(0);
    }
  });

  test("D. Executable-looking content", async () => {
    const csv = "MZ\x90\x00\x03\x00\x00\x00\x04\x00\x00\x00\xFF\xFF";
    const res = await parseCsvFile(Buffer.from(csv), schema, rowMapper).catch(e => e);
    if (res instanceof Error) {
      expect(res.message).toBeDefined();
    } else {
      expect(res.errors.length).toBeGreaterThan(0);
      expect(res.valid.length).toBe(0);
    }
  });

  test("E. Malformed CSV with broken quoting", async () => {
    const csv = 'name,email\n"Alice,alice@example.com\nBob,bob@example.com';
    const res = await parseCsvFile(Buffer.from(csv), schema, rowMapper).catch(e => e);
    // Usually csv-parse throws an error for unclosed quotes
    expect(res).toBeInstanceOf(Error);
  });

  test("F. Extremely long CSV field", async () => {
    const longName = "A".repeat(200000);
    const csv = `name,email\n${longName},alice@example.com`;
    const res = await parseCsvFile(Buffer.from(csv), schema, rowMapper).catch(e => e);
    if (res instanceof Error) {
      expect(res.message).toBeDefined();
    } else {
      expect(res.errors.length).toBeGreaterThan(0);
    }
  });

  test("G. Excessive row count", async () => {
    // 6000 rows
    const header = "name,email\n";
    const row = "Alice,alice@example.com\n";
    const csv = header + row.repeat(6000);
    const res = await parseCsvFile(Buffer.from(csv), schema, rowMapper).catch(e => e);
    // Should reject for exceeding max rows (e.g. 5000)
    expect(res).toBeInstanceOf(Error);
    if (res instanceof Error) {
      expect(res.message).toContain("Exceeded maximum allowed rows");
    }
  });
});
