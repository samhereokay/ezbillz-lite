import { PrismaClient, PlanType, SubscriptionStatus, BillingInterval } from '@prisma/client';

const prisma = new PrismaClient();

export async function setSubscriptionState(email: string, state: 'TRIAL_ACTIVE' | 'TRIAL_EXPIRED' | 'LITE_ACTIVE') {
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
    include: {
      memberships: { include: { organization: true } }
    }
  });

  if (!user || user.memberships.length === 0) {
    throw new Error(`User not found or no memberships: ${email}`);
  }

  const organizationId = user.memberships[0].organization.id;
  const now = new Date();

  if (state === 'TRIAL_ACTIVE') {
    const trialEnd = new Date(now);
    trialEnd.setDate(trialEnd.getDate() + 14);
    
    await prisma.subscription.update({
      where: { organizationId },
      data: {
        plan: PlanType.FREE_TRIAL,
        status: SubscriptionStatus.ACTIVE,
        trialStart: now,
        trialEnd: trialEnd,
      }
    });
  } else if (state === 'TRIAL_EXPIRED') {
    const trialEnd = new Date(now);
    trialEnd.setDate(trialEnd.getDate() - 1); // Expired yesterday
    
    await prisma.subscription.update({
      where: { organizationId },
      data: {
        plan: PlanType.FREE_TRIAL,
        status: SubscriptionStatus.ACTIVE,
        trialStart: new Date(now.getTime() - (15 * 24 * 60 * 60 * 1000)), // Started 15 days ago
        trialEnd: trialEnd,
      }
    });
  } else if (state === 'LITE_ACTIVE') {
    await prisma.subscription.update({
      where: { organizationId },
      data: {
        plan: PlanType.LITE,
        status: SubscriptionStatus.ACTIVE,
        billingInterval: BillingInterval.MONTHLY,
      }
    });
  }
}
