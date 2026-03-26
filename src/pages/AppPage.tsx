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
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [companyToDelete, setCompanyToDelete] = useState<Company | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

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

  const handleDeleteClick = (company: Company, e: React.MouseEvent) => {
    e.stopPropagation();
    setCompanyToDelete(company);
    setDeleteError(null);
    setShowDeleteModal(true);
  };

  const handleDeleteConfirm = async () => {
    if (!companyToDelete) return;

    setDeleting(true);
    setDeleteError(null);

    try {
      const { data: subscription } = await supabase
        .from('company_subscriptions')
        .select('plan_tier, stripe_subscription_id, status')
        .eq('company_id', companyToDelete.id)
        .maybeSingle();

      if (subscription && subscription.plan_tier !== 'FREE' && subscription.status === 'active') {
        setDeleteError('Impossible de supprimer une entreprise avec un abonnement actif');
        setDeleting(false);
        return;
      }

      const { error: deleteError } = await supabase
        .from('companies')
        .delete()
        .eq('id', companyToDelete.id);

      if (deleteError) {
        console.error('Error deleting company:', deleteError);
        setDeleteError('Erreur lors de la suppression de l\'entreprise');
        setDeleting(false);
        return;
      }

      setShowDeleteModal(false);
      setCompanyToDelete(null);
      setDeleting(false);
      await loadCompanies();
    } catch (err) {
      console.error('Unexpected error:', err);
      setDeleteError('Erreur inattendue lors de la suppression');
      setDeleting(false);
    }
  };

  const handleDeleteCancel = () => {
    setShowDeleteModal(false);
    setCompanyToDelete(null);
    setDeleteError(null);
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
                  border: '2px solid #e5e7eb',
                  borderRadius: '16px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  transition: 'all 0.3s ease',
                  cursor: 'pointer',
                  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.05)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-4px) scale(1.01)';
                  e.currentTarget.style.boxShadow = '0 12px 24px rgba(0, 0, 0, 0.12)';
                  e.currentTarget.style.borderColor = '#d1d5db';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0) scale(1)';
                  e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.05)';
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
                <div style={{ display: 'flex', gap: '10px' }}>
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
                  <button
                    onClick={(e) => handleDeleteClick(company, e)}
                    style={{
                      padding: '10px 16px',
                      fontSize: '14px',
                      fontWeight: '600',
                      color: '#dc2626',
                      backgroundColor: 'white',
                      border: '2px solid #dc2626',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      whiteSpace: 'nowrap',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = '#fef2f2';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'white';
                    }}
                  >
                    Supprimer
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {showDeleteModal && companyToDelete && (
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 2000,
            }}
            onClick={handleDeleteCancel}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                backgroundColor: 'white',
                borderRadius: '16px',
                width: '90%',
                maxWidth: '500px',
                boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
              }}
            >
              <div
                style={{
                  padding: '24px',
                  borderBottom: '1px solid #e5e7eb',
                }}
              >
                <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '700', color: '#dc2626' }}>
                  Supprimer l'entreprise
                </h2>
              </div>

              <div style={{ padding: '24px' }}>
                <p style={{
                  margin: '0 0 20px 0',
                  fontSize: '15px',
                  color: '#374151',
                  lineHeight: '1.6',
                }}>
                  Êtes-vous sûr de vouloir supprimer l'entreprise <strong>{companyToDelete.name}</strong> ?
                </p>
                <p style={{
                  margin: 0,
                  fontSize: '14px',
                  color: '#dc2626',
                  fontWeight: '600',
                  backgroundColor: '#fef2f2',
                  padding: '12px',
                  borderRadius: '8px',
                  border: '1px solid #fecaca',
                }}>
                  Cette action est irréversible.
                </p>

                {deleteError && (
                  <div style={{
                    marginTop: '16px',
                    padding: '12px',
                    backgroundColor: '#fef2f2',
                    border: '1px solid #fecaca',
                    borderRadius: '8px',
                    color: '#dc2626',
                    fontSize: '14px',
                  }}>
                    {deleteError}
                  </div>
                )}
              </div>

              <div style={{
                padding: '20px 24px',
                borderTop: '1px solid #e5e7eb',
                display: 'flex',
                gap: '12px',
                justifyContent: 'flex-end',
              }}>
                <button
                  onClick={handleDeleteCancel}
                  disabled={deleting}
                  style={{
                    padding: '10px 20px',
                    backgroundColor: 'white',
                    color: '#374151',
                    border: '2px solid #d1d5db',
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontWeight: '600',
                    cursor: deleting ? 'not-allowed' : 'pointer',
                    opacity: deleting ? 0.5 : 1,
                    transition: 'all 0.2s ease',
                  }}
                  onMouseEnter={(e) => {
                    if (!deleting) {
                      e.currentTarget.style.backgroundColor = '#f9fafb';
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'white';
                  }}
                >
                  Annuler
                </button>
                <button
                  onClick={handleDeleteConfirm}
                  disabled={deleting}
                  style={{
                    padding: '10px 20px',
                    backgroundColor: deleting ? '#fca5a5' : '#dc2626',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontWeight: '600',
                    cursor: deleting ? 'not-allowed' : 'pointer',
                    transition: 'all 0.2s ease',
                  }}
                  onMouseEnter={(e) => {
                    if (!deleting) {
                      e.currentTarget.style.backgroundColor = '#b91c1c';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!deleting) {
                      e.currentTarget.style.backgroundColor = '#dc2626';
                    }
                  }}
                >
                  {deleting ? 'Suppression...' : 'Supprimer définitivement'}
                </button>
              </div>
            </div>
          </div>
        )}
    </div>
  );
}
