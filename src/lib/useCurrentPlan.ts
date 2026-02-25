import { useState, useEffect } from 'react';
import { getCurrentPlan, PlanTier } from './planAccess';
import { useCurrentCompany } from './useCurrentCompany';

export function useCurrentPlan(userId: string | undefined): {
  plan: PlanTier;
  loading: boolean;
} {
  const [plan, setPlan] = useState<PlanTier>('FREE');
  const [loading, setLoading] = useState(true);
  const companyId = useCurrentCompany();

  useEffect(() => {
    if (!userId) {
      setPlan('FREE');
      setLoading(false);
      return;
    }

    let isMounted = true;

    async function fetchPlan() {
      try {
        console.log('[useCurrentPlan] Fetching plan for:', { userId, companyId });
        const currentPlan = await getCurrentPlan(userId!, companyId || undefined);
        if (isMounted) {
          console.log('[useCurrentPlan] Setting plan to:', currentPlan);
          setPlan(currentPlan);
          setLoading(false);
        }
      } catch (error) {
        console.error('[useCurrentPlan] Error fetching plan:', error);
        if (isMounted) {
          setPlan('FREE');
          setLoading(false);
        }
      }
    }

    fetchPlan();

    return () => {
      isMounted = false;
    };
  }, [userId, companyId]);

  return { plan, loading };
}
