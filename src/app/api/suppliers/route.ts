import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireOrgContext, UnauthorizedError, ForbiddenError } from "@/server/tenant";
import { getSubscriptionContext } from "@/server/subscription";

const createSupplierSchema = z.object({
  name: z.string().min(1).max(200),
  gstin: z.string().length(15).optional(),
  state: z.string().optional(),
  stateCode: z.string().length(2).optional(),
  phone: z.string().max(20).optional(),
  email: z.string().email().optional(),
  addressLine1: z.string().max(300).optional(),
  city: z.string().max(100).optional(),
  pincode: z.string().max(10).optional(),
  draftId: z.string().cuid().optional(),
});

export async function GET(req: NextRequest) {
  const orgId = req.nextUrl.searchParams.get("organizationId") ?? undefined;
  try {
    const ctx = await requireOrgContext(orgId);
    const q = req.nextUrl.searchParams.get("q") ?? undefined;
    const suppliers = await prisma.supplier.findMany({
      where: {
        organizationId: ctx.organizationId,
        deletedAt: null,
        ...(q ? { name: { contains: q, mode: "insensitive" } } : {}),
      },
      orderBy: { name: "asc" },
      take: 100,
    });
    return NextResponse.json({ suppliers });
  } catch (err) { return handleAuthError(err); }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = createSupplierSchema.safeParse(body);
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

    let supplier;
    if (draftId) {
      const result = await prisma.$transaction(async (tx) => {
        const s = await tx.supplier.create({
          data: { ...data, organizationId: ctx.organizationId },
        });
        await tx.draft.deleteMany({
          where: { id: draftId, organizationId: ctx.organizationId, userId: ctx.userId },
        });
        return s;
      });
      supplier = result;
    } else {
      supplier = await prisma.supplier.create({
        data: { ...data, organizationId: ctx.organizationId },
      });
    }

    return NextResponse.json({ supplier }, { status: 201 });
  } catch (err) { return handleAuthError(err); }
}

function handleAuthError(err: unknown) {
  if (err instanceof UnauthorizedError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (err instanceof ForbiddenError)    return NextResponse.json({ error: "Forbidden" },    { status: 403 });
  console.error(err);
  return NextResponse.json({ error: "Request failed" }, { status: 500 });
}
