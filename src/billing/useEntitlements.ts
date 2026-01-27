import { useState, useEffect } from 'react';
import { defaultEntitlements, type Entitlements } from './entitlements';
import { supabase } from '../lib/supabase';
import { shouldApplyDevOverride } from '../utils/devOverride';
import { useCurrentCompany } from '../lib/useCurrentCompany';

const CACHE_DURATION_MS = 60000;

interface CacheKey {
  companyId: string;
  entitlements: Entitlements;
  timestamp: number;
}

let entitlementsCache: Map<string, CacheKey> = new Map();

export function invalidateEntitlementsCache() {
  entitlementsCache.clear();
  console.log('ENTITLEMENTS_CACHE_INVALIDATED');
}

export function useEntitlements(): Entitlements {
  const companyId = useCurrentCompany();
  const [entitlements, setEntitlements] = useState<Entitlements>(() => {
    if (companyId) {
      const cached = entitlementsCache.get(companyId);
      if (cached && Date.now() - cached.timestamp < CACHE_DURATION_MS) {
        return cached.entitlements;
      }
    }
    return defaultEntitlements;
  });

  useEffect(() => {
    let isMounted = true;

    const fetchEntitlements = async () => {
      if (!companyId) {
        console.warn('ENTITLEMENTS_NO_COMPANY_ID');
        if (isMounted) {
          setEntitlements(defaultEntitlements);
        }
        return;
      }

      const cached = entitlementsCache.get(companyId);
      if (cached && Date.now() - cached.timestamp < CACHE_DURATION_MS) {
        console.log('ENTITLEMENTS_CACHE_HIT', { companyId, plan: cached.entitlements.plan });
        setEntitlements(cached.entitlements);
        return;
      }

      try {
        const { data: { session } } = await supabase.auth.getSession();

        if (!session) {
          if (isMounted) {
            setEntitlements(defaultEntitlements);
          }
          return;
        }

        if (shouldApplyDevOverride(session.user?.email)) {
          console.warn('DEV_PLAN_OVERRIDE_ACTIVE', { email: session.user?.email, companyId });
          const devEntitlements: Entitlements = {
            plan: 'pro_pp',
            status: 'active',
            limits: {
              maxExpensesPerMonth: null,
            },
          };
          if (isMounted) {
            entitlementsCache.set(companyId, {
              companyId,
              entitlements: devEntitlements,
              timestamp: Date.now(),
            });
            setEntitlements(devEntitlements);
          }
          return;
        }

        const { data, error } = await supabase.functions.invoke('get-user-entitlements', {
          body: { companyId },
        });

        if (error) {
          const cached = entitlementsCache.get(companyId);
          console.warn('ENTITLEMENTS_FETCH_FAILED_KEEP_PLAN', { error, keepingCached: !!cached });
          if (isMounted && cached) {
            setEntitlements(cached.entitlements);
          } else if (isMounted) {
            setEntitlements(defaultEntitlements);
          }
          return;
        }

        if (data) {
          console.log('ENTITLEMENTS_FETCHED', {
            companyId,
            plan: data.plan,
            status: data.status,
            source: 'get-user-entitlements',
          });
          if (isMounted) {
            entitlementsCache.set(companyId, {
              companyId,
              entitlements: data,
              timestamp: Date.now(),
            });
            setEntitlements(data);
          }
        }
      } catch (error) {
        const cached = entitlementsCache.get(companyId);
        console.warn('ENTITLEMENTS_FETCH_FAILED_KEEP_PLAN', { error, keepingCached: !!cached });
        if (isMounted && cached) {
          setEntitlements(cached.entitlements);
        } else if (isMounted) {
          setEntitlements(defaultEntitlements);
        }
      }
    };

    fetchEntitlements();

    return () => {
      isMounted = false;
    };
  }, [companyId]);

  return entitlements;
}
