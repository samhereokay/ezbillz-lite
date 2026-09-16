import { PrismaClient, PaymentDirection, PaymentMethod, PaymentStatus, InvoiceStatus, PurchaseStatus } from "@prisma/client";

export type CreatePaymentInput = {
  organizationId: string;
  direction: PaymentDirection;
  method?: PaymentMethod;
  amount: number;
  customerId?: string;
  supplierId?: string;
  invoiceId?: string;
  purchaseId?: string;
  note?: string;
  idempotencyKey?: string;
  draftId?: string;
  userId?: string;
};

export async function createPayment(prisma: Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"> | PrismaClient, input: CreatePaymentInput) {
  if (input.amount <= 0) {
    throw new Error("Payment amount must be greater than zero");
  }

  const doWork = async (tx: any) => {
    // 1. Idempotency Check
    if (input.idempotencyKey) {
      const existing = await tx.payment.findUnique({
        where: { idempotencyKey: input.idempotencyKey }
      });
      if (existing) return existing;
    }

    // 2. Validate Invoice / Purchase limits
    if (input.invoiceId && input.direction === "RECEIVED") {
      const inv = await tx.invoice.findUnique({
        where: { id: input.invoiceId, organizationId: input.organizationId }
      });
      if (!inv) throw new Error("Invoice not found");

      const outstanding = Number(inv.grandTotal) - Number(inv.amountPaid);
      if (input.amount > outstanding) {
        throw new Error(`Overpayment not allowed. Outstanding amount is ${outstanding}`);
      }

      const newPaid = Number(inv.amountPaid) + input.amount;

      await tx.invoice.update({
        where: { id: inv.id },
        data: { amountPaid: newPaid }
      });
    }

    if (input.purchaseId && input.direction === "PAID") {
      const pur = await tx.purchase.findUnique({
        where: { id: input.purchaseId, organizationId: input.organizationId }
      });
      if (!pur) throw new Error("Purchase bill not found");

      const outstanding = Number(pur.grandTotal) - Number(pur.amountPaid);
      if (input.amount > outstanding) {
        throw new Error(`Overpayment not allowed. Outstanding amount is ${outstanding}`);
      }

      const newPaid = Number(pur.amountPaid) + input.amount;

      await tx.purchase.update({
        where: { id: pur.id },
        data: { amountPaid: newPaid }
      });
    }

    // 3. Atomically claim next sequence
    const org = await tx.organization.update({
      where: { id: input.organizationId },
      data: { receiptNextSeq: { increment: 1 } },
      select: { receiptPrefix: true, receiptNextSeq: true }
    });

    const sequence = org.receiptNextSeq - 1;
    const receiptNumber = `${org.receiptPrefix}-${String(sequence).padStart(5, "0")}`;

    const payment = await tx.payment.create({
      data: {
        organizationId: input.organizationId,
        direction: input.direction,
        method: input.method ?? PaymentMethod.CASH,
        amount: input.amount,
        customerId: input.customerId,
        supplierId: input.supplierId,
        invoiceId: input.invoiceId,
        purchaseId: input.purchaseId,
        note: input.note,
        idempotencyKey: input.idempotencyKey,
        receiptNumber,
        sequence,
        status: PaymentStatus.SUCCESS
      }
    });

    if (input.draftId && input.userId) {
      await tx.draft.deleteMany({
        where: { id: input.draftId, organizationId: input.organizationId, userId: input.userId }
      });
    }

    return payment;
  };

  if ('$transaction' in prisma) {
    return (prisma as PrismaClient).$transaction(doWork);
  } else {
    return doWork(prisma);
  }
}
