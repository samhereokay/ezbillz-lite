import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireOrgContext, UnauthorizedError, ForbiddenError } from "@/server/tenant";
import { getSubscriptionContext } from "@/server/subscription";

const createProductSchema = z.object({
  name: z.string().min(1).max(200),
  sku: z.string().max(60).optional(),
  hsnCode: z.string().max(20).optional(),
  isService: z.boolean().optional(),
  unit: z.string().max(20).optional(),
  salePrice: z.number().nonnegative(),
  purchasePrice: z.number().nonnegative().optional(),
  gstRatePercent: z.number().min(0).max(100),
  priceIncludesTax: z.boolean().optional(),
  lowStockThreshold: z.number().int().min(0).optional(),
  draftId: z.string().cuid().optional(),
});

export async function GET(req: NextRequest) {
  const orgId = req.nextUrl.searchParams.get("organizationId") ?? undefined;
  try {
    const ctx = await requireOrgContext(orgId);
    const q = req.nextUrl.searchParams.get("q") ?? undefined;
    const products = await prisma.product.findMany({
      where: { organizationId: ctx.organizationId, deletedAt: null, ...(q ? { name: { contains: q, mode: "insensitive" } } : {}) },
      orderBy: { name: "asc" },
      take: 200,
    });

    const stockByProduct = await prisma.stockMovement.groupBy({
      by: ["productId"],
      where: { organizationId: ctx.organizationId },
      _sum: { quantity: true },
    });
    const stockMap = new Map(stockByProduct.map((s) => [s.productId, s._sum.quantity]));

    return NextResponse.json({
      products: products.map((p) => ({ ...p, currentStock: Number(stockMap.get(p.id) ?? 0) })),
    });
  } catch (err) { return handleAuthError(err); }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = createProductSchema.safeParse(body);
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
    const { draftId, ...data } = parsed.data;

    let product;
    if (draftId) {
      const result = await prisma.$transaction(async (tx) => {
        const p = await tx.product.create({
          data: { ...data, organizationId: ctx.organizationId },
        });
        await tx.draft.deleteMany({
          where: { id: draftId, organizationId: ctx.organizationId, userId: ctx.userId },
        });
        return p;
      });
      product = result;
    } else {
      product = await prisma.product.create({
        data: { ...data, organizationId: ctx.organizationId },
      });
    }

    return NextResponse.json({ product }, { status: 201 });
  } catch (err) { return handleAuthError(err); }
}

function handleAuthError(err: unknown) {
  if (err instanceof UnauthorizedError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (err instanceof ForbiddenError) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  console.error(err);
  return NextResponse.json({ error: "Request failed" }, { status: 500 });
}
