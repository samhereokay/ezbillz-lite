import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireOrgContext, UnauthorizedError, ForbiddenError } from "@/server/tenant";
import { createInvoice } from "@/server/invoiceService";
import { newIdempotencyKey } from "@/lib/utils";
import { InvoiceType, InvoiceStatus } from "@prisma/client";

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const ctx = await requireOrgContext();

    // MUST run in transaction to ensure atomicity
    const convertedInvoice = await prisma.$transaction(async (tx) => {
      const quotation = await tx.invoice.findUnique({
        where: { id: params.id, organizationId: ctx.organizationId },
        include: { items: true },
      });

      if (!quotation) {
        throw new Error("Quotation not found");
      }
      
      if (quotation.type !== InvoiceType.QUOTATION) {
        throw new Error("Only quotations can be converted");
      }

      if (quotation.status === InvoiceStatus.CONVERTED || quotation.linkedInvoiceId) {
        throw new Error("Quotation has already been converted");
      }

      // Convert via createInvoice (this generates TAX_INVOICE sequence and stock movements)
      const invoice = await createInvoice(tx as any, {
        organizationId: ctx.organizationId,
        customerId: quotation.customerId,
        type: InvoiceType.TAX_INVOICE,
        idempotencyKey: newIdempotencyKey(),
        
        // Transfer valid delivery information if any
        deliveryAddress: quotation.deliveryAddress ?? undefined,
        vehicleNo: quotation.vehicleNo ?? undefined,
        transporter: quotation.transporter ?? undefined,
        ewayBillNo: quotation.ewayBillNo ?? undefined,
        reasonForMovement: quotation.reasonForMovement ?? undefined,

        lines: quotation.items.map((item) => ({
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

      // Mark the quotation as converted and link it to the new invoice
      await tx.invoice.update({
        where: { id: quotation.id },
        data: {
          status: InvoiceStatus.CONVERTED,
          linkedInvoiceId: invoice.id,
        },
      });

      return invoice;
    });

    return NextResponse.json({ invoice: convertedInvoice }, { status: 201 });
  } catch (err: any) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (err instanceof ForbiddenError) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    
    if (err.message === "Quotation not found") {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    
    if (err.message === "Only quotations can be converted" || err.message === "Quotation has already been converted") {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }

    console.error("quotation.convert failed", err);
    return NextResponse.json({ error: "Could not convert quotation" }, { status: 500 });
  }
}
