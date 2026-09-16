import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireOrgContext, UnauthorizedError, ForbiddenError } from "@/server/tenant";

export async function GET(req: NextRequest) {
  try {
    const ctx = await requireOrgContext();
    const { searchParams } = req.nextUrl;
    const warehouseId = searchParams.get("warehouseId") ?? undefined;
    const search = searchParams.get("q") ?? undefined;
    const lowStock = searchParams.get("lowStock") === "true";
    const take = Math.min(Number(searchParams.get("take") ?? 50), 200);
    const skip = Number(searchParams.get("skip") ?? 0);

    // Fetch all stock balances for the organization
    const balances = await prisma.stockBalance.findMany({
      where: {
        organizationId: ctx.organizationId,
        ...(warehouseId ? { warehouseId } : {}),
        ...(search ? {
          product: {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { sku: { contains: search, mode: "insensitive" } },
            ],
          },
        } : {}),
      },
      include: {
        product: { select: { name: true, sku: true, unit: true, lowStockThreshold: true } },
        warehouse: { select: { name: true } },
        location: { select: { name: true } },
      },
      orderBy: { product: { name: "asc" } },
      take,
      skip,
    });

    const total = await prisma.stockBalance.count({
      where: {
        organizationId: ctx.organizationId,
        ...(warehouseId ? { warehouseId } : {}),
      },
    });

    // Filter low-stock if requested
    const filtered = lowStock
      ? balances.filter(b => {
          const threshold = b.product.lowStockThreshold ?? 0;
          return Number(b.quantity) <= threshold;
        })
      : balances;

    return NextResponse.json({ balances: filtered, total });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    return NextResponse.json({ error: "Request failed" }, { status: 500 });
  }
}
