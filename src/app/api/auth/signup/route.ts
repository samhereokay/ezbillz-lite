import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "../../../../lib/db/client";
import { hashPassword } from "../../../../lib/auth/options";
import { PlanType, SubscriptionStatus, BillingInterval } from "@prisma/client";

const signupSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email(),
  password: z.string().min(10).max(200),
  businessName: z.string().min(1).max(200),
  state: z.string().min(1),
  stateCode: z.string().length(2),
  gstin: z.string().length(15).optional(),
});

/**
 * Creates the first user + their organization + an OWNER membership in one
 * transaction. This is the only place a brand-new organization is created
 * without an existing membership check (there's nothing to check yet).
 */
export async function POST(req: NextRequest) {
  const parsed = signupSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const data = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email: data.email.toLowerCase() } });
  if (existing) {
    // Generic message — do not reveal whether the email is registered.
    return NextResponse.json({ error: "Could not create account" }, { status: 400 });
  }

  const passwordHash = await hashPassword(data.password);

  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { name: data.name, email: data.email.toLowerCase(), passwordHash },
    });
    const org = await tx.organization.create({
      data: {
        name: data.businessName,
        state: data.state,
        stateCode: data.stateCode,
        gstin: data.gstin,
      },
    });
    await tx.membership.create({
      data: { userId: user.id, organizationId: org.id, role: "OWNER" },
    });

    const now = new Date();
    const trialEnd = new Date(now);
    trialEnd.setDate(trialEnd.getDate() + 14);

    await tx.subscription.create({
      data: {
        organizationId: org.id,
        plan: PlanType.FREE_TRIAL,
        status: SubscriptionStatus.ACTIVE,
        trialStart: now,
        trialEnd: trialEnd,
        billingInterval: BillingInterval.MONTHLY,
      }
    });

    return { user, org };
  });

  return NextResponse.json(
    { userId: result.user.id, organizationId: result.org.id },
    { status: 201 }
  );
}
