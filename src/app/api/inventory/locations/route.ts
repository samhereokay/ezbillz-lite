import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireOrgContext, UnauthorizedError, ForbiddenError } from "@/server/tenant";
import { getSubscriptionContext } from "@/server/subscription";

const createLocationSchema = z.object({
  warehouseId: z.string().cuid(),
  name: z.string().min(1).max(100),
});

const updateLocationSchema = z.object({
  id: z.string().cuid(),
  name: z.string().min(1).max(100).optional(),
  isActive: z.boolean().optional(),
});

export async function GET(req: NextRequest) {
  try {
    const ctx = await requireOrgContext();
    const warehouseId = req.nextUrl.searchParams.get("warehouseId");

    // If warehouseId provided, verify it belongs to this org
    if (warehouseId) {
      const wh = await prisma.warehouse.findUnique({ where: { id: warehouseId } });
      if (!wh || wh.organizationId !== ctx.organizationId) {
        return NextResponse.json({ error: "Warehouse not found" }, { status: 404 });
      }
    }

    const locations = await prisma.location.findMany({
      where: {
        organizationId: ctx.organizationId,
        ...(warehouseId ? { warehouseId } : {}),
      },
      include: { warehouse: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json({ locations });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    return NextResponse.json({ error: "Request failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireOrgContext();
    const { canCreateTransaction } = await getSubscriptionContext(ctx.organizationId);
    if (!canCreateTransaction) {
      return NextResponse.json({ error: "Subscription expired." }, { status: 403 });
    }

    const body = await req.json().catch(() => null);
    const parsed = createLocationSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
    }

    // Verify warehouse belongs to this org and is active
    const warehouse = await prisma.warehouse.findUnique({ where: { id: parsed.data.warehouseId } });
    if (!warehouse || warehouse.organizationId !== ctx.organizationId) {
      return NextResponse.json({ error: "Warehouse not found" }, { status: 404 });
    }
    if (!warehouse.isActive) {
      return NextResponse.json({ error: "Cannot add location to an inactive warehouse" }, { status: 400 });
    }

    const location = await prisma.location.create({
      data: {
        organizationId: ctx.organizationId,
        warehouseId: parsed.data.warehouseId,
        name: parsed.data.name,
      },
    });

    return NextResponse.json({ location }, { status: 201 });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    return NextResponse.json({ error: "Request failed" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const ctx = await requireOrgContext();
    const body = await req.json().catch(() => null);
    const parsed = updateLocationSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
    }

    // Verify location belongs to this org
    const existing = await prisma.location.findUnique({ where: { id: parsed.data.id } });
    if (!existing || existing.organizationId !== ctx.organizationId) {
      return NextResponse.json({ error: "Location not found" }, { status: 404 });
    }

    const { id, ...data } = parsed.data;
    const location = await prisma.location.update({ where: { id }, data });
    return NextResponse.json({ location });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    return NextResponse.json({ error: "Request failed" }, { status: 500 });
  }
}
