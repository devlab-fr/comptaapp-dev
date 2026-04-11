import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from './supabase';
import { normalizePlanTier as normalizePlanTierBilling } from '../billing/planRules';
import {
  PlanTier,
  PlanDefinition,
  PlanFeatures,
  PlanQuotas,
  getPlanDefinition,
  canUseFeature as canUseFeatureUtil,
  PLANS,
} from './plans';
import { shouldApplyDevOverride } from '../utils/devOverride';
import { useCurrentCompany } from './useCurrentCompany';

function normalizePlanTierLocal(input: string | null | undefined): PlanTier {
  return normalizePlanTierBilling(input) as PlanTier;
}

interface CompanySubscription {
  company_id: string;
  plan_tier: PlanTier;
  stripe_subscription_id: string | null;
  status: string | null;
  current_period_end: string | null;
}

interface UsePlanReturn {
  effectiveTier: PlanTier;
  plan: PlanDefinition;
  features: PlanFeatures;
  quotas: PlanQuotas;
  canUse: (feature: keyof PlanFeatures) => boolean;
  canCreateTransaction: (currentCount: number) => boolean;
  canCreateCompany: (currentCount: number) => boolean;
  loading: boolean;
  refresh?: () => Promise<void>;
}

function getDevForcedPlan(): PlanTier | null {
  if (typeof window === 'undefined') return null;

  const params = new URLSearchParams(window.location.search);
  const forcedPlan = params.get('forcePlan');

  if (forcedPlan && ['FREE', 'PRO', 'PRO_PLUS', 'PRO_PLUS_PLUS'].includes(forcedPlan)) {
    return forcedPlan as PlanTier;
  }

  return null;
}

function getSessionStorageSubscription(companyId: string): CompanySubscription | null {
  try {
    const key = `subscription_${companyId}`;
    const cached = sessionStorage.getItem(key);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed && Date.now() - parsed.timestamp < 60000) {
        return parsed.subscription;
      }
    }
  } catch (e) {
    // Ignore sessionStorage errors
  }
  return null;
}

function setSessionStorageSubscription(companyId: string, subscription: CompanySubscription) {
  try {
    const key = `subscription_${companyId}`;
    sessionStorage.setItem(key, JSON.stringify({
      subscription,
      timestamp: Date.now(),
    }));
  } catch (e) {
    // Ignore sessionStorage errors
  }
}

export function usePlan(companyIdParam?: string | null): UsePlanReturn {
  const { user } = useAuth();
  const companyIdFromRoute = useCurrentCompany();
  const companyId = companyIdParam || companyIdFromRoute;
  const [subscription, setSubscription] = useState<CompanySubscription | null>(() => {
    if (companyId) {
      return getSessionStorageSubscription(companyId);
    }
    return null;
  });
  const [loading, setLoading] = useState(true);

  const loadSubscription = async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    if (!companyId) {
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('company_subscriptions')
        .select('*')
        .eq('company_id', companyId)
        .maybeSingle();

      if (error) {
        console.error('PLAN_RESOLVE_ERROR', { userId: user.id, companyId, error: error.message });
        setLoading(false);
        return;
      }

      if (!data) {
        const { error: insertError } = await supabase
          .from('company_subscriptions')
          .insert({
            company_id: companyId,
            plan_tier: 'FREE',
            status: 'active',
          });

        if (insertError) {
          console.error('PLAN_SELFHEAL_FAILED', { userId: user.id, companyId, error: insertError.message });
          setLoading(false);
          return;
        }

        const freeSubscription = {
          company_id: companyId,
          plan_tier: 'FREE' as PlanTier,
          stripe_subscription_id: null,
          status: 'active',
          current_period_end: null,
        };
        setSubscription(freeSubscription);
        setSessionStorageSubscription(companyId, freeSubscription);
        setLoading(false);
        return;
      }

      const subscriptionWithNormalized = {
        ...data,
        plan_tier: normalizePlanTierLocal(data.plan_tier),
      } as CompanySubscription;
      setSubscription(subscriptionWithNormalized);
      setSessionStorageSubscription(companyId, subscriptionWithNormalized);
      setLoading(false);
    } catch (err) {
      console.error('PLAN_RESOLVE_EXCEPTION', { userId: user.id, companyId, error: err });
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    setSubscription(null);
    loadSubscription();
  }, [user, companyId]);

  const devForcedPlan = getDevForcedPlan();

  let effectiveTier: PlanTier = 'FREE';

  if (shouldApplyDevOverride(user?.email)) {
    effectiveTier = 'PRO_PLUS_PLUS';
  } else if (devForcedPlan) {
    effectiveTier = devForcedPlan;
  } else if (subscription) {
    effectiveTier = subscription.plan_tier;
  }

  const plan = getPlanDefinition(effectiveTier);
  const features = plan.features;
  const quotas = plan.quotas;

  const canUse = (feature: keyof PlanFeatures): boolean => {
    return canUseFeatureUtil(effectiveTier, feature);
  };

  const canCreateTransaction = (currentCount: number): boolean => {
    if (quotas.maxTransactions === null) return true;
    return currentCount < quotas.maxTransactions;
  };

  const canCreateCompany = (): boolean => {
    return true;
  };

  const refresh = async () => {
    setLoading(true);
    await loadSubscription();
  };

  return {
    effectiveTier,
    plan,
    features,
    quotas,
    canUse,
    canCreateTransaction,
    canCreateCompany,
    loading,
    refresh,
  };
}

export function getPlanDisplayName(tier: PlanTier): string {
  return PLANS[tier].name;
}

export function getPlanPrice(tier: PlanTier): string {
  return PLANS[tier].price;
}
