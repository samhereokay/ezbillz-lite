import { PlanType } from '@prisma/client';

export type PricingTier = {
  plan: PlanType;
  name: string;
  monthly: number;
  annual: number;
  features: string[];
};

export const PRICING_CATALOG: Record<Exclude<PlanType, 'FREE_TRIAL'>, PricingTier> = {
  LITE: {
    plan: PlanType.LITE,
    name: "Lite",
    monthly: 99,
    annual: 950,
    features: ["Up to 100 Invoices/mo", "Basic Inventory", "GST Support", "Email Support"],
  },
  BUSINESS: {
    plan: PlanType.BUSINESS,
    name: "Business",
    monthly: 199,
    annual: 1910,
    features: ["Unlimited Invoices", "Advanced Inventory", "GST Support", "Priority Support"],
  },
};

export function getPricingCatalog() {
  return Object.values(PRICING_CATALOG);
}

export function getPlanFeatures(plan: PlanType): string[] {
  if (plan === PlanType.FREE_TRIAL) {
    return ["Full access during 14-day trial"];
  }
  return PRICING_CATALOG[plan]?.features || [];
}
