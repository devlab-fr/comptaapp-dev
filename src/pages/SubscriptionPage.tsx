import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { usePlan } from '../lib/usePlan';
import { PLANS, PlanTier } from '../lib/plans';
import AppHeader from '../components/AppHeader';
import BackButton from '../components/BackButton';
import { supabase } from '../lib/supabase';

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
  const { companyId } = useParams<{ companyId: string }>();
  const { effectiveTier } = usePlan();
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [testResult, setTestResult] = useState<{ status: number; body: any } | null>(null);
  const [testLoading, setTestLoading] = useState(false);

  console.log('SUBSCRIPTION_PAGE_RENDER', {
    userId: user?.id,
    companyId,
    effectiveTier,
    displayedPlanName: PLANS[effectiveTier].name,
  });

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const handleUpgrade = async (targetTier: PlanTier) => {
    if (targetTier === 'FREE') return;

    console.log('CHECKOUT_START', {
      routeCompanyId: companyId,
      targetTier,
      urlPath: window.location.pathname,
    });

    if (!companyId) {
      console.error('CHECKOUT_NO_COMPANY_ID', { urlPath: window.location.pathname });
      alert('Aucune entreprise sélectionnée');
      return;
    }

    setLoading(true);
    try {
      let { data: { session } } = await supabase.auth.getSession();

      if (!session || !session.access_token) {
        console.warn('CHECKOUT_NO_SESSION_TRYING_REFRESH');
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
        console.log('CHECKOUT_SESSION_REFRESHED', {
          hasToken: !!session.access_token,
          tokenPrefix: session.access_token.substring(0, 10),
        });
      }

      const token = session.access_token;

      let jwtPayload: any = null;
      try {
        const parts = token.split('.');
        if (parts.length === 3) {
          jwtPayload = JSON.parse(atob(parts[1]));
          console.log('JWT_ISS_CHECK', {
            iss: jwtPayload.iss,
            aud: jwtPayload.aud,
            exp: jwtPayload.exp,
            sub: jwtPayload.sub,
            tokenLen: token.length,
            supabaseUrlUsed: import.meta.env.VITE_SUPABASE_URL,
          });
        }
      } catch (e) {
        console.error('JWT_DECODE_FAILED', e);
      }

      console.log('CHECKOUT_CALLING_EDGE', {
        hasSession: !!session,
        hasToken: !!token,
        tokenPrefix: token.substring(0, 10),
        companyId,
        planTier: targetTier,
        userId: user?.id,
      });

      const { data, error } = await supabase.functions.invoke('create-checkout-session', {
        body: { planTier: targetTier, companyId },
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (error) {
        console.error('CHECKOUT_EDGE_ERROR', {
          message: error.message,
          context: error.context,
          status: error.status,
        });
        if (error.message?.includes('401') || error.message?.includes('Unauthorized') || error.message?.includes('Invalid JWT')) {
          alert('Session invalide, veuillez vous reconnecter');
          await supabase.auth.signOut();
          navigate('/login');
        } else {
          alert(`Erreur: ${error.message || 'Impossible de créer la session de paiement'}`);
        }
        return;
      }

      if (data?.url) {
        if (!isValidStripeUrl(data.url)) {
          console.warn('STRIPE_BAD_URL', { url: data.url });
          alert('URL de paiement invalide');
          return;
        }
        console.log('STRIPE_REDIRECT_CHECKOUT', data.url.slice(0, 50));
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

      const token = session.access_token;
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-checkout-session`;
      const payload = { planTier: 'PRO', companyId };

      console.log('[DEV_STRIPE_TEST] calling create-checkout-session', { url, payload });

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
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      console.log("PORTAL_TOKEN_PREFIX", token?.slice(0, 10), "isJwt", token?.split(".")?.length === 3);

      if (!token) {
        alert('Session invalide - reconnectez-vous');
        console.error("PORTAL_NO_TOKEN");
        return;
      }

      const callPortal = async (accessToken: string) => {
        return await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-portal-session`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify({}),
          }
        );
      };

      let res = await callPortal(token);

      if (res.status === 401) {
        console.warn("PORTAL_401_RETRY_REFRESH");
        const { data: refreshed } = await supabase.auth.refreshSession();
        const newToken = refreshed?.session?.access_token;

        console.log("PORTAL_NEW_TOKEN_PREFIX", newToken?.slice(0, 10), "isJwt", newToken?.split(".")?.length === 3);

        if (!newToken) {
          alert('Impossible de rafraîchir la session - reconnectez-vous');
          console.error("PORTAL_NO_NEW_TOKEN_AFTER_REFRESH");
          return;
        }

        res = await callPortal(newToken);
      }

      if (!res.ok) {
        const errText = await res.text();
        console.error("PORTAL_ERROR", res.status, errText);
        alert(`Erreur ${res.status}: ${errText.slice(0, 120)}`);
        return;
      }

      const data = await res.json();

      if (data.ok && data.url) {
        if (!isValidStripeUrl(data.url)) {
          console.warn('STRIPE_BAD_URL', { url: data.url });
          alert('URL de portail invalide');
          return;
        }
        console.log("PORTAL_REDIRECT_SUCCESS", data.url.slice(0, 50));
        window.location.assign(data.url);
      } else {
        console.error("PORTAL_NO_URL", data);
        alert('Erreur: aucune URL de portail retournée');
      }
    } catch (error) {
      console.error('PORTAL_EXCEPTION', error);
      alert('Erreur lors de la création de la session portail');
    } finally {
      setLoading(false);
    }
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
            const isHigherTier = plan.rank > PLANS[effectiveTier].rank;

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

                {!isCurrentPlan && isHigherTier && (
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

                {!isCurrentPlan && !isHigherTier && (
                  <div style={{
                    padding: '12px 24px',
                    textAlign: 'center',
                    color: '#6b7280',
                    fontSize: '14px',
                  }}>
                    Plan inférieur
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
    </div>
  );
}
