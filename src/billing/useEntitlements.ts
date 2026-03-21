import { useState, useEffect } from 'react';
import { defaultEntitlements, type Entitlements } from './entitlements';
import { supabase } from '../lib/supabase';
import { shouldApplyDevOverride } from '../utils/devOverride';
import { useCurrentCompany } from '../lib/useCurrentCompany';
import { ensureFreshSession } from '../lib/auth/ensureFreshSession';

const CACHE_DURATION_MS = 60000;

interface CacheKey {
  companyId: string;
  entitlements: Entitlements;
  timestamp: number;
}

let entitlementsCache: Map<string, CacheKey> = new Map();

function getSessionStorageCache(companyId: string): Entitlements | null {
  try {
    const key = `entitlements_${companyId}`;
    const cached = sessionStorage.getItem(key);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed && Date.now() - parsed.timestamp < CACHE_DURATION_MS) {
        return parsed.entitlements;
      }
    }
  } catch (e) {
    // Ignore sessionStorage errors
  }
  return null;
}

function setSessionStorageCache(companyId: string, entitlements: Entitlements) {
  try {
    const key = `entitlements_${companyId}`;
    sessionStorage.setItem(key, JSON.stringify({
      entitlements,
      timestamp: Date.now(),
    }));
  } catch (e) {
    // Ignore sessionStorage errors
  }
}

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

      const sessionCached = getSessionStorageCache(companyId);
      if (sessionCached) {
        return sessionCached;
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
        const session = await ensureFreshSession();

        if (!session?.accessToken) {
          console.warn('[ENTITLEMENTS] No valid session');
          if (isMounted) {
            setEntitlements(defaultEntitlements);
          }
          return;
        }

        const { data: { user } } = await supabase.auth.getUser();

        if (shouldApplyDevOverride(user?.email)) {
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
            setSessionStorageCache(companyId, devEntitlements);
            setEntitlements(devEntitlements);
          }
          return;
        }

        console.log('[ENTITLEMENTS DEBUG START]');
        console.log('companyId:', companyId);
        console.log('companyId type:', typeof companyId);
        console.log('session email:', user?.email);
        console.log('accessToken exists:', !!session?.accessToken);

        const { data, error } = await supabase.functions.invoke('get-user-entitlements', {
          body: { companyId },
          headers: {
            Authorization: `Bearer ${session.accessToken}`
          }
        });

        console.log('[ENTITLEMENTS DEBUG RESPONSE]');
        console.log('data:', data);
        console.log('error:', error);

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
            setSessionStorageCache(companyId, data);
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
