import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { prisma } from "@/lib/db/client";
import { GET } from "@/app/api/search/route";
import { NextRequest } from "next/server";
import * as tenant from "@/server/tenant";

// Mock tenant authorization
vi.mock("@/server/tenant", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/tenant")>();
  return {
    ...actual,
    requireOrgContext: vi.fn(),
  };
});

describe("Global Search API Integration", () => {
  let orgA: any;
  let orgB: any;
  let customerA: any;
  let customerB: any;
  let invoiceA: any;

  beforeEach(async () => {
    await prisma.stockMovement.deleteMany({});
    await prisma.invoiceItem.deleteMany({});
    await prisma.payment.deleteMany({});
    await prisma.invoice.deleteMany({});
    await prisma.customer.deleteMany({});
    await prisma.organization.deleteMany({});

    orgA = await prisma.organization.create({
      data: { name: "Org A", state: "West Bengal", stateCode: "19" }
    });

    orgB = await prisma.organization.create({
      data: { name: "Org B", state: "Maharashtra", stateCode: "27" }
    });

    customerA = await prisma.customer.create({
      data: { organizationId: orgA.id, name: "Alpha Customer", phone: "9999911111" }
    });

    customerB = await prisma.customer.create({
      data: { organizationId: orgB.id, name: "Alpha Corp", phone: "9999922222" }
    });

    invoiceA = await prisma.invoice.create({
      data: {
        organizationId: orgA.id,
        customerId: customerA.id,
        number: "INV-9999",
        sequence: 9999,
        sellerState: "West Bengal",
        sellerStateCode: "19",
        subtotal: 100, taxableTotal: 100, grandTotal: 100
      }
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should fail for unauthenticated requests", async () => {
    // @ts-ignore
    tenant.requireOrgContext.mockRejectedValueOnce(new Error("Unauthorized"));
    const req = new NextRequest(new URL("http://localhost/api/search?q=Alpha"));
    const res = await GET(req);
    expect(res.status).toBe(500); // or 401 depending on error handling in route.ts
  });

  it("should enforce tenant isolation", async () => {
    // Org A context
    // @ts-ignore
    tenant.requireOrgContext.mockResolvedValue({ organizationId: orgA.id });
    
    const req = new NextRequest(new URL("http://localhost/api/search?q=Alpha"));
    const res = await GET(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    
    // Should see Alpha Customer (orgA) and INV-9999 (matches customer name)
    // but NOT Alpha Corp (orgB)
    expect(data.results.length).toBe(2);
    expect(data.results.some((r: any) => r.id === `cus-${customerA.id}`)).toBe(true);
    expect(data.results.some((r: any) => r.id === `inv-${invoiceA.id}`)).toBe(true);
    expect(data.results.some((r: any) => r.id === `cus-${customerB.id}`)).toBe(false);
  });

  it("should prioritize exact matches", async () => {
    // @ts-ignore
    tenant.requireOrgContext.mockResolvedValue({ organizationId: orgA.id });
    
    const req = new NextRequest(new URL("http://localhost/api/search?q=INV-9999"));
    const res = await GET(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    
    expect(data.results.length).toBe(1);
    expect(data.results[0].title).toBe("INV-9999");
    expect(data.results[0].id).toContain("inv-");
  });

  it("should enforce query length minimums", async () => {
    // @ts-ignore
    tenant.requireOrgContext.mockResolvedValue({ organizationId: orgA.id });
    
    const req = new NextRequest(new URL("http://localhost/api/search?q=A"));
    const res = await GET(req);
    const data = await res.json();
    
    expect(data.results.length).toBe(0);
  });
});
