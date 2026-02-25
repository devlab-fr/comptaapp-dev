import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { usePlan } from '../lib/usePlan';
import { PLANS, PlanTier } from '../lib/plans';
import AppHeader from '../components/AppHeader';
import BackButton from '../components/BackButton';
import { supabase } from '../lib/supabase';
import { useCurrentCompany } from '../lib/useCurrentCompany';
import DevAuthReset from '../components/DevAuthReset';
import Toast from '../components/Toast';
import { ensureFreshSession } from '../lib/auth/ensureFreshSession';

const isValidStripeUrl = (url: string): boolean => {
  try {
    const parsedUrl = new URL(url);
    if (parsedUrl.protocol !== 'https:') return false;
    const host = parsedUrl.hostname;
    return host === 'checkout.stripe.com' || host === 'billing.stripe.com' || host === 'pay.stripe.com';
  } catch {
    return false;
  }
};

export default function SubscriptionPage() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { companyId: paramsCompanyId } = useParams<{ companyId: string }>();
  const currentCompanyId = useCurrentCompany();
  const { effectiveTier, refresh: refreshPlan } = usePlan();
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [testResult, setTestResult] = useState<{ status: number; body: any } | null>(null);
  const [testLoading, setTestLoading] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{ targetTier: PlanTier; isDowngrade: boolean } | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Priorité: params.companyId puis currentCompanyId
  const companyId = paramsCompanyId ?? currentCompanyId;

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const TIER_RANK: Record<PlanTier, number> = {
    FREE: 0,
    PRO: 1,
    PRO_PLUS: 2,
    PRO_PLUS_PLUS: 3,
  };

  const handleUpgrade = (targetTier: PlanTier) => {
    if (targetTier === 'FREE') return;

    const currentRank = TIER_RANK[effectiveTier] ?? 0;
    const targetRank = TIER_RANK[targetTier] ?? 0;
    const isDowngrade = targetRank < currentRank;

    setConfirmAction({ targetTier, isDowngrade });
  };

  const proceedWithCheckout = async (targetTier: PlanTier) => {
    if (!companyId) {
      console.error('CHECKOUT_NO_COMPANY_ID', { urlPath: window.location.pathname });
      alert('Aucune entreprise sélectionnée');
      return;
    }

    setConfirmAction(null);
    setLoading(true);
    try {
      let { data: { session } } = await supabase.auth.getSession();

      if (!session || !session.access_token) {
        const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();

        if (refreshError || !refreshData?.session || !refreshData.session.access_token) {
          console.error('CHECKOUT_REFRESH_FAILED', {
            error: refreshError?.message,
            hasSession: !!refreshData?.session,
            hasToken: !!refreshData?.session?.access_token,
          });
          alert('Session expirée, veuillez vous reconnecter');
          await supabase.auth.signOut();
          navigate('/login');
          return;
        }

        session = refreshData.session;
      }

      if (!session) {
        console.error('NO_SESSION');
        alert('Aucune session active, veuillez vous reconnecter');
        navigate('/login');
        return;
      }

      console.log('CHECKOUT_AUTH_DEBUG', {
        sessionExists: !!session,
        accessTokenLength: session.access_token?.length || 0,
        tokenPreview: session.access_token ? session.access_token.substring(0, 12) + '...' + session.access_token.substring(session.access_token.length - 12) : 'none',
        expiresAt: session.expires_at,
        expiresAtDate: session.expires_at ? new Date(session.expires_at * 1000).toISOString() : 'none',
        userId: session.user?.id || 'none',
      });

      console.log('CHECKOUT_CALL_DEBUG', {
        method: 'supabase.functions.invoke',
        functionName: 'create-checkout-session',
        body: { planTier: targetTier, companyId },
      });

      const { data, error } = await supabase.functions.invoke('create-checkout-session', {
        body: { planTier: targetTier, companyId },
      });

      if (error) {
        console.error('CHECKOUT_EDGE_ERROR', {
          message: error.message,
          context: error.context,
          status: error.status,
        });

        if (error.context?.debug) {
          console.error('CHECKOUT_DEBUG_FROM_EDGE', error.context.debug);
        }

        if (error.message?.includes('401') || error.message?.includes('Unauthorized') || error.message?.includes('Invalid JWT')) {
          const debugInfo = error.context?.debug;
          const debugReason = error.context?.debugReason || debugInfo?.reason || 'UNKNOWN';

          console.error('FULL_DEBUG_INFO', {
            debugReason,
            debugInfo,
            errorMessage: error.message,
            errorContext: error.context,
          });

          alert(`Session invalide (${debugReason}).\n\nVeuillez vous reconnecter.\n\nDétails: ${JSON.stringify(debugInfo || {}, null, 2)}`);
          await supabase.auth.signOut();
          navigate('/login');
        } else {
          alert(`Erreur: ${error.message || 'Impossible de créer la session de paiement'}`);
        }
        return;
      }

      if (data?.mode === 'upgrade') {
        console.log('UPGRADE_MODE_DETECTED', { companyId, plan: data.plan });

        setToast({ message: `Votre abonnement a été mis à niveau vers ${PLANS[data.plan as PlanTier]?.name || data.plan}`, type: 'success' });

        if (refreshPlan) {
          await refreshPlan();
        }

        return;
      }

      if (data?.url) {
        // Si URL interne, rediriger directement sans validation Stripe
        const isInternalRedirect = data.url.startsWith('/') ||
          data.url.startsWith(window.location.origin);

        if (isInternalRedirect) {
          window.location.href = data.url;
          return;
        }

        // Checkout initial : validation Stripe requise
        if (!isValidStripeUrl(data.url)) {
          alert('URL de paiement invalide');
          return;
        }
        window.location.assign(data.url);
      } else {
        console.error('CHECKOUT_NO_URL', data);
        alert('Erreur: aucune URL de paiement retournée');
      }
    } catch (error) {
      console.error('CHECKOUT_EXCEPTION', error);
      alert('Erreur lors de la création de la session de paiement');
    } finally {
      setLoading(false);
    }
  };

  const handleTestStripe = async () => {
    if (!companyId) {
      alert('Aucune entreprise sélectionnée');
      return;
    }

    setTestLoading(true);
    setTestResult(null);

    try {
      let { data: { session } } = await supabase.auth.getSession();

      if (!session || !session.access_token) {
        const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();

        if (refreshError || !refreshData?.session || !refreshData.session.access_token) {
          setTestResult({ status: 401, body: { error: 'Session expirée' } });
          setTestLoading(false);
          return;
        }

        session = refreshData.session;
      }

      if (!session) {
        setTestResult({ status: 401, body: { error: 'NO_SESSION' } });
        setTestLoading(false);
        return;
      }

      const token = session.access_token;
      const payload = { planTier: 'PRO', companyId };

      const supabaseUrlHost = new URL(import.meta.env.VITE_SUPABASE_URL).host;
      const projectRef = supabaseUrlHost.split('.')[0];

      console.log('TEST_STRIPE_AUTH_DEBUG', {
        sessionExists: !!session,
        accessTokenLength: token.length,
        userId: session.user?.id || 'none',
        supabaseUrlHost,
        projectRef,
        anonKeyLength: import.meta.env.VITE_SUPABASE_ANON_KEY.length,
      });

      const { data, error } = await supabase.functions.invoke('create-checkout-session', {
        body: payload,
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (error) {
        setTestResult({
          status: error.status || 500,
          body: {
            error: error.message,
            context: error.context,
          },
        });
      } else {
        setTestResult({
          status: 200,
          body: data,
        });
      }
    } catch (error: any) {
      setTestResult({
        status: 500,
        body: {
          error: error?.message || 'Exception caught',
          details: String(error),
        },
      });
    } finally {
      setTestLoading(false);
    }
  };

  const handleManageSubscription = async () => {
    setLoading(true);

    const validatedCompanyId = paramsCompanyId || currentCompanyId || null;

    if (!validatedCompanyId) {
      console.error('PORTAL_MISSING_COMPANY_ID', { paramsCompanyId, currentCompany: currentCompanyId });
      alert('CompanyId introuvable. Impossible de gérer l\'abonnement.');
      setLoading(false);
      return;
    }

    const callPortalSession = async (retryCount: number = 0): Promise<void> => {
      try {
        await ensureFreshSession();

        console.log('PORTAL_FLOW', { step: 'call_portal', companyId: validatedCompanyId, retryCount });

        const { data, error } = await supabase.functions.invoke('create-portal-session', {
          body: { companyId: validatedCompanyId },
        });

        if (error) {
          console.error('PORTAL_EDGE_ERROR', {
            message: error.message,
            context: error.context,
            status: error.status,
          });

          const is401 = error.message?.includes('401') || error.message?.includes('Unauthorized') || error.message?.includes('Invalid JWT');

          if (is401 && retryCount === 0) {
            console.log('PORTAL_FLOW', { step: 'retry_on_401', retryCount: retryCount + 1 });
            await callPortalSession(1);
            return;
          }

          if (is401) {
            const debugReason = error.context?.debugReason || 'UNKNOWN';
            alert(`Session invalide (${debugReason}). Veuillez vous reconnecter.`);
            await supabase.auth.signOut();
            navigate('/login');
          } else {
            alert(`Erreur: ${error.message || 'Impossible de créer la session portail'}`);
          }
          return;
        }

        if (data?.url) {
          if (!isValidStripeUrl(data.url)) {
            alert('URL de portail invalide');
            return;
          }
          console.log('PORTAL_FLOW', { step: 'redirect', url: data.url });
          window.location.assign(data.url);
        } else {
          console.error('PORTAL_NO_URL', data);
          alert('Erreur: aucune URL de portail retournée');
        }
      } catch (error: any) {
        if (error?.message === 'AUTH_REQUIRED') {
          alert('Session expirée, veuillez vous reconnecter');
          await supabase.auth.signOut();
          navigate('/login');
        } else {
          console.error('PORTAL_EXCEPTION', error);
          alert('Erreur lors de la création de la session portail');
        }
      } finally {
        setLoading(false);
      }
    };

    await callPortalSession();
  };

  const tiers: PlanTier[] = ['FREE', 'PRO', 'PRO_PLUS', 'PRO_PLUS_PLUS'];

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8f9fa' }}>
      <AppHeader subtitle={user?.email} onSignOut={handleSignOut} />

      <main style={{
        maxWidth: '1400px',
        margin: '0 auto',
        padding: '40px 24px',
      }}>
        <div style={{
          textAlign: 'center',
          marginBottom: '48px',
        }}>
          <h1 style={{
            fontSize: '36px',
            fontWeight: '700',
            color: '#1a1a1a',
            margin: '0 0 16px 0',
          }}>
            Choisissez votre plan
          </h1>
          <p style={{
            fontSize: '18px',
            color: '#6b7280',
            margin: '0 0 8px 0',
          }}>
            Débloquez les fonctionnalités dont vous avez besoin pour votre comptabilité
          </p>
          <p style={{
            fontSize: '14px',
            color: '#9ca3af',
            margin: 0,
            fontStyle: 'italic',
          }}>
            Chaque abonnement est lié à une seule entreprise.
          </p>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '24px',
          marginBottom: '32px',
        }}>
          {tiers.map((tier) => {
            const plan = PLANS[tier];
            const isCurrentPlan = effectiveTier === tier;

            const currentRank = TIER_RANK[effectiveTier] ?? -1;
            const targetRank = TIER_RANK[tier] ?? -1;
            const isUpgrade = targetRank > currentRank;
            const isDowngrade = targetRank < currentRank && targetRank > 0;

            return (
              <div
                key={tier}
                style={{
                  backgroundColor: 'white',
                  borderRadius: '16px',
                  padding: '32px 24px',
                  boxShadow: isCurrentPlan
                    ? '0 8px 24px rgba(40, 167, 69, 0.15)'
                    : '0 4px 6px rgba(0, 0, 0, 0.05)',
                  border: isCurrentPlan ? '2px solid #28a745' : '1px solid #e5e7eb',
                  position: 'relative',
                  transition: 'all 0.3s ease',
                }}
              >
                {isCurrentPlan && (
                  <div style={{
                    position: 'absolute',
                    top: '16px',
                    right: '16px',
                    padding: '4px 12px',
                    backgroundColor: '#28a745',
                    color: 'white',
                    fontSize: '12px',
                    fontWeight: '600',
                    borderRadius: '6px',
                  }}>
                    Plan actuel
                  </div>
                )}

                <h3 style={{
                  fontSize: '24px',
                  fontWeight: '700',
                  color: '#1a1a1a',
                  margin: '0 0 8px 0',
                }}>
                  {plan.name}
                </h3>

                <div style={{
                  fontSize: '32px',
                  fontWeight: '700',
                  color: '#28a745',
                  margin: '0 0 24px 0',
                }}>
                  {plan.price}
                </div>

                <div style={{
                  borderTop: '1px solid #e5e7eb',
                  paddingTop: '24px',
                  marginBottom: '24px',
                }}>
                  <h4 style={{
                    fontSize: '14px',
                    fontWeight: '600',
                    color: '#6b7280',
                    margin: '0 0 16px 0',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                  }}>
                    Fonctionnalités
                  </h4>

                  <ul style={{
                    listStyle: 'none',
                    padding: 0,
                    margin: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                  }}>
                    {plan.quotas.maxTransactions !== null && (
                      <li style={{
                        display: 'flex',
                        alignItems: 'center',
                        fontSize: '14px',
                        color: '#374151',
                      }}>
                        <span style={{
                          marginRight: '8px',
                          color: '#28a745',
                          fontWeight: '700',
                        }}>
                          ✓
                        </span>
                        {plan.quotas.maxTransactions} transactions/mois
                      </li>
                    )}
                    {plan.quotas.maxTransactions === null && (
                      <li style={{
                        display: 'flex',
                        alignItems: 'center',
                        fontSize: '14px',
                        color: '#374151',
                      }}>
                        <span style={{
                          marginRight: '8px',
                          color: '#28a745',
                          fontWeight: '700',
                        }}>
                          ✓
                        </span>
                        Transactions illimitées
                      </li>
                    )}
                    <li style={{
                      display: 'flex',
                      alignItems: 'center',
                      fontSize: '14px',
                      color: plan.features.exportsCsv ? '#374151' : '#9ca3af',
                    }}>
                      <span style={{
                        marginRight: '8px',
                        color: plan.features.exportsCsv ? '#28a745' : '#d1d5db',
                        fontWeight: '700',
                      }}>
                        {plan.features.exportsCsv ? '✓' : '✗'}
                      </span>
                      Exports CSV
                    </li>
                    <li style={{
                      display: 'flex',
                      alignItems: 'center',
                      fontSize: '14px',
                      color: plan.features.exportsPdf ? '#374151' : '#9ca3af',
                    }}>
                      <span style={{
                        marginRight: '8px',
                        color: plan.features.exportsPdf ? '#28a745' : '#d1d5db',
                        fontWeight: '700',
                      }}>
                        {plan.features.exportsPdf ? '✓' : '✗'}
                      </span>
                      Exports PDF
                    </li>
                    <li style={{
                      display: 'flex',
                      alignItems: 'center',
                      fontSize: '14px',
                      color: plan.features.reportsAdvanced ? '#374151' : '#9ca3af',
                    }}>
                      <span style={{
                        marginRight: '8px',
                        color: plan.features.reportsAdvanced ? '#28a745' : '#d1d5db',
                        fontWeight: '700',
                      }}>
                        {plan.features.reportsAdvanced ? '✓' : '✗'}
                      </span>
                      Rapports avancés
                    </li>
                    <li style={{
                      display: 'flex',
                      alignItems: 'center',
                      fontSize: '14px',
                      color: plan.features.ocr ? '#374151' : '#9ca3af',
                    }}>
                      <span style={{
                        marginRight: '8px',
                        color: plan.features.ocr ? '#28a745' : '#d1d5db',
                        fontWeight: '700',
                      }}>
                        {plan.features.ocr ? '✓' : '✗'}
                      </span>
                      Scan automatique (OCR)
                    </li>
                    <li style={{
                      display: 'flex',
                      alignItems: 'center',
                      fontSize: '14px',
                      color: plan.features.assistantIA ? '#374151' : '#9ca3af',
                    }}>
                      <span style={{
                        marginRight: '8px',
                        color: plan.features.assistantIA ? '#28a745' : '#d1d5db',
                        fontWeight: '700',
                      }}>
                        {plan.features.assistantIA ? '✓' : '✗'}
                      </span>
                      Assistant IA
                    </li>
                    <li style={{
                      display: 'flex',
                      alignItems: 'center',
                      fontSize: '14px',
                      color: plan.features.agDocs ? '#374151' : '#9ca3af',
                    }}>
                      <span style={{
                        marginRight: '8px',
                        color: plan.features.agDocs ? '#28a745' : '#d1d5db',
                        fontWeight: '700',
                      }}>
                        {plan.features.agDocs ? '✓' : '✗'}
                      </span>
                      Documents officiels AG
                    </li>
                    {tier === 'PRO_PLUS_PLUS' && (
                      <li style={{
                        display: 'flex',
                        alignItems: 'center',
                        fontSize: '14px',
                        color: '#374151',
                      }}>
                        <span style={{
                          marginRight: '8px',
                          color: '#28a745',
                          fontWeight: '700',
                        }}>
                          ✓
                        </span>
                        Création de factures (PDF)
                      </li>
                    )}
                    {tier === 'FREE' && (
                      <li style={{
                        display: 'flex',
                        alignItems: 'center',
                        fontSize: '14px',
                        color: '#374151',
                      }}>
                        <span style={{
                          marginRight: '8px',
                          color: '#28a745',
                          fontWeight: '700',
                        }}>
                          ✓
                        </span>
                        Reprise d'historique (option simple)
                      </li>
                    )}
                    {(tier === 'PRO' || tier === 'PRO_PLUS' || tier === 'PRO_PLUS_PLUS') && (
                      <li style={{
                        display: 'flex',
                        alignItems: 'center',
                        fontSize: '14px',
                        color: '#374151',
                      }}>
                        <span style={{
                          marginRight: '8px',
                          color: '#28a745',
                          fontWeight: '700',
                        }}>
                          ✓
                        </span>
                        Reprise d'historique (options avancées)
                      </li>
                    )}
                  </ul>
                </div>

                {isCurrentPlan && (
                  <button
                    disabled
                    style={{
                      width: '100%',
                      padding: '12px 24px',
                      fontSize: '16px',
                      fontWeight: '600',
                      color: '#6b7280',
                      backgroundColor: '#f3f4f6',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: 'not-allowed',
                    }}
                  >
                    Plan actuel
                  </button>
                )}

                {!isCurrentPlan && isUpgrade && (
                  <button
                    onClick={() => handleUpgrade(tier)}
                    disabled={loading}
                    style={{
                      width: '100%',
                      padding: '12px 24px',
                      fontSize: '16px',
                      fontWeight: '600',
                      color: 'white',
                      backgroundColor: '#28a745',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: loading ? 'not-allowed' : 'pointer',
                      opacity: loading ? 0.6 : 1,
                      transition: 'all 0.2s ease',
                    }}
                    onMouseEnter={(e) => !loading && (e.currentTarget.style.backgroundColor = '#218838')}
                    onMouseLeave={(e) => !loading && (e.currentTarget.style.backgroundColor = '#28a745')}
                  >
                    {loading ? 'Chargement...' : `Passer à ${plan.name}`}
                  </button>
                )}

                {!isCurrentPlan && isDowngrade && (
                  <button
                    onClick={() => handleUpgrade(tier)}
                    disabled={loading}
                    style={{
                      width: '100%',
                      padding: '12px 24px',
                      fontSize: '16px',
                      fontWeight: '600',
                      color: 'white',
                      backgroundColor: '#6c757d',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: loading ? 'not-allowed' : 'pointer',
                      opacity: loading ? 0.6 : 1,
                      transition: 'all 0.2s ease',
                    }}
                    onMouseEnter={(e) => !loading && (e.currentTarget.style.backgroundColor = '#5a6268')}
                    onMouseLeave={(e) => !loading && (e.currentTarget.style.backgroundColor = '#6c757d')}
                  >
                    {loading ? 'Chargement...' : `Passer à ${plan.name}`}
                  </button>
                )}

                {!isCurrentPlan && !isUpgrade && !isDowngrade && tier === 'FREE' && (
                  <div style={{
                    padding: '12px 24px',
                    textAlign: 'center',
                    color: '#6b7280',
                    fontSize: '14px',
                  }}>
                    Plan gratuit
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {effectiveTier !== 'FREE' && (
          <div style={{ textAlign: 'center', marginTop: '32px', marginBottom: '16px' }}>
            <button
              onClick={handleManageSubscription}
              disabled={loading}
              style={{
                padding: '12px 32px',
                fontSize: '16px',
                fontWeight: '600',
                color: 'white',
                backgroundColor: '#28a745',
                border: 'none',
                borderRadius: '8px',
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.6 : 1,
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => !loading && (e.currentTarget.style.backgroundColor = '#218838')}
              onMouseLeave={(e) => !loading && (e.currentTarget.style.backgroundColor = '#28a745')}
            >
              {loading ? 'Chargement...' : 'Gérer mon abonnement'}
            </button>
          </div>
        )}

        {companyId && (
          <div style={{ textAlign: 'center', marginTop: '32px' }}>
            <BackButton to={`/app/company/${companyId}`} label="Retour au tableau de bord" />
          </div>
        )}

        {!companyId && (
          <div style={{ textAlign: 'center', marginTop: '32px' }}>
            <BackButton to="/app" label="Retour à mes entreprises" />
          </div>
        )}

        {import.meta.env.DEV && companyId && (
          <div style={{
            marginTop: '48px',
            padding: '24px',
            backgroundColor: '#fff3cd',
            borderRadius: '12px',
            border: '2px solid #ffc107',
          }}>
            <h3 style={{
              fontSize: '18px',
              fontWeight: '600',
              color: '#856404',
              margin: '0 0 16px 0',
            }}>
              Test Stripe (DEV uniquement)
            </h3>
            <p style={{
              fontSize: '14px',
              color: '#856404',
              margin: '0 0 16px 0',
            }}>
              Ce bouton appelle create-checkout-session avec le même payload que le flow normal.
              Le résultat s'affiche ci-dessous au lieu de rediriger.
            </p>
            <button
              onClick={handleTestStripe}
              disabled={testLoading}
              style={{
                padding: '10px 20px',
                fontSize: '14px',
                fontWeight: '600',
                color: 'white',
                backgroundColor: '#ffc107',
                border: 'none',
                borderRadius: '8px',
                cursor: testLoading ? 'not-allowed' : 'pointer',
                opacity: testLoading ? 0.6 : 1,
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => !testLoading && (e.currentTarget.style.backgroundColor = '#e0a800')}
              onMouseLeave={(e) => !testLoading && (e.currentTarget.style.backgroundColor = '#ffc107')}
            >
              {testLoading ? 'Test en cours...' : 'Test Stripe (DEV) : create-checkout-session'}
            </button>

            {testResult && (
              <div style={{
                marginTop: '16px',
                padding: '16px',
                backgroundColor: 'white',
                borderRadius: '8px',
                border: '1px solid #e5e7eb',
              }}>
                <div style={{
                  marginBottom: '8px',
                  fontSize: '14px',
                  fontWeight: '600',
                  color: testResult.status >= 200 && testResult.status < 300 ? '#28a745' : '#dc3545',
                }}>
                  Status: {testResult.status}
                </div>
                <div style={{
                  fontSize: '13px',
                  fontWeight: '600',
                  color: '#374151',
                  marginBottom: '8px',
                }}>
                  Body:
                </div>
                <pre style={{
                  fontSize: '12px',
                  color: '#1a1a1a',
                  backgroundColor: '#f9fafb',
                  padding: '12px',
                  borderRadius: '6px',
                  overflow: 'auto',
                  maxHeight: '300px',
                  margin: 0,
                  border: '1px solid #e5e7eb',
                }}>
                  {JSON.stringify(testResult.body, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}
      </main>

      {showUpgradeModal && (
        <>
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
              zIndex: 1000,
            }}
            onClick={() => setShowUpgradeModal(false)}
          />
          <div
            style={{
              position: 'fixed',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              backgroundColor: 'white',
              borderRadius: '16px',
              padding: '32px',
              maxWidth: '500px',
              width: '90%',
              zIndex: 1001,
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
            }}
          >
            <h3 style={{
              fontSize: '24px',
              fontWeight: '700',
              color: '#1a1a1a',
              margin: '0 0 16px 0',
            }}>
              Stripe non configuré
            </h3>
            <p style={{
              fontSize: '16px',
              color: '#6b7280',
              margin: '0 0 24px 0',
              lineHeight: '1.6',
            }}>
              L'intégration Stripe sera disponible prochainement. Actuellement, le système de plans est fonctionnel en interne.
            </p>
            <button
              onClick={() => setShowUpgradeModal(false)}
              style={{
                width: '100%',
                padding: '12px 24px',
                fontSize: '16px',
                fontWeight: '600',
                color: 'white',
                backgroundColor: '#28a745',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#218838'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#28a745'}
            >
              Compris
            </button>
          </div>
        </>
      )}

      {confirmAction && (
        <>
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
              zIndex: 1000,
            }}
            onClick={() => setConfirmAction(null)}
          />
          <div
            style={{
              position: 'fixed',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              backgroundColor: 'white',
              borderRadius: '16px',
              padding: '32px',
              maxWidth: '500px',
              width: '90%',
              zIndex: 1001,
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
            }}
          >
            <h3 style={{
              fontSize: '24px',
              fontWeight: '700',
              color: '#1a1a1a',
              margin: '0 0 16px 0',
            }}>
              Confirmation
            </h3>
            <p style={{
              fontSize: '16px',
              color: '#4a5568',
              lineHeight: '1.6',
              margin: '0 0 24px 0',
            }}>
              {confirmAction.isDowngrade ? (
                <>
                  Vous allez passer à <strong>{PLANS[confirmAction.targetTier].name}</strong> en fin de période (pas immédiat). Continuer ?
                </>
              ) : (
                <>
                  Vous allez passer à <strong>{PLANS[confirmAction.targetTier].name}</strong>. La facturation peut être immédiate au prorata. Continuer ?
                </>
              )}
            </p>
            <div style={{
              display: 'flex',
              gap: '12px',
              justifyContent: 'flex-end',
            }}>
              <button
                onClick={() => setConfirmAction(null)}
                style={{
                  padding: '12px 24px',
                  fontSize: '16px',
                  fontWeight: '600',
                  color: '#4a5568',
                  backgroundColor: '#e2e8f0',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#cbd5e0'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#e2e8f0'}
              >
                Annuler
              </button>
              <button
                onClick={() => proceedWithCheckout(confirmAction.targetTier)}
                style={{
                  padding: '12px 24px',
                  fontSize: '16px',
                  fontWeight: '600',
                  color: 'white',
                  backgroundColor: '#28a745',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#218838'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#28a745'}
              >
                Continuer
              </button>
            </div>
          </div>
        </>
      )}

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      <DevAuthReset />
    </div>
  );
}
