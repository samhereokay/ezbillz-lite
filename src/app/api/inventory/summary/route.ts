import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireOrgContext, UnauthorizedError, ForbiddenError } from "@/server/tenant";

export async function GET(_req: NextRequest) {
  try {
    const ctx = await requireOrgContext();
    const orgId = ctx.organizationId;

    const [
      warehouseCount,
      warehouses,
      stockBalanceSummary,
      recentMovements,
      lowStockItems,
    ] = await Promise.all([
      prisma.warehouse.count({ where: { organizationId: orgId, isActive: true } }),
      prisma.warehouse.findMany({
        where: { organizationId: orgId },
        include: { _count: { select: { locations: true, stockBalances: true } } },
        orderBy: { createdAt: "asc" },
      }),
      prisma.stockBalance.aggregate({
        where: { organizationId: orgId },
        _count: { id: true },
        _sum: { quantity: true },
      }),
      prisma.stockMovement.findMany({
        where: { organizationId: orgId },
        include: {
          product: { select: { name: true } },
          Warehouse: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
      // Products with stock at or below threshold
      prisma.stockBalance.findMany({
        where: { organizationId: orgId },
        include: {
          product: { select: { name: true, sku: true, lowStockThreshold: true } },
          warehouse: { select: { name: true } },
        },
      }),
    ]);

    const lowStock = lowStockItems.filter(b => {
      const threshold = b.product.lowStockThreshold ?? 0;
      return Number(b.quantity) <= threshold;
    }).slice(0, 10);

    return NextResponse.json({
      warehouseCount,
      warehouses,
      totalSkus: stockBalanceSummary._count.id,
      totalQuantity: Number(stockBalanceSummary._sum.quantity ?? 0),
      recentMovements,
      lowStock,
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    console.error("Inventory summary error:", err);
    return NextResponse.json({ error: "Request failed" }, { status: 500 });
  }
}
