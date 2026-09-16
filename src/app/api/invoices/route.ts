import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "../../../lib/db/client";
import { requireOrgContext, UnauthorizedError, ForbiddenError } from "../../../server/tenant";
import { createInvoice } from "../../../server/invoiceService";

const lineSchema = z.object({
  productId: z.string().cuid().optional(),
  description: z.string().min(1).max(500),
  hsnCode: z.string().max(20).optional(),
  quantity: z.number().positive(),
  unit: z.string().max(20).optional(),
  unitPrice: z.number().nonnegative(),
  discountPercent: z.number().min(0).max(100).optional(),
  gstRatePercent: z.number().min(0).max(100),
  priceIncludesTax: z.boolean().optional(),
});

const createInvoiceSchema = z.object({
  type: z.enum(["TAX_INVOICE", "QUOTATION", "DELIVERY_CHALLAN", "CREDIT_NOTE", "DEBIT_NOTE", "SALES_RETURN", "BILL_OF_SUPPLY"]).optional(),
  customerId: z.string().cuid(),
  idempotencyKey: z.string().min(8).max(200),
  lines: z.array(lineSchema).min(1).max(200),
  validUntil: z.string().datetime().optional().transform(val => val ? new Date(val) : undefined),
  deliveryAddress: z.string().max(500).optional(),
  vehicleNo: z.string().max(50).optional(),
  transporter: z.string().max(200).optional(),
  ewayBillNo: z.string().max(50).optional(),
  reasonForMovement: z.string().max(500).optional(),
  draftId: z.string().cuid().optional(),
});

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = createInvoiceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    // organizationId is validated against the session here — the value in
    // the request body is only a *hint* for which org to scope to; if the
    // caller has no membership in it, this throws ForbiddenError.
    const ctx = await requireOrgContext();

    const invoice = await createInvoice(prisma, {
      organizationId: ctx.organizationId,
      customerId: parsed.data.customerId,
      type: parsed.data.type as any, // Cast to InvoiceType
      idempotencyKey: parsed.data.idempotencyKey,
      validUntil: parsed.data.validUntil,
      deliveryAddress: parsed.data.deliveryAddress,
      vehicleNo: parsed.data.vehicleNo,
      transporter: parsed.data.transporter,
      ewayBillNo: parsed.data.ewayBillNo,
      reasonForMovement: parsed.data.reasonForMovement,
      draftId: parsed.data.draftId,
      userId: ctx.userId,
      lines: parsed.data.lines.map((l) => ({
        productId: l.productId,
        description: l.description!,
        hsnCode: l.hsnCode,
        quantity: l.quantity!,
        unit: l.unit,
        unitPrice: l.unitPrice!,
        discountPercent: l.discountPercent,
        gstRatePercent: l.gstRatePercent!,
        priceIncludesTax: l.priceIncludesTax,
      })),
    });

    return NextResponse.json({ invoice }, { status: 201 });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (err instanceof ForbiddenError) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    // Never leak internal error details (stack traces, SQL, etc.) to the client.
    console.error("invoice.create failed", err);
    return NextResponse.json({ error: "Could not create invoice" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const orgId = req.nextUrl.searchParams.get("organizationId") ?? undefined;

  try {
    const ctx = await requireOrgContext(orgId);

    const cursor = req.nextUrl.searchParams.get("cursor") ?? undefined;
    const take = Math.min(Number(req.nextUrl.searchParams.get("take") ?? 25), 100);
    const type = req.nextUrl.searchParams.get("type") ?? undefined;

    const invoices = await prisma.invoice.findMany({
      // Always scope by the server-resolved organizationId — never by a
      // client-supplied value that bypassed requireOrgContext.
      where: { 
        organizationId: ctx.organizationId,
        ...(type ? { type: type as any } : {})
      },
      orderBy: { createdAt: "desc" },
      take,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      include: { customer: { select: { name: true } } },
    });

    return NextResponse.json({ invoices });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (err instanceof ForbiddenError) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    console.error("invoice.list failed", err);
    return NextResponse.json({ error: "Could not list invoices" }, { status: 500 });
  }
}
