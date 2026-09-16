import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireOrgContext, UnauthorizedError, ForbiddenError } from "@/server/tenant";
import { getSubscriptionContext } from "@/server/subscription";

const purchaseItemSchema = z.object({
  productId: z.string().cuid().optional(),
  description: z.string().min(1).max(500),
  hsnCode: z.string().max(20).optional(),
  quantity: z.number().positive(),
  unitCost: z.number().nonnegative(),
  gstRatePercent: z.number().min(0).max(100),
});

const createPurchaseSchema = z.object({
  supplierId: z.string().cuid(),
  billNumber: z.string().max(100).optional(),
  billDate: z.string().optional(),
  items: z.array(purchaseItemSchema).min(1).max(200),
  warehouseId: z.string().cuid(),
  draftId: z.string().cuid().optional(),
});

export async function GET(req: NextRequest) {
  const orgId = req.nextUrl.searchParams.get("organizationId") ?? undefined;
  try {
    const ctx = await requireOrgContext(orgId);
    const purchases = await prisma.purchase.findMany({
      where: { organizationId: ctx.organizationId },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { supplier: { select: { name: true } }, items: true },
    });
    return NextResponse.json({ purchases });
  } catch (err) { return handleAuthError(err); }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = createPurchaseSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  try {
    const ctx = await requireOrgContext();

    const { canCreateTransaction } = await getSubscriptionContext(ctx.organizationId);
    if (!canCreateTransaction) {
      return NextResponse.json(
        { error: "Subscription expired. Please upgrade to continue creating data." },
        { status: 403 }
      );
    }

    let taxableTotal = 0, cgstTotal = 0, sgstTotal = 0;
    const itemsData = parsed.data.items.map((item) => {
      const taxable = item.quantity * item.unitCost;
      const tax = taxable * (item.gstRatePercent / 100);
      taxableTotal += taxable; cgstTotal += tax / 2; sgstTotal += tax / 2;
      return {
        productId: item.productId, description: item.description, hsnCode: item.hsnCode,
        quantity: item.quantity, unitCost: item.unitCost, gstRatePercent: item.gstRatePercent,
        taxableValue: taxable, cgstAmount: tax / 2, sgstAmount: tax / 2, lineTotal: taxable + tax,
      };
    });

    const purchase = await prisma.$transaction(async (tx) => {
      const p = await tx.purchase.create({
        data: {
          organizationId: ctx.organizationId,
          supplierId: parsed.data.supplierId,
          billNumber: parsed.data.billNumber,
          billDate: parsed.data.billDate ? new Date(parsed.data.billDate) : undefined,
          taxableTotal, cgstTotal, sgstTotal, grandTotal: taxableTotal + cgstTotal + sgstTotal,
          status: "RECORDED",
          items: { create: itemsData },
        },
        include: { items: true },
      });

      const { recordStockMovement } = await import("@/server/inventoryService");
      
      const aggregatedProducts = new Map<string, number>();
      for (const item of p.items) {
        if (!item.productId) continue;
        const currentQty = aggregatedProducts.get(item.productId) || 0;
        aggregatedProducts.set(item.productId, currentQty + Number(item.quantity));
      }

      for (const [productId, quantity] of Array.from(aggregatedProducts.entries())) {
        await recordStockMovement(tx as any, {
          organizationId: ctx.organizationId,
          productId,
          warehouseId: parsed.data.warehouseId,
          type: "PURCHASE_RECEIPT",
          quantity,
          referenceType: "PURCHASE",
          referenceId: p.id,
          userId: ctx.userId,
        });
      }

      if (parsed.data.draftId) {
        await tx.draft.deleteMany({
          where: { id: parsed.data.draftId, organizationId: ctx.organizationId, userId: ctx.userId },
        });
      }

      return p;
    });
    return NextResponse.json({ purchase }, { status: 201 });
  } catch (err) { return handleAuthError(err); }
}

function handleAuthError(err: unknown) {
  if (err instanceof UnauthorizedError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (err instanceof ForbiddenError) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  console.error(err);
  return NextResponse.json({ error: "Request failed" }, { status: 500 });
}
