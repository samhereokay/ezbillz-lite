import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireOrgContext, UnauthorizedError, ForbiddenError } from "@/server/tenant";
import { renderToStream } from "@react-pdf/renderer";
import { PaymentReceiptPDF, PaymentReceiptData } from "@/lib/documents/receiptRenderer";
import React from "react";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await requireOrgContext();

    const payment = await prisma.payment.findUnique({
      where: { id: params.id, organizationId: ctx.organizationId },
      include: {
        organization: true,
        customer: true,
        supplier: true,
        invoice: true,
        purchase: true,
      },
    });

    if (!payment) {
      return new NextResponse("Payment not found", { status: 404 });
    }

    const data: PaymentReceiptData = {
      id: payment.id,
      receiptNumber: payment.receiptNumber || payment.id,
      paidAt: payment.paidAt,
      amount: Number(payment.amount),
      method: payment.method,
      direction: payment.direction,
      note: payment.note,
      organization: {
        name: payment.organization.name,
        legalName: payment.organization.legalName,
        gstin: payment.organization.gstin,
        addressLine1: payment.organization.addressLine1,
        addressLine2: payment.organization.addressLine2,
        city: payment.organization.city,
        state: payment.organization.state,
        stateCode: payment.organization.stateCode,
        pincode: payment.organization.pincode,
        brandColor: payment.organization.brandColor,
      },
      party: payment.direction === 'RECEIVED' ? payment.customer : payment.supplier,
      documentRef: payment.invoice ? `Invoice #${payment.invoice.number}` : (payment.purchase ? `Purchase Bill #${payment.purchase.billNumber || payment.purchase.id}` : null),
    };

    const stream = await renderToStream(React.createElement(PaymentReceiptPDF, { data }) as any);

    return new NextResponse(stream as unknown as ReadableStream, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="Receipt-${data.receiptNumber}.pdf"`,
      },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) return new NextResponse("Unauthorized", { status: 401 });
    if (err instanceof ForbiddenError) return new NextResponse("Forbidden", { status: 403 });
    console.error(err);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
