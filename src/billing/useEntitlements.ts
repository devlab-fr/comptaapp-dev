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
        if (isMounted) {
          setEntitlements(defaultEntitlements);
        }
        return;
      }

      const cached = entitlementsCache.get(companyId);
      if (cached && Date.now() - cached.timestamp < CACHE_DURATION_MS) {
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
          if (isMounted && cached) {
            setEntitlements(cached.entitlements);
          } else if (isMounted) {
            setEntitlements(defaultEntitlements);
          }
          return;
        }

        if (data) {
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
