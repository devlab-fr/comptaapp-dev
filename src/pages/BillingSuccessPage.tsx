import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { invalidateEntitlementsCache } from '../billing/useEntitlements';
import { normalizePlanTier, formatPlanLabel } from '../billing/planRules';
import AppHeader from '../components/AppHeader';

export default function BillingSuccessPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [plan, setPlan] = useState<string>('');

  useEffect(() => {
    const loadProfile = async () => {
      try {
        invalidateEntitlementsCache();

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          navigate('/login');
          return;
        }

        const { data: profile } = await supabase
          .from('profiles')
          .select('plan_tier')
          .eq('id', user.id)
          .maybeSingle();

        if (profile) {
          const normalizedTier = normalizePlanTier(profile.plan_tier);
          const planLabel = formatPlanLabel(normalizedTier);
          setPlan(planLabel);
        }
      } catch (error) {
        console.error('Error loading profile:', error);
      } finally {
        setLoading(false);
      }
    };

    loadProfile();
  }, [navigate]);

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8f9fa' }}>
      <AppHeader subtitle="" onSignOut={() => {}} />

      <main style={{
        maxWidth: '600px',
        margin: '80px auto',
        padding: '40px 24px',
        textAlign: 'center',
      }}>
        <div style={{
          backgroundColor: 'white',
          borderRadius: '16px',
          padding: '48px 32px',
          boxShadow: '0 4px 6px rgba(0, 0, 0, 0.05)',
        }}>
          {loading ? (
            <>
              <div style={{
                width: '48px',
                height: '48px',
                border: '4px solid #e5e7eb',
                borderTopColor: '#28a745',
                borderRadius: '50%',
                margin: '0 auto 24px',
                animation: 'spin 0.8s linear infinite',
              }}></div>
              <p style={{
                fontSize: '16px',
                color: '#6b7280',
                margin: 0,
              }}>
                Vérification de votre abonnement...
              </p>
            </>
          ) : (
            <>
              <div style={{
                fontSize: '64px',
                marginBottom: '24px',
              }}>
                ✓
              </div>
              <h1 style={{
                fontSize: '32px',
                fontWeight: '700',
                color: '#28a745',
                margin: '0 0 16px 0',
              }}>
                Abonnement activé
              </h1>
              <p style={{
                fontSize: '18px',
                color: '#6b7280',
                margin: '0 0 32px 0',
              }}>
                {plan ? `Votre plan ${plan} a été activé avec succès.` : 'Votre abonnement a été activé avec succès.'}
              </p>
              <button
                onClick={() => navigate('/app')}
                style={{
                  padding: '12px 32px',
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
                Retourner à l'application
              </button>
            </>
          )}
        </div>

        <style>
          {`
            @keyframes spin {
              to { transform: rotate(360deg); }
            }
          `}
        </style>
      </main>
    </div>
  );
}
