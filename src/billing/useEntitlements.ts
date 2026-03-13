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
        console.log('[ENTITLEMENTS_DEBUG] Fallback to sessionStorage cache', { companyId, entitlements: sessionCached });
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
        await ensureFreshSession();

        const { data: { session } } = await supabase.auth.getSession();

        console.log('[ENTITLEMENTS_DEBUG] After ensureFreshSession', {
          companyId,
          hasSession: !!session,
          hasAccessToken: !!session?.access_token,
          accessTokenPreview: session?.access_token ? `${session.access_token.substring(0, 20)}...` : null,
          userId: session?.user?.id,
        });

        if (shouldApplyDevOverride(session?.user?.email)) {
          const devEntitlements: Entitlements = {
            plan: 'pro_plus_plus',
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

        if (!session?.access_token) {
          console.log('[ENTITLEMENTS_DEBUG] No access token available');
          return;
        }

        const { data, error } = await supabase.functions.invoke('get-user-entitlements', {
          body: { companyId },
          headers: {
            Authorization: `Bearer ${session.access_token}`
          }
        });

        console.log('[ENTITLEMENTS_DEBUG] Response from get-user-entitlements', {
          companyId,
          hasError: !!error,
          error,
          hasData: !!data,
          data,
        });

        if (error) {
          console.log('[ENTITLEMENTS_DEBUG] Error detected, attempting fallback', { companyId, error });
          const cached = entitlementsCache.get(companyId);
          if (isMounted && cached) {
            console.log('[ENTITLEMENTS_DEBUG] Fallback to entitlementsCache', { companyId, entitlements: cached.entitlements });
            setEntitlements(cached.entitlements);
          } else if (isMounted) {
            console.log('[ENTITLEMENTS_DEBUG] Fallback to defaultEntitlements', { companyId, entitlements: defaultEntitlements });
            setEntitlements(defaultEntitlements);
          }
          return;
        }

        if (data) {
          console.log('[ENTITLEMENTS_DEBUG] Data received, setting entitlements', { companyId, data });
          if (isMounted) {
            entitlementsCache.set(companyId, {
              companyId,
              entitlements: data,
              timestamp: Date.now(),
            });
            setSessionStorageCache(companyId, data);
            console.log('[ENTITLEMENTS_DEBUG] Final entitlements applied', { companyId, entitlements: data });
            setEntitlements(data);
          }
        }
      } catch (error: any) {
        console.log('[ENTITLEMENTS_DEBUG] Exception caught', { companyId, error, errorMessage: error?.message });
        if (error?.message === 'AUTH_REQUIRED') {
          console.log('[ENTITLEMENTS_DEBUG] AUTH_REQUIRED exception, fallback to defaultEntitlements', { companyId });
          if (isMounted) {
            setEntitlements(defaultEntitlements);
          }
          return;
        }

        const cached = entitlementsCache.get(companyId);
        if (isMounted && cached) {
          console.log('[ENTITLEMENTS_DEBUG] Exception fallback to entitlementsCache', { companyId, entitlements: cached.entitlements });
          setEntitlements(cached.entitlements);
        } else if (isMounted) {
          console.log('[ENTITLEMENTS_DEBUG] Exception fallback to defaultEntitlements', { companyId, entitlements: defaultEntitlements });
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
