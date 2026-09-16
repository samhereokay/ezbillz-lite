import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireOrgContext, UnauthorizedError, ForbiddenError } from "@/server/tenant";

export async function GET(req: NextRequest) {
  try {
    const ctx = await requireOrgContext();
    const { searchParams } = req.nextUrl;

    const productId = searchParams.get("productId") ?? undefined;
    const warehouseId = searchParams.get("warehouseId") ?? undefined;
    const locationId = searchParams.get("locationId") ?? undefined;
    const type = searchParams.get("type") ?? undefined;
    const fromDate = searchParams.get("from") ? new Date(searchParams.get("from")!) : undefined;
    const toDate = searchParams.get("to") ? new Date(searchParams.get("to")!) : undefined;
    const take = Math.min(Number(searchParams.get("take") ?? 100), 500);
    const skip = Number(searchParams.get("skip") ?? 0);

    const movements = await prisma.stockMovement.findMany({
      where: {
        organizationId: ctx.organizationId,
        ...(productId ? { productId } : {}),
        ...(warehouseId ? { warehouseId } : {}),
        ...(locationId ? { locationId } : {}),
        ...(type ? { type: type as any } : {}),
        ...(fromDate || toDate ? {
          createdAt: {
            ...(fromDate ? { gte: fromDate } : {}),
            ...(toDate ? { lte: toDate } : {}),
          }
        } : {}),
      },
      include: {
        product: { select: { name: true, sku: true } },
        Warehouse: { select: { name: true } },
        Location: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take,
      skip,
    });

    const total = await prisma.stockMovement.count({
      where: {
        organizationId: ctx.organizationId,
        ...(productId ? { productId } : {}),
        ...(warehouseId ? { warehouseId } : {}),
        ...(locationId ? { locationId } : {}),
        ...(type ? { type: type as any } : {}),
        ...(fromDate || toDate ? {
          createdAt: {
            ...(fromDate ? { gte: fromDate } : {}),
            ...(toDate ? { lte: toDate } : {}),
          }
        } : {}),
      },
    });

    return NextResponse.json({ movements, total });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    return NextResponse.json({ error: "Request failed" }, { status: 500 });
  }
}
