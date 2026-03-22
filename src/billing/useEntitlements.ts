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

export function useEntitlements(): Entitlements & { isLoading?: boolean } {
  const companyId = useCurrentCompany();
  const [isLoading, setIsLoading] = useState<boolean>(true);
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
          setIsLoading(false);
        }
        return;
      }

      const cached = entitlementsCache.get(companyId);
      if (cached && Date.now() - cached.timestamp < CACHE_DURATION_MS) {
        setEntitlements(cached.entitlements);
        setIsLoading(false);
        return;
      }

      try {
        let userEmail: string | undefined;
        let accessToken: string;

        try {
          const freshSession = await ensureFreshSession();
          accessToken = freshSession.accessToken;

          const { data: { session } } = await supabase.auth.getSession();
          userEmail = session?.user?.email;

          if (!accessToken) {
            console.warn('[ENTITLEMENTS] No access token found in session');
            if (isMounted) {
              setEntitlements(defaultEntitlements);
              setIsLoading(false);
            }
            return;
          }
        } catch (error) {
          console.warn('[ENTITLEMENTS] Failed to get fresh session', error);
          if (isMounted) {
            setEntitlements(defaultEntitlements);
            setIsLoading(false);
          }
          return;
        }

        if (shouldApplyDevOverride(userEmail)) {
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
            setIsLoading(false);
          }
          return;
        }

        // ========== DIAGNOSTIC JWT - DÉBUT ==========
        try {
          const parts = accessToken.split('.');
          if (parts.length === 3) {
            const payload = JSON.parse(atob(parts[1]));
            const expectedProject = 'lmbxmluyggwvvjpyvlnt';
            const now = Math.floor(Date.now() / 1000);
            const isExpired = payload.exp ? payload.exp < now : true;
            const projectMatch =
              payload.ref === expectedProject ||
              (payload.iss && payload.iss.includes(expectedProject));

            console.log('🔍 [JWT DIAGNOSTIC]', {
              iss: payload.iss,
              aud: payload.aud,
              role: payload.role,
              sub: payload.sub,
              exp: payload.exp,
              expDate: payload.exp ? new Date(payload.exp * 1000).toISOString() : 'N/A',
              isExpired,
              ref: payload.ref,
              expectedProject,
              projectMatch: projectMatch ? '✅ OK' : '❌ MISMATCH',
            });
          }
        } catch (e) {
          console.warn('[JWT DIAGNOSTIC] Failed to decode JWT', e);
        }
        // ========== DIAGNOSTIC JWT - FIN ==========

        const { data, error } = await supabase.functions.invoke('get-user-entitlements', {
          body: { companyId },
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });

        if (error) {
          const cached = entitlementsCache.get(companyId);
          if (isMounted && cached) {
            setEntitlements(cached.entitlements);
          } else if (isMounted) {
            setEntitlements(defaultEntitlements);
          }
          if (isMounted) {
            setIsLoading(false);
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
            setIsLoading(false);
          }
        }
      } catch (error) {
        const cached = entitlementsCache.get(companyId);
        if (isMounted && cached) {
          setEntitlements(cached.entitlements);
        } else if (isMounted) {
          setEntitlements(defaultEntitlements);
        }
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    fetchEntitlements();

    return () => {
      isMounted = false;
    };
  }, [companyId]);

  return { ...entitlements, isLoading };
}
