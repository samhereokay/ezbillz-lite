import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireOrgContext, UnauthorizedError, ForbiddenError } from "@/server/tenant";
import { getSubscriptionContext } from "@/server/subscription";
import { createPayment } from "@/server/paymentService";

const createPaymentSchema = z.object({
  direction: z.enum(["RECEIVED", "PAID"]),
  method: z.enum(["CASH", "BANK_TRANSFER", "UPI", "CARD", "CHEQUE", "OTHER"]).optional(),
  amount: z.number().positive(),
  customerId: z.string().cuid().optional(),
  supplierId: z.string().cuid().optional(),
  invoiceId: z.string().cuid().optional(),
  purchaseId: z.string().cuid().optional(),
  note: z.string().max(500).optional(),
  idempotencyKey: z.string().optional(),
  draftId: z.string().cuid().optional(),
});

export async function GET(req: NextRequest) {
  const orgId = req.nextUrl.searchParams.get("organizationId") ?? undefined;
  try {
    const ctx = await requireOrgContext(orgId);
    const direction = req.nextUrl.searchParams.get("direction") ?? undefined;
    const payments = await prisma.payment.findMany({
      where: {
        organizationId: ctx.organizationId,
        ...(direction ? { direction: direction as "RECEIVED" | "PAID" } : {}),
      },
      orderBy: { paidAt: "desc" },
      take: 100,
      include: {
        customer: { select: { name: true } },
        supplier: { select: { name: true } },
        invoice: { select: { number: true } },
      },
    });
    return NextResponse.json({ payments });
  } catch (err) { return handleAuthError(err, req); }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = createPaymentSchema.safeParse(body);
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
    const payment = await createPayment(prisma, {
      organizationId: ctx.organizationId,
      direction: parsed.data.direction,
      method: parsed.data.method,
      amount: parsed.data.amount,
      customerId: parsed.data.customerId,
      supplierId: parsed.data.supplierId,
      invoiceId: parsed.data.invoiceId,
      purchaseId: parsed.data.purchaseId,
      note: parsed.data.note,
      idempotencyKey: parsed.data.idempotencyKey,
      draftId: parsed.data.draftId,
      userId: ctx.userId,
    });

    return NextResponse.json({ payment }, { status: 201 });
  } catch (err: any) { 
    if (err.message && err.message.includes("Overpayment not allowed")) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    if (err.message && err.message.includes("Payment amount must be greater than zero")) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return handleAuthError(err, req); 
  }
}

async function handleAuthError(err: unknown, req: NextRequest | null = null) {
  if (err instanceof UnauthorizedError) {
    await import("@/lib/auth/security").then(m => m.logInternalSecurityEvent("AUTH_SESSION_INVALID", "WARN", req, { message: err.message }));
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (err instanceof ForbiddenError) {
    await import("@/lib/auth/security").then(m => m.logInternalSecurityEvent("AUTHORIZATION_DENIAL", "CRITICAL", req, { message: err.message }));
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  console.error(err);
  return NextResponse.json({ error: "Request failed" }, { status: 500 });
}
