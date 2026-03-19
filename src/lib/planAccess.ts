import { supabase } from './supabase';

export type PlanTier = 'FREE' | 'PRO' | 'PRO_PLUS' | 'PRO_PLUS_PLUS';

const PLAN_HIERARCHY: Record<PlanTier, number> = {
  'FREE': 0,
  'PRO': 1,
  'PRO_PLUS': 2,
  'PRO_PLUS_PLUS': 3,
};

export async function getCurrentPlan(userId: string, companyId?: string): Promise<PlanTier> {
  try {

    // If companyId is provided, get the subscription for that specific company
    if (companyId) {
      const { data: subscription, error: subError } = await supabase
        .from('company_subscriptions')
        .select('plan_tier, status, company_id')
        .eq('company_id', companyId)
        .maybeSingle();


      if (!subError && subscription && subscription.status === 'active') {
        return subscription.plan_tier as PlanTier;
      }
    }

    // Otherwise, find any active subscription for any of the user's companies
    const { data: memberships, error: membershipError } = await supabase
      .from('memberships')
      .select('company_id')
      .eq('user_id', userId);


    if (!membershipError && memberships && memberships.length > 0) {
      const companyIds = memberships.map(m => m.company_id);

      const { data: subscriptions, error: subError } = await supabase
        .from('company_subscriptions')
        .select('plan_tier, status, company_id')
        .in('company_id', companyIds)
        .eq('status', 'active')
        .order('plan_tier', { ascending: false });


      if (!subError && subscriptions && subscriptions.length > 0) {
        const highestPlan = subscriptions[0].plan_tier as PlanTier;
        return highestPlan;
      }
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('plan_tier')
      .eq('id', userId)
      .maybeSingle();


    if (!profileError && profile && profile.plan_tier) {
      return profile.plan_tier as PlanTier;
    }

    return 'FREE';
  } catch (error) {
    console.error('[PLAN_ACCESS] Error getting plan:', error);
    return 'FREE';
  }
}

export function hasAccess(currentPlan: PlanTier, requiredPlan: PlanTier): boolean {
  const currentLevel = PLAN_HIERARCHY[currentPlan] ?? 0;
  const requiredLevel = PLAN_HIERARCHY[requiredPlan] ?? 0;
  return currentLevel >= requiredLevel;
}

export function getPlanLabel(plan: PlanTier): string {
  const labels: Record<PlanTier, string> = {
    'FREE': 'Gratuit',
    'PRO': 'Pro',
    'PRO_PLUS': 'Pro Plus',
    'PRO_PLUS_PLUS': 'Pro Plus Plus',
  };
  return labels[plan] || 'Gratuit';
}

export function getRequiredPlanMessage(requiredPlan: PlanTier): string {
  const planLabel = getPlanLabel(requiredPlan);
  return `Cette fonctionnalité est disponible à partir de la version ${planLabel}.`;
}
