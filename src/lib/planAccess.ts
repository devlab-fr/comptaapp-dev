import { supabase } from './supabase';

export type PlanTier = 'FREE' | 'PRO' | 'PRO_PLUS' | 'PRO_PLUS_PLUS';

const PLAN_HIERARCHY: Record<PlanTier, number> = {
  'FREE': 0,
  'PRO': 1,
  'PRO_PLUS': 2,
  'PRO_PLUS_PLUS': 3,
};

export async function getCurrentPlan(userId: string): Promise<PlanTier> {
  try {
    const { data: subscription, error: subError } = await supabase
      .from('company_subscriptions')
      .select('plan_tier, status')
      .eq('user_id', userId)
      .maybeSingle();

    if (!subError && subscription && subscription.status === 'active') {
      return subscription.plan_tier as PlanTier;
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
