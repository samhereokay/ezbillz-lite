import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireOrgContext, UnauthorizedError, ForbiddenError } from "@/server/tenant";

export async function GET(req: NextRequest) {
  try {
    const { organizationId } = await requireOrgContext();
    const { searchParams } = new URL(req.url);
    const query = searchParams.get("q");

    if (!query || query.trim().length < 2 || query.length > 100) {
      return NextResponse.json({ results: [] });
    }

    const q = query.trim();
    // For fuzzy matching in some cases
    const containsQuery = { contains: q, mode: "insensitive" as const };
    
    // We limit each type to max 5 items to avoid huge payloads
    const TAKE = 5;

    const [
      customers,
      suppliers,
      products,
      invoices,
      purchases,
      payments
    ] = await Promise.all([
      prisma.customer.findMany({
        where: {
          organizationId,
          deletedAt: null,
          OR: [
            { name: containsQuery },
            { phone: containsQuery },
            { email: containsQuery },
            { gstin: containsQuery }
          ]
        },
        take: TAKE
      }),
      prisma.supplier.findMany({
        where: {
          organizationId,
          deletedAt: null,
          OR: [
            { name: containsQuery },
            { phone: containsQuery },
            { email: containsQuery },
            { gstin: containsQuery }
          ]
        },
        take: TAKE
      }),
      prisma.product.findMany({
        where: {
          organizationId,
          deletedAt: null,
          OR: [
            { name: containsQuery },
            { sku: containsQuery },
            { hsnCode: containsQuery }
          ]
        },
        take: TAKE
      }),
      prisma.invoice.findMany({
        where: {
          organizationId,
          OR: [
            { number: containsQuery },
            { customer: { name: containsQuery } }
          ]
        },
        include: { customer: true },
        take: TAKE
      }),
      prisma.purchase.findMany({
        where: {
          organizationId,
          OR: [
            { billNumber: containsQuery },
            { supplier: { name: containsQuery } }
          ]
        },
        include: { supplier: true },
        take: TAKE
      }),
      prisma.payment.findMany({
        where: {
          organizationId,
          receiptNumber: containsQuery
        },
        take: TAKE
      })
    ]);

    // Format all results into the SearchResult interface
    let results: any[] = [];

    // Prioritize Exact Matches (case insensitive)
    const qLower = q.toLowerCase();

    // 1. Invoices
    invoices.forEach(inv => {
      const isExact = inv.number.toLowerCase() === qLower;
      const item = {
        id: `inv-${inv.id}`,
        type: inv.type, // e.g. TAX_INVOICE, QUOTATION
        title: inv.number,
        subtitle: inv.customer.name,
        url: `/invoices/${inv.id}`
      };
      if (isExact) results.unshift(item); else results.push(item);
    });

    // 2. Customers
    customers.forEach(c => {
      const isExact = c.name.toLowerCase() === qLower || c.phone === qLower || c.email?.toLowerCase() === qLower;
      const item = {
        id: `cus-${c.id}`,
        type: "CUSTOMER",
        title: c.name,
        subtitle: [c.phone, c.email].filter(Boolean).join(" · "),
        url: `/customers?id=${c.id}`
      };
      if (isExact) results.unshift(item); else results.push(item);
    });

    // 3. Suppliers
    suppliers.forEach(s => {
      const item = {
        id: `sup-${s.id}`,
        type: "SUPPLIER",
        title: s.name,
        subtitle: [s.phone, s.email].filter(Boolean).join(" · "),
        url: `/suppliers?id=${s.id}`
      };
      results.push(item);
    });

    // 4. Products
    products.forEach(p => {
      const isExact = p.sku?.toLowerCase() === qLower || p.name.toLowerCase() === qLower;
      const item = {
        id: `prd-${p.id}`,
        type: "PRODUCT",
        title: p.name,
        subtitle: [p.sku, p.hsnCode].filter(Boolean).join(" · "),
        url: `/products?id=${p.id}`
      };
      if (isExact) results.unshift(item); else results.push(item);
    });

    // 5. Purchases
    purchases.forEach(p => {
      const item = {
        id: `pur-${p.id}`,
        type: "PURCHASE",
        title: p.billNumber || `Purchase ${p.id.slice(-6)}`,
        subtitle: p.supplier.name,
        url: `/purchases/${p.id}`
      };
      results.push(item);
    });

    // 6. Payments
    payments.forEach(p => {
      const isExact = p.receiptNumber?.toLowerCase() === qLower;
      const item = {
        id: `pay-${p.id}`,
        type: "PAYMENT",
        title: p.receiptNumber || `Payment ${p.id.slice(-6)}`,
        subtitle: `₹${Number(p.amount).toFixed(2)}`,
        url: `/payments/${p.id}` // assuming payment details view exists
      };
      if (isExact) results.unshift(item); else results.push(item);
    });

    return NextResponse.json({ results });
  } catch (error: any) {
    if (error instanceof UnauthorizedError || error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    console.error("Search error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
