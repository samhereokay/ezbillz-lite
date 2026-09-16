import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireOrgContext, UnauthorizedError, ForbiddenError } from "@/server/tenant";

const updateWarehouseSchema = z.object({
  id: z.string().cuid(),
  name: z.string().min(1).max(100).optional(),
  isActive: z.boolean().optional(),
  isDefault: z.boolean().optional(),
});

export async function PATCH(req: NextRequest) {
  try {
    const ctx = await requireOrgContext();
    const body = await req.json().catch(() => null);
    const parsed = updateWarehouseSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
    }

    // Verify warehouse belongs to this org
    const existing = await prisma.warehouse.findUnique({ where: { id: parsed.data.id } });
    if (!existing || existing.organizationId !== ctx.organizationId) {
      return NextResponse.json({ error: "Warehouse not found" }, { status: 404 });
    }

    const { id, ...data } = parsed.data;

    const warehouse = await prisma.$transaction(async (tx) => {
      if (data.isDefault === true) {
        // Unset previous default
        await tx.warehouse.updateMany({
          where: { organizationId: ctx.organizationId, isDefault: true },
          data: { isDefault: false },
        });
      }
      return tx.warehouse.update({ where: { id }, data });
    });

    return NextResponse.json({ warehouse });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    // Prisma FK constraint errors (RESTRICT) are safe to show
    const msg = (err as Error).message;
    if (msg.includes("Foreign key constraint")) {
      return NextResponse.json({ error: "Cannot delete warehouse with existing inventory records. Archive it instead." }, { status: 409 });
    }
    return NextResponse.json({ error: "Request failed" }, { status: 500 });
  }
}
