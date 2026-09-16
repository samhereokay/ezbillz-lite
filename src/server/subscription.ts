import { prisma } from '@/lib/db/client';
import { Subscription, PlanType, SubscriptionStatus, BillingInterval, PaymentProvider } from '@prisma/client';

export type EffectiveSubscriptionState = 
  | 'TRIAL_ACTIVE'
  | 'TRIAL_EXPIRED'
  | 'LITE_ACTIVE'
  | 'BUSINESS_ACTIVE'
  | 'SUBSCRIPTION_EXPIRED'
  | 'INACTIVE';

export type SubscriptionDetails = {
  subscription: Subscription;
  status: EffectiveSubscriptionState;
  trialDaysRemaining: number;
  canCreateTransaction: boolean;
};

/**
 * Gets the organization's subscription.
 * Safely initializes a 14-day free trial using upsert for legacy orgs.
 */
export async function getOrganizationSubscription(organizationId: string): Promise<Subscription> {
  const now = new Date();
  const trialEnd = new Date(now);
  trialEnd.setDate(trialEnd.getDate() + 14);

  return prisma.subscription.upsert({
    where: { organizationId },
    update: {}, // Do nothing if it already exists
    create: {
      organizationId,
      plan: PlanType.FREE_TRIAL,
      status: SubscriptionStatus.ACTIVE,
      trialStart: now,
      trialEnd: trialEnd,
      billingInterval: BillingInterval.MONTHLY,
    }
  });
}

/**
 * Calculates the exact effective status of the subscription based on dates and plan type.
 */
export function getEffectiveSubscriptionState(subscription: Subscription): SubscriptionDetails {
  const now = new Date();
  
  let status: EffectiveSubscriptionState = 'INACTIVE';
  let trialDaysRemaining = 0;
  let canCreateTransaction = false;

  if (subscription.plan === PlanType.FREE_TRIAL) {
    if (subscription.trialEnd && now <= subscription.trialEnd) {
      status = 'TRIAL_ACTIVE';
      trialDaysRemaining = Math.max(0, Math.ceil((subscription.trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
      canCreateTransaction = true;
    } else {
      status = 'TRIAL_EXPIRED';
      canCreateTransaction = false;
    }
  } else {
    // Paid plans
    if (subscription.status === SubscriptionStatus.ACTIVE || subscription.status === SubscriptionStatus.PAST_DUE) {
      status = subscription.plan === PlanType.LITE ? 'LITE_ACTIVE' : 'BUSINESS_ACTIVE';
      canCreateTransaction = true;
    } else {
      status = 'SUBSCRIPTION_EXPIRED';
      canCreateTransaction = false;
    }
  }

  return {
    subscription,
    status,
    trialDaysRemaining,
    canCreateTransaction,
  };
}

/**
 * Convenience method combining the fetch and status calculation.
 */
export async function getSubscriptionContext(organizationId: string): Promise<SubscriptionDetails> {
  const subscription = await getOrganizationSubscription(organizationId);
  return getEffectiveSubscriptionState(subscription);
}

/**
 * Helper to assert transaction rights within API routes.
 */
export async function requireActiveSubscription(organizationId: string): Promise<SubscriptionDetails> {
  const context = await getSubscriptionContext(organizationId);
  if (!context.canCreateTransaction) {
    throw new Error('SUBSCRIPTION_REQUIRED');
  }
  return context;
}
