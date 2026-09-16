import { PrismaClient } from "@prisma/client";
import { createPayment } from "../src/server/paymentService";

const prisma = new PrismaClient();

async function run() {
  console.log("Setting up payment integration test data...");
  const org = await prisma.organization.create({
    data: {
      id: "org_payment_" + Date.now(),
      name: "Payment Test Org",
      state: "Maharashtra",
      stateCode: "27",
    }
  });

  const customer = await prisma.customer.create({
    data: { organizationId: org.id, name: "Payment Customer" }
  });

  const invoice = await prisma.invoice.create({
    data: {
      id: "inv_payment_" + Date.now(),
      organizationId: org.id,
      customerId: customer.id,
      type: "TAX_INVOICE",
      number: "INV-001",
      sequence: 1,
      sellerState: "Maharashtra",
      sellerStateCode: "27",
      subtotal: 1000,
      taxableTotal: 1000,
      grandTotal: 1000,
      amountPaid: 0,
    }
  });

  console.log("1. Partial payment");
  const p1 = await createPayment(prisma, {
    organizationId: org.id,
    direction: "RECEIVED",
    amount: 300,
    invoiceId: invoice.id,
    customerId: customer.id
  });

  const invAfterP1 = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
  if (Number(invAfterP1.amountPaid) !== 300) {
    throw new Error(`Failed partial payment logic: ${invAfterP1.amountPaid}`);
  }

  console.log("2. Overpayment gets rejected");
  try {
    await createPayment(prisma, {
      organizationId: org.id,
      direction: "RECEIVED",
      amount: 800, // 300 + 800 = 1100 > 1000
      invoiceId: invoice.id,
      customerId: customer.id
    });
    throw new Error("Should have rejected overpayment");
  } catch (err: any) {
    if (!err.message.includes("Overpayment not allowed")) {
      throw err;
    }
  }

  console.log("3. Final payment");
  const p2 = await createPayment(prisma, {
    organizationId: org.id,
    direction: "RECEIVED",
    amount: 700,
    invoiceId: invoice.id,
    customerId: customer.id
  });

  const invAfterP2 = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
  if (Number(invAfterP2.amountPaid) !== 1000) {
    throw new Error("Failed final payment logic");
  }

  console.log("4. Duplicate submission (Idempotency)");
  const p3 = await createPayment(prisma, {
    organizationId: org.id,
    direction: "RECEIVED",
    amount: 100,
    idempotencyKey: "idem_key_123"
  });
  
  const p4 = await createPayment(prisma, {
    organizationId: org.id,
    direction: "RECEIVED",
    amount: 100,
    idempotencyKey: "idem_key_123"
  });

  if (p3.id !== p4.id) {
    throw new Error("Idempotency failed, created two distinct payments");
  }

  console.log("All payment integration tests PASSED.");
}

run()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
