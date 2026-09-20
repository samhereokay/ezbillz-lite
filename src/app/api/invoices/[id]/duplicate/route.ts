import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireOrgContext, UnauthorizedError, ForbiddenError } from "@/server/tenant";
import { createInvoice } from "@/server/invoiceService";
import { newIdempotencyKey } from "@/lib/utils";
import { InvoiceType } from "@prisma/client";

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const ctx = await requireOrgContext();

    const originalInvoice = await prisma.invoice.findUnique({
      where: { id: params.id, organizationId: ctx.organizationId },
      include: { items: true },
    });

    if (!originalInvoice) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    // Pass data directly to createInvoice so it behaves as if a user manually created an identical one.
    const duplicate = await createInvoice(prisma, {
      organizationId: ctx.organizationId,
      customerId: originalInvoice.customerId,
      type: originalInvoice.type as InvoiceType,
      idempotencyKey: newIdempotencyKey(),
      
      // Preserve document-specific fields
      validUntil: originalInvoice.validUntil ?? undefined,
      deliveryAddress: originalInvoice.deliveryAddress ?? undefined,
      vehicleNo: originalInvoice.vehicleNo ?? undefined,
      transporter: originalInvoice.transporter ?? undefined,
      ewayBillNo: originalInvoice.ewayBillNo ?? undefined,
      reasonForMovement: originalInvoice.reasonForMovement ?? undefined,

      lines: originalInvoice.items.map((item) => ({
        productId: item.productId ?? undefined,
        description: item.description,
        hsnCode: item.hsnCode ?? undefined,
        quantity: Number(item.quantity),
        unit: item.unit ?? undefined,
        unitPrice: Number(item.unitPrice),
        discountPercent: Number(item.discountPercent),
        gstRatePercent: Number(item.gstRatePercent),
      })),
    });

    return NextResponse.json({ duplicate }, { status: 201 });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (err instanceof ForbiddenError) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    console.error("invoice.duplicate failed", err);
    return NextResponse.json({ error: "Could not duplicate document" }, { status: 500 });
  }
}
