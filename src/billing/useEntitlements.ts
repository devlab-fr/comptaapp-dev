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
        const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();

        const session = refreshData?.session;
        const accessToken = refreshData?.session?.access_token;

        if (!session) {
          console.log('[ENTITLEMENTS_DEBUG] No session found, falling back to FREE', { companyId, refreshError });
          if (isMounted) {
            setEntitlements(defaultEntitlements);
          }
          return;
        }

        if (!accessToken) {
          console.log('[ENTITLEMENTS_DEBUG] No valid token after refresh', {
            companyId,
            refreshError,
          });
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
            setSessionStorageCache(companyId, devEntitlements);
            setEntitlements(devEntitlements);
          }
          return;
        }

        console.log('[ENTITLEMENTS_DEBUG] Before edge function call', {
          companyId,
          userId: session.user?.id,
          email: session.user?.email,
          expiresAt: session.expires_at,
          isExpired: session.expires_at ? new Date(session.expires_at * 1000) < new Date() : 'unknown',
        });

        const { data, error } = await supabase.functions.invoke('get-user-entitlements', {
          body: { companyId },
          headers: {
            Authorization: `Bearer ${accessToken}`
          }
        });

        console.log('[ENTITLEMENTS_DEBUG] After edge function call', {
          companyId,
          data,
          error,
          hasData: !!data,
          hasError: !!error,
        });

        if (error) {
          console.error('[ENTITLEMENTS_DEBUG] Edge function returned error, falling back to FREE', {
            companyId,
            error,
          });
          const cached = entitlementsCache.get(companyId);
          if (isMounted && cached) {
            setEntitlements(cached.entitlements);
          } else if (isMounted) {
            setEntitlements(defaultEntitlements);
          }
          return;
        }

        if (data) {
          console.log('[ENTITLEMENTS_DEBUG] Success, setting entitlements', {
            companyId,
            plan: data.plan,
            status: data.status,
          });
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
        console.error('[ENTITLEMENTS_DEBUG] Exception caught, falling back to FREE', {
          companyId,
          error,
        });
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
