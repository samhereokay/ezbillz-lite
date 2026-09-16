import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireOrgContext, UnauthorizedError, ForbiddenError } from "@/server/tenant";
import { getSubscriptionContext } from "@/server/subscription";

const createWarehouseSchema = z.object({
  name: z.string().min(1).max(100),
  isDefault: z.boolean().default(false),
});

export async function GET(req: NextRequest) {
  try {
    const ctx = await requireOrgContext();
    const warehouses = await prisma.warehouse.findMany({
      where: { organizationId: ctx.organizationId },
      include: { locations: true },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json({ warehouses });
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
    const parsed = createWarehouseSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
    }

    const warehouse = await prisma.$transaction(async (tx) => {
      if (parsed.data.isDefault) {
        // Unset previous default
        await tx.warehouse.updateMany({
          where: { organizationId: ctx.organizationId, isDefault: true },
          data: { isDefault: false },
        });
      }

      return tx.warehouse.create({
        data: {
          organizationId: ctx.organizationId,
          name: parsed.data.name,
          isDefault: parsed.data.isDefault,
        },
      });
    });

    return NextResponse.json({ warehouse }, { status: 201 });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    return NextResponse.json({ error: "Request failed" }, { status: 500 });
  }
}
