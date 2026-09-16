import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireOrgContext, UnauthorizedError, ForbiddenError } from "@/server/tenant";
import { getSubscriptionContext } from "@/server/subscription";
import { recordStockMovement, InventoryError } from "@/server/inventoryService";

const adjustInventorySchema = z.object({
  productId: z.string().cuid(),
  warehouseId: z.string().cuid(),
  locationId: z.string().cuid().optional(),
  quantity: z.number().refine(v => v !== 0, { message: "Quantity cannot be zero" }),
  note: z.string().max(500).optional(),
  /** Client-supplied idempotency key. Same key = same adjustment, never double-applied. */
  idempotencyKey: z.string().min(8).max(200),
});

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireOrgContext();
    const { canCreateTransaction } = await getSubscriptionContext(ctx.organizationId);
    if (!canCreateTransaction) {
      return NextResponse.json({ error: "Subscription expired." }, { status: 403 });
    }

    const body = await req.json().catch(() => null);
    const parsed = adjustInventorySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
    }

    // Idempotency at DB level: recordStockMovement checks (referenceType, referenceId, productId, type)
    const movement = await prisma.$transaction(async (tx) => {
      return await recordStockMovement(tx as any, {
        organizationId: ctx.organizationId,
        productId: parsed.data.productId,
        warehouseId: parsed.data.warehouseId,
        locationId: parsed.data.locationId,
        type: "ADJUSTMENT",
        quantity: parsed.data.quantity,
        note: parsed.data.note,
        referenceType: "ADJUSTMENT",
        referenceId: parsed.data.idempotencyKey,
        userId: ctx.userId,
      });
    });

    return NextResponse.json({ movement }, { status: 201 });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (err instanceof InventoryError) return NextResponse.json({ error: err.message }, { status: 400 });
    console.error("Inventory adjust error:", err);
    return NextResponse.json({ error: "Request failed" }, { status: 500 });
  }
}
