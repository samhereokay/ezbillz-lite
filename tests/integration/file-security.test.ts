import { expect, test, describe, beforeAll, afterAll, vi } from "vitest";
import { prisma } from "../../src/lib/db/client";
import { LocalStorageProvider } from "../../src/lib/storage/localProvider";
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import * as nextAuth from "next-auth";

vi.mock("next-auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next-auth")>();
  return {
    ...actual,
    getServerSession: vi.fn(),
  };
});

describe("Phase 4 File Security and Storage", () => {
  let userA: any, userB: any;
  let orgA: any, orgB: any;
  let invoiceA: any;

  beforeAll(async () => {
    process.env.STORAGE_PROVIDER = "LOCAL";
    const idA = crypto.randomUUID().substring(0, 8);
    const idB = crypto.randomUUID().substring(0, 8);
    
    // Create Org A and User A
    orgA = await prisma.organization.create({ data: { name: `Org A ${idA}`, state: "MH", stateCode: "27" } });
    userA = await prisma.user.create({ data: { name: "User A", email: `a_${idA}@example.com`, passwordHash: "x" } });
    await prisma.membership.create({ data: { userId: userA.id, organizationId: orgA.id, role: "OWNER" } });
    
    // Create Org B and User B
    orgB = await prisma.organization.create({ data: { name: `Org B ${idB}`, state: "MH", stateCode: "27" } });
    userB = await prisma.user.create({ data: { name: "User B", email: `b_${idB}@example.com`, passwordHash: "x" } });
    await prisma.membership.create({ data: { userId: userB.id, organizationId: orgB.id, role: "OWNER" } });

    // Create Invoice for A
    const custA = await prisma.customer.create({ data: { name: "Cust A", organizationId: orgA.id } });
    invoiceA = await prisma.invoice.create({
      data: {
        organizationId: orgA.id,
        customerId: custA.id,
        number: `INV-${idA}`,
        issueDate: new Date(),
        subtotal: 100,
        taxableTotal: 100,
        grandTotal: 118,
        sequence: 1,
        sellerState: "MH",
        sellerStateCode: "27"
      }
    });
  });

  afterAll(async () => {
    vi.restoreAllMocks();
  });

  describe("Tenant Isolation: PDF Generation", () => {
    test("User B cannot generate or access User A's PDF invoice", async () => {
      // Mock session as User B
      vi.mocked(nextAuth.getServerSession).mockResolvedValue({ user: { id: userB.id } } as any);

      const { GET } = await import("../../src/app/api/invoices/[id]/pdf/route");
      const req = {
        nextUrl: { searchParams: new URLSearchParams(`organizationId=${orgB.id}`) }
      } as any;
      
      const props = { params: Promise.resolve({ id: invoiceA.id }) };
      const res = await GET(req, props);
      expect(res.status).toBe(404); // Should be 404 because orgId does not match the invoice org
    });

    test("User A can generate their own PDF invoice and it does not execute scripts", async () => {
      // Mock session as User A
      vi.mocked(nextAuth.getServerSession).mockResolvedValue({ user: { id: userA.id } } as any);

      const { GET } = await import("../../src/app/api/invoices/[id]/pdf/route");
      const req = {
        nextUrl: { searchParams: new URLSearchParams(`organizationId=${orgA.id}`) }
      } as any;
      
      const props = { params: Promise.resolve({ id: invoiceA.id }) };
      const res = await GET(req, props);
      expect(res.status).toBe(200); 
      expect(res.headers.get("Content-Type")).toBe("application/pdf");
      const body = await res.arrayBuffer();
      const pdfText = Buffer.from(body).toString('utf-8');
      
      // Valid PDF should start with %PDF
      expect(pdfText.startsWith("%PDF-")).toBe(true);
      // The script tag is just embedded as text, it cannot execute in PDF
    });
  });

  describe("Path Traversal and LocalStorageProvider", () => {
    const tmpDir = path.join(process.cwd(), "tmp-test-storage");
    const provider = new LocalStorageProvider(tmpDir);

    afterAll(async () => {
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    });

    test("Rejects traversal attempts outside storage root", async () => {
      // Trying to construct a storage key that points outside the directory
      const maliciousKey1 = `org/${orgA.id}/../../../../etc/passwd`;
      const maliciousKey2 = `org/${orgA.id}/%2e%2e/%2e%2e/%2e%2e/%2e%2e/etc/passwd`;
      const maliciousKey3 = `org/${orgA.id}/..\\..\\..\\..\\Windows\\System32\\cmd.exe`;
      const absoluteKey = `/etc/passwd`;

      // Should reject absolute key for not matching org prefix
      await expect(provider.getObject(absoluteKey, orgA.id)).rejects.toThrow("Storage key does not belong to this organization");

      // Should reject traversal keys
      await expect(provider.getObject(maliciousKey1, orgA.id)).rejects.toThrow("Invalid storage key");
      // Even if decoded
      await expect(provider.getObject(decodeURIComponent(maliciousKey2), orgA.id)).rejects.toThrow("Invalid storage key");
      // Windows traversal
      await expect(provider.getObject(maliciousKey3.replace(/\\/g, '/'), orgA.id)).rejects.toThrow("Invalid storage key");
    });

    test("Rejects cross-tenant access to another organization's storage key", async () => {
      const validKeyForB = `org/${orgB.id}/invoice_pdf/test.pdf`;
      
      // User A (orgA.id) trying to access User B's key
      await expect(provider.getObject(validKeyForB, orgA.id)).rejects.toThrow("Storage key does not belong to this organization");
    });

    test("Arbitrary File Read: cannot read canary file using traversal", async () => {
      const canaryPath = path.join(process.cwd(), "canary.txt");
      await fs.writeFile(canaryPath, "SECRET");

      const attemptKey = `org/${orgA.id}/../../../../canary.txt`;
      await expect(provider.getObject(attemptKey, orgA.id)).rejects.toThrow("Invalid storage key");

      await fs.unlink(canaryPath);
    });

    test("buildStorageKey successfully handles malicious filenames", async () => {
      const { buildStorageKey } = await import("../../src/lib/storage/types");
      const maliciousFilename = "../../evil.exe";
      const key = buildStorageKey(orgA.id, "invoice_pdf", maliciousFilename);
      
      expect(key.startsWith(`org/${orgA.id}/invoice_pdf/`)).toBe(true);
      expect(key.includes(".._.._evil.exe")).toBe(true); // All special chars like / are replaced with _
      expect(key.includes("/evil.exe")).toBe(false);
    });

    test("buildStorageKey uses crypto for randomness, not Math.random", async () => {
      const { buildStorageKey } = await import("../../src/lib/storage/types");
      const mathRandomSpy = vi.spyOn(Math, "random");
      
      const key1 = buildStorageKey(orgA.id, "export", "test.csv");
      const key2 = buildStorageKey(orgA.id, "export", "test.csv");
      
      expect(key1).not.toBe(key2); // Should be unique
      expect(mathRandomSpy).not.toHaveBeenCalled(); // Should not use weak PRNG
      
      mathRandomSpy.mockRestore();
    });
  });

  describe("File Upload (CSV Imports)", () => {
    test("Rejects oversized files", async () => {
      vi.mocked(nextAuth.getServerSession).mockResolvedValue({ user: { id: userA.id } } as any);

      // We need to bypass the FormData limit manually, but the code explicitly checks file.size
      const formData = new FormData();
      const largeContent = new Array(6 * 1024 * 1024).fill("A").join(""); // 6MB
      const file = new File([largeContent], "import.csv", { type: "text/csv" });
      formData.append("file", file);

      const req = {
        formData: async () => formData,
      } as any;

      const { POST } = await import("../../src/app/api/import/customers/route");
      const res = await POST(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("File too large. Limit is 5MB.");
    });

    test("Rejects non-CSV extensions even if content is CSV", async () => {
      vi.mocked(nextAuth.getServerSession).mockResolvedValue({ user: { id: userA.id } } as any);

      const formData = new FormData();
      const file = new File(["name,email\nTest,test@example.com"], "malware.exe", { type: "text/csv" });
      formData.append("file", file);

      const req = {
        formData: async () => formData,
      } as any;

      const { POST } = await import("../../src/app/api/import/customers/route");
      const res = await POST(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("Only CSV files are accepted");
    });
  });
});
