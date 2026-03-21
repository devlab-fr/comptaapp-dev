import { supabase } from '../lib/supabase';
import type { Entitlements } from './entitlements';
import { normalizePlanTier, type PlanTier } from './planRules';

const PLAN_TIER_TO_PLAN: Record<PlanTier, 'free' | 'pro' | 'pro_plus' | 'pro_pp'> = {
  'FREE': 'free',
  'PRO': 'pro',
  'PRO_PLUS': 'pro_plus',
  'PRO_PLUS_PLUS': 'pro_pp',
};

export async function refreshEntitlements(): Promise<Entitlements> {
  try {
    const { data: { session } } = await supabase.auth.getSession();

    if (!session?.user) {
      return {
        plan: 'free',
        status: 'inactive',
        limits: { maxExpensesPerMonth: 30 },
      };
    }

    const { data: profile, error } = await supabase
      .from('profiles')
      .select('plan_tier, plan_source')
      .eq('id', session.user.id)
      .maybeSingle();

    if (error) {
      console.error('REFRESH_ENTITLEMENTS_ERROR:', error);
      return {
        plan: 'free',
        status: 'inactive',
        limits: { maxExpensesPerMonth: 30 },
      };
    }

    if (!profile) {
      return {
        plan: 'free',
        status: 'inactive',
        limits: { maxExpensesPerMonth: 30 },
      };
    }

    const planTierRaw = profile.plan_tier || 'FREE';
    const planTier = normalizePlanTier(planTierRaw);
    const plan = PLAN_TIER_TO_PLAN[planTier] || 'free';
    const status = plan !== 'free' ? 'active' : 'inactive';

    return {
      plan,
      status,
      limits: {
        maxExpensesPerMonth: plan === 'free' ? 30 : null,
      },
    };
  } catch (error) {
    console.error('REFRESH_ENTITLEMENTS_CATCH:', error);
    return {
      plan: 'free',
      status: 'inactive',
      limits: { maxExpensesPerMonth: 30 },
    };
  }
}
