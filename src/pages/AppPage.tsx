import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import AppHeader from '../components/AppHeader';
import Footer from '../components/Footer';

interface Company {
  id: string;
  name: string;
  country: string;
}

export default function AppPage() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadCompanies();
  }, [user, location.key]);

  const loadCompanies = async () => {
    if (!user) {
      navigate('/login');
      return;
    }

    try {
      const { data, error } = await supabase
        .from('memberships')
        .select('company_id, companies(id, name, country)')
        .eq('user_id', user.id);

      if (error) {
        console.error('Error fetching companies:', error);
        setError('Impossible de charger les entreprises');
        setLoading(false);
        return;
      }

      const companyList = data
        .map((m: any) => {
          const company = Array.isArray(m.companies) ? m.companies[0] : m.companies;
          return company as Company;
        })
        .filter(Boolean);

      setCompanies(companyList);
      setLoading(false);
    } catch (err) {
      console.error('Unexpected error:', err);
      setError('Erreur inattendue lors du chargement');
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        backgroundColor: '#f8f9fa',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: '40px',
            height: '40px',
            border: '4px solid #e5e7eb',
            borderTopColor: '#28a745',
            borderRadius: '50%',
            margin: '0 auto 16px',
            animation: 'spin 0.8s linear infinite',
          }}></div>
          <p style={{ color: '#6b7280', fontSize: '14px' }}>Chargement...</p>
        </div>
        <style>
          {`
            @keyframes spin {
              to { transform: rotate(360deg); }
            }
          `}
        </style>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8f9fa', display: 'flex', flexDirection: 'column' }}>
      <AppHeader subtitle={user?.email} onSignOut={handleSignOut} />

      <main style={{
        maxWidth: '1200px',
        margin: '0 auto',
        padding: '32px 24px',
        flex: 1,
      }}>
        {error && (
          <div style={{
            padding: '14px 16px',
            backgroundColor: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '12px',
            color: '#dc2626',
            fontSize: '14px',
            marginBottom: '24px',
          }}>
            {error}
          </div>
        )}

        {companies.length === 0 ? (
          <div style={{
            padding: '80px 40px',
            backgroundColor: 'white',
            borderRadius: '16px',
            textAlign: 'center',
            boxShadow: '0 4px 6px rgba(0, 0, 0, 0.05)',
          }}>
            <div style={{
              width: '80px',
              height: '80px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 24px',
            }}>
              <img
                src="/comptaapp-icon.png"
                alt="ComptaApp"
                width="80"
                height="80"
                style={{ borderRadius: '16px', opacity: 0.7 }}
              />
            </div>
            <h2 style={{
              fontSize: '24px',
              fontWeight: '600',
              color: '#1a1a1a',
              margin: '0 0 12px 0',
            }}>
              Aucune entreprise
            </h2>
            <p style={{
              fontSize: '16px',
              color: '#6b7280',
              margin: '0 0 32px 0',
              maxWidth: '480px',
              marginLeft: 'auto',
              marginRight: 'auto',
            }}>
              Commencez par créer votre première entreprise pour accéder aux fonctionnalités de comptabilité.
            </p>
            <button
              onClick={() => navigate('/app/create-company')}
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
              Créer une entreprise
            </button>
          </div>
        ) : (
          <div>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '24px',
            }}>
              <h2 style={{
                fontSize: '20px',
                fontWeight: '600',
                color: '#1a1a1a',
                margin: 0,
              }}>
                Mes entreprises
              </h2>
              <button
                onClick={() => navigate('/app/create-company')}
                style={{
                  padding: '10px 20px',
                  fontSize: '14px',
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
                Nouvelle entreprise
              </button>
            </div>

            <div style={{ display: 'grid', gap: '16px' }}>
              {companies.map((company) => (
                <div
                  key={company.id}
                  style={{
                    padding: '24px',
                    backgroundColor: 'white',
                    border: '1px solid #e5e7eb',
                    borderRadius: '12px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    transition: 'all 0.2s ease',
                    cursor: 'pointer',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 8px 16px rgba(0, 0, 0, 0.08)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                  onClick={() => navigate(`/app/company/${company.id}`)}
                >
                  <div>
                    <h3 style={{
                      margin: '0 0 8px 0',
                      fontSize: '18px',
                      fontWeight: '600',
                      color: '#1a1a1a',
                    }}>
                      {company.name}
                    </h3>
                    <span style={{
                      display: 'inline-block',
                      padding: '4px 12px',
                      backgroundColor: '#f3f4f6',
                      color: '#6b7280',
                      fontSize: '13px',
                      fontWeight: '500',
                      borderRadius: '6px',
                    }}>
                      {company.country}
                    </span>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/app/company/${company.id}`);
                    }}
                    style={{
                      padding: '10px 20px',
                      fontSize: '14px',
                      fontWeight: '600',
                      color: '#3b82f6',
                      backgroundColor: '#eff6ff',
                      border: '1px solid #dbeafe',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = '#dbeafe';
                      e.currentTarget.style.borderColor = '#93c5fd';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = '#eff6ff';
                      e.currentTarget.style.borderColor = '#dbeafe';
                    }}
                  >
                    Accéder
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}
