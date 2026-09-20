import { expect, test, describe, beforeAll, afterAll, vi } from "vitest";
import { prisma } from "../../src/lib/db/client";
import { requireOrgContext } from "../../src/server/tenant";
import * as nextAuth from "next-auth";
import crypto from "crypto";

vi.mock("next-auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next-auth")>();
  return {
    ...actual,
    getServerSession: vi.fn(),
  };
});

describe("Phase 3 Injection and Input Validation", () => {
  let userA: any, orgA: any, membershipA: any;
  const rawPassword = "SecurePassword123!";

  beforeAll(async () => {
    const uniqueSuffix = crypto.randomUUID().substring(0, 8);
    
    orgA = await prisma.organization.create({
      data: { name: `Org A ${uniqueSuffix}`, state: "MH", stateCode: "27" }
    });

    const signupReq = {
      json: async () => ({
        name: "Test User A",
        email: `testA_${uniqueSuffix}@example.com`,
        password: rawPassword,
        businessName: "Business A",
        state: "MH",
        stateCode: "27"
      })
    } as any;

    const { POST } = await import("../../src/app/api/auth/signup/route");
    const res = await POST(signupReq);
    const data = await res.json();
    
    userA = await prisma.user.findUnique({ where: { id: data.userId } });
    membershipA = await prisma.membership.findFirst({ where: { userId: userA.id, organizationId: data.organizationId } });

    vi.mocked(nextAuth.getServerSession).mockResolvedValue({ user: { id: userA.id } } as any);
  });

  afterAll(async () => {
    vi.restoreAllMocks();
  });

  test("SQL Injection: Cannot drop tables via search parameter", async () => {
    const { GET } = await import("../../src/app/api/customers/route");
    const req = {
      url: `http://localhost/api/customers?search='; DROP TABLE "User"; --`,
      nextUrl: { searchParams: new URLSearchParams(`q='; DROP TABLE "User"; --`) }
    } as any;
    
    const res = await GET(req);
    expect(res.status).toBe(200);
    const users = await prisma.user.findMany();
    expect(users.length).toBeGreaterThan(0);
  });

  test("CSV Formula Injection: Malicious characters are escaped during export", async () => {
    const { POST } = await import("../../src/app/api/customers/route");
    const createReq = {
      json: async () => ({
        name: "=cmd|' /C calc'!A0",
        email: "attacker@example.com"
      })
    } as any;
    
    const res = await POST(createReq);
    expect(res.status).toBe(201);

    const { GET } = await import("../../src/app/api/export/customers/route");
    const req = { url: "http://localhost/api/export/customers", nextUrl: { searchParams: new URLSearchParams() } } as any;
    const exportRes = await GET(req);
    const csvData = await exportRes.text();
    
    expect(csvData).toContain("'=cmd|' /C calc'!A0"); 
  });

  test("Mass Assignment: organizationId override is ignored", async () => {
    const { POST } = await import("../../src/app/api/customers/route");
    const maliciousReq = {
      json: async () => ({
        name: "Mass Assigned Customer",
        organizationId: "some-other-org-id",
        tenantId: "tenant-injection"
      })
    } as any;
    
    const res = await POST(maliciousReq);
    const data = await res.json();
    
    const customer = await prisma.customer.findUnique({ where: { id: data.customer.id } });
    expect(customer?.organizationId).toBe(membershipA.organizationId);
    expect(customer?.organizationId).not.toBe("some-other-org-id");
  });

  test("Business Logic & Input Validation: Negative invoice quantity is rejected", async () => {
    const customer = await prisma.customer.create({
      data: { name: "Test Cust", organizationId: membershipA.organizationId }
    });
    const product = await prisma.product.create({
      data: { name: "Test Prod", salePrice: 100, gstRatePercent: 18, organizationId: membershipA.organizationId }
    });

    const { POST } = await import("../../src/app/api/invoices/route");
    const maliciousInvoice = {
      json: async () => ({
        customerId: customer.id,
        date: new Date().toISOString(),
        items: [
          {
            productId: product.id,
            quantity: -5,
            price: 100
          }
        ]
      })
    } as any;
    
    const res = await POST(maliciousInvoice);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBeDefined();
  });

  test("Error Leakage: Malformed JSON does not leak stack trace or internal paths", async () => {
    const { POST } = await import("../../src/app/api/customers/route");
    const malformedReq = {
      json: async () => { throw new SyntaxError("Unexpected token in JSON"); }
    } as any;
    
    try {
      const res = await POST(malformedReq);
      if (res && typeof res.json === "function") {
        const text = await res.text();
        expect(text).not.toContain("node_modules");
        expect(text).not.toContain("SyntaxError:");
        expect(text).not.toContain("/src/app/api");
      }
    } catch (e: any) {
      expect(e.message).not.toContain("DATABASE_URL");
    }
  });

  test("XSS/HTML Injection: Payloads are stored safely and not executed on the server", async () => {
    const { POST } = await import("../../src/app/api/customers/route");
    const xssPayload = "<script>alert('xss')</script><img src=x onerror=alert(1)>";
    const xssReq = {
      json: async () => ({
        name: xssPayload,
        email: "xss@example.com",
        addressLine1: "javascript:alert(1)"
      })
    } as any;
    
    const res = await POST(xssReq);
    expect(res.status).toBe(201);
    const data = await res.json();
    
    const customer = await prisma.customer.findUnique({ where: { id: data.customer.id } });
    expect(customer?.name).toBe(xssPayload);
    
    const { GET } = await import("../../src/app/api/customers/route");
    const getReq = { nextUrl: { searchParams: new URLSearchParams() } } as any;
    const getRes = await GET(getReq);
    const getData = await getRes.json();
    const retrieved = getData.customers.find((c: any) => c.id === customer?.id);
    expect(retrieved.name).toBe(xssPayload);
  });
});
