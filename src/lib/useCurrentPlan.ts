import { useState, useEffect } from 'react';
import { getCurrentPlan, PlanTier } from './planAccess';

export function useCurrentPlan(userId: string | undefined): {
  plan: PlanTier;
  loading: boolean;
} {
  const [plan, setPlan] = useState<PlanTier>('FREE');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setPlan('FREE');
      setLoading(false);
      return;
    }

    let isMounted = true;

    async function fetchPlan() {
      try {
        const currentPlan = await getCurrentPlan(userId!);
        if (isMounted) {
          setPlan(currentPlan);
          setLoading(false);
        }
      } catch (error) {
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
  }, [userId]);

  return { plan, loading };
}
