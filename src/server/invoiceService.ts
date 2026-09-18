import { PrismaClient, Prisma, InvoiceStatus, InvoiceType, StockMovementType } from "@prisma/client";
import { calculateInvoice, GstLineInput } from "../lib/gst/engine";

export type CreateInvoiceInput = {
  organizationId: string;
  customerId: string;
  type?: InvoiceType;
  idempotencyKey: string; // required — every mutating client action must send one
  lines: Array<
    GstLineInput & {
      productId?: string;
      description: string;
      hsnCode?: string;
      unit?: string;
    }
  >;
  validUntil?: Date;
  deliveryAddress?: string;
  vehicleNo?: string;
  transporter?: string;
  ewayBillNo?: string;
  reasonForMovement?: string;
  draftId?: string;
  userId?: string;
};

/**
 * Creates an invoice, its line items, and the resulting stock-issue
 * movements in a single atomic transaction.
 *
 * Concurrency & idempotency guarantees:
 *  - `idempotencyKey` is a unique DB column. If the same key is submitted
 *    twice (e.g. a retried request after a dropped response), the second
 *    call returns the original invoice instead of creating a duplicate.
 *  - The invoice `sequence` is assigned via an atomic UPDATE ... RETURNING
 *    on Organization.invoiceNextSeq inside the same transaction, so two
 *    concurrent requests can never receive the same number (no
 *    read-then-write race).
 *  - Stock movements carry a unique (referenceType, referenceId, productId,
 *    type) constraint, so even if this function were somehow invoked twice
 *    for the same invoice id, stock would not be double-decremented.
 */
export async function createInvoice(
  prisma: Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"> | PrismaClient,
  input: CreateInvoiceInput
) {
  const existing = await prisma.invoice.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
    include: { items: true },
  });
  if (existing) return existing; // idempotent replay

  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: input.organizationId },
  });
  const customer = await prisma.customer.findFirstOrThrow({
    where: { id: input.customerId, organizationId: input.organizationId },
  });

  const gst = calculateInvoice({
    sellerStateCode: org.stateCode,
    buyerStateCode: customer.stateCode ?? null,
    lines: input.lines,
  });

  const productIds = input.lines.map(l => l.productId).filter(Boolean) as string[];
  if (productIds.length > 0) {
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
    });
    // Find unique product ids
    const uniqueIds = new Set(productIds);
    if (products.length !== uniqueIds.size || products.some(p => p.organizationId !== input.organizationId)) {
      throw new Error("One or more products not found or do not belong to this organization.");
    }
  }

  const doWork = async (tx: any) => {
    const docType = input.type ?? InvoiceType.TAX_INVOICE;
    
    // Atomically claim the next sequence number for this org.
    let sequence = 0;
    let number = "";
    
    if (docType === InvoiceType.QUOTATION) {
      const updated = await tx.organization.update({
        where: { id: input.organizationId },
        data: { quotationNextSeq: { increment: 1 } },
        select: { quotationNextSeq: true, quotationPrefix: true },
      });
      sequence = updated.quotationNextSeq - 1;
      number = `${updated.quotationPrefix}-${String(sequence).padStart(5, "0")}`;
    } else if (docType === InvoiceType.DELIVERY_CHALLAN) {
      const updated = await tx.organization.update({
        where: { id: input.organizationId },
        data: { challanNextSeq: { increment: 1 } },
        select: { challanNextSeq: true, challanPrefix: true },
      });
      sequence = updated.challanNextSeq - 1;
      number = `${updated.challanPrefix}-${String(sequence).padStart(5, "0")}`;
    } else {
      const updated = await tx.organization.update({
        where: { id: input.organizationId },
        data: { invoiceNextSeq: { increment: 1 } },
        select: { invoiceNextSeq: true, invoicePrefix: true },
      });
      sequence = updated.invoiceNextSeq - 1;
      number = `${updated.invoicePrefix}-${String(sequence).padStart(5, "0")}`;
    }

    const invoice = await tx.invoice.create({
      data: {
        organizationId: input.organizationId,
        customerId: input.customerId,
        type: input.type ?? InvoiceType.TAX_INVOICE,
        status: InvoiceStatus.ISSUED,
        number,
        sequence,
        sellerState: org.state,
        sellerStateCode: org.stateCode,
        buyerState: customer.state ?? null,
        buyerStateCode: customer.stateCode ?? null,
        placeOfSupplyCode: customer.stateCode ?? org.stateCode,
        subtotal: gst.subtotal,
        discountTotal: gst.discountTotal,
        taxableTotal: gst.taxableTotal,
        cgstTotal: gst.cgstTotal,
        sgstTotal: gst.sgstTotal,
        igstTotal: gst.igstTotal,
        roundOff: gst.roundOff,
        grandTotal: gst.grandTotal,
        idempotencyKey: input.idempotencyKey,
        validUntil: input.validUntil,
        deliveryAddress: input.deliveryAddress,
        vehicleNo: input.vehicleNo,
        transporter: input.transporter,
        ewayBillNo: input.ewayBillNo,
        reasonForMovement: input.reasonForMovement,
        items: {
          create: input.lines.map((line, i) => ({
            productId: line.productId,
            description: line.description,
            hsnCode: line.hsnCode,
            quantity: line.quantity,
            unit: line.unit ?? "PCS",
            unitPrice: line.unitPrice,
            discountPercent: line.discountPercent ?? 0,
            gstRatePercent: line.gstRatePercent,
            taxableValue: gst.lines[i].taxableValue,
            cgstAmount: gst.lines[i].cgstAmount,
            sgstAmount: gst.lines[i].sgstAmount,
            igstAmount: gst.lines[i].igstAmount,
            lineTotal: gst.lines[i].lineTotal,
          })),
        },
      },
      include: { items: true },
    });

    // Issue stock for every line that references a product (only for TAX_INVOICE)
    if (docType === InvoiceType.TAX_INVOICE) {
      const { initializeDefaultWarehouse, recordStockMovement } = await import("./inventoryService");
      const defaultWarehouse = await initializeDefaultWarehouse(tx, input.organizationId);
      for (const line of input.lines) {
        if (!line.productId) continue;
        await recordStockMovement(tx, {
          organizationId: input.organizationId,
          productId: line.productId,
          warehouseId: defaultWarehouse.id,
          type: StockMovementType.SALE_ISSUE,
          quantity: line.quantity, // Must be positive, inventoryService handles it
          referenceType: "INVOICE",
          referenceId: invoice.id,
          userId: input.userId, // Will be passed if it exists
        });
      }
    }

    await tx.auditLog.create({
      data: {
        organizationId: input.organizationId,
        action: "invoice.issue",
        entityType: "Invoice",
        entityId: invoice.id,
        metadata: { number, grandTotal: gst.grandTotal.toString() },
      },
    });

    if (input.draftId && input.userId) {
      await tx.draft.deleteMany({
        where: {
          id: input.draftId,
          organizationId: input.organizationId,
          userId: input.userId,
        },
      });
    }

    return invoice;
  };

  if ('$transaction' in prisma) {
    return (prisma as PrismaClient).$transaction(doWork);
  } else {
    return doWork(prisma);
  }
}
