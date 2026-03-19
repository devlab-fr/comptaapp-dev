import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

interface Company {
  id: string;
  name: string;
  country: string;
}

export default function AppPage() {
  const { user } = useAuth();
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
    <div style={{
      maxWidth: '1200px',
      margin: '0 auto',
      padding: '20px 24px 24px',
    }}>
        {error && (
          <div style={{
            padding: '12px 16px',
            backgroundColor: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '8px',
            color: '#dc2626',
            fontSize: '14px',
            marginBottom: '20px',
          }}>
            {error}
          </div>
        )}

        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: '20px',
          gap: '16px',
          flexWrap: 'wrap',
        }}>
          <div>
            <h2 style={{
              margin: '0 0 6px 0',
              fontSize: '28px',
              fontWeight: '700',
              color: '#1a1a1a',
            }}>
              Mes entreprises
            </h2>
            <p style={{
              margin: '0 0 8px 0',
              color: '#4b5563',
              fontSize: '14px',
            }}>
              Sélectionnez une entreprise pour accéder à son espace et à ses paramètres.
            </p>
            <p style={{
              margin: 0,
              color: '#9ca3af',
              fontSize: '12px',
            }}>
              Chaque entreprise possède son propre espace : données, paramètres et accès.
            </p>
          </div>
          {companies.length > 0 && (
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
                transition: 'background-color 0.2s ease',
                whiteSpace: 'nowrap',
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#218838'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#28a745'}
            >
              Nouvelle entreprise
            </button>
          )}
        </div>

        {companies.length === 0 ? (
          <div style={{
            padding: '80px 40px',
            backgroundColor: 'white',
            borderRadius: '16px',
            textAlign: 'center',
            boxShadow: '0 4px 6px rgba(0, 0, 0, 0.05)',
            border: '2px solid #e5e7eb',
          }}>
            <h3 style={{
              fontSize: '18px',
              fontWeight: '600',
              color: '#111',
              margin: '0 0 12px 0',
            }}>
              Aucune entreprise enregistrée pour le moment.
            </h3>
            <p style={{
              fontSize: '14px',
              color: '#374151',
              margin: '0 0 32px 0',
              maxWidth: '480px',
              marginLeft: 'auto',
              marginRight: 'auto',
            }}>
              Créez votre première entreprise pour commencer à structurer vos données.
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
                transition: 'background-color 0.2s ease',
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#218838'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#28a745'}
            >
              Créer une entreprise
            </button>
          </div>
        ) : (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            maxWidth: '800px',
            margin: '0 auto',
          }}>
            {companies.map((company) => (
              <div
                key={company.id}
                style={{
                  padding: '24px 28px',
                  backgroundColor: 'white',
                  border: '1px solid #e5e7eb',
                  borderRadius: '12px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  transition: 'all 0.2s ease',
                  cursor: 'pointer',
                  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.06)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 6px 16px rgba(0, 0, 0, 0.1)';
                  e.currentTarget.style.borderColor = '#d1d5db';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.06)';
                  e.currentTarget.style.borderColor = '#e5e7eb';
                }}
                onClick={() => navigate(`/app/company/${company.id}`)}
              >
                <div>
                  <h3 style={{
                    margin: '0 0 10px 0',
                    fontSize: '20px',
                    fontWeight: '700',
                    color: '#1a1a1a',
                  }}>
                    {company.name}
                  </h3>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                  }}>
                    <span style={{
                      display: 'inline-block',
                      padding: '4px 10px',
                      backgroundColor: '#f9fafb',
                      color: '#6b7280',
                      fontSize: '12px',
                      fontWeight: '500',
                      borderRadius: '6px',
                      border: '1px solid #e5e7eb',
                    }}>
                      {company.country}
                    </span>
                    <span style={{
                      fontSize: '11px',
                      color: '#9ca3af',
                    }}>
                      Espace entreprise
                    </span>
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`/app/company/${company.id}`);
                  }}
                  style={{
                    padding: '10px 24px',
                    fontSize: '14px',
                    fontWeight: '600',
                    color: 'white',
                    backgroundColor: '#28a745',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    whiteSpace: 'nowrap',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#218838';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '#28a745';
                  }}
                >
                  Ouvrir l'espace
                </button>
              </div>
            ))}
          </div>
        )}
    </div>
  );
}
