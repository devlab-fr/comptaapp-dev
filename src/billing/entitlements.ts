export type Plan = 'free' | 'pro' | 'pro_plus' | 'pro_plus_plus';

export type SubscriptionStatus = 'active' | 'inactive';

export interface EntitlementLimits {
  maxExpensesPerMonth: number | null;
}

export interface Entitlements {
  plan: Plan;
  status: SubscriptionStatus;
  limits: EntitlementLimits;
}

export const FREE_MAX_EXPENSES_PER_MONTH = 30;

export const defaultEntitlements: Entitlements = {
  plan: 'free',
  status: 'inactive',
  limits: {
    maxExpensesPerMonth: FREE_MAX_EXPENSES_PER_MONTH,
  },
};
