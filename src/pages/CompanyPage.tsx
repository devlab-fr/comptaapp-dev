import { useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import BackButton from '../components/BackButton';
import KPIGraphs from '../components/KPIGraphs';
import { usePlan } from '../lib/usePlan';
import { useLegalAcceptance } from '../hooks/useLegalAcceptance';
import { LegalGateModal } from '../components/legal/LegalGateModal';

interface Company {
  id: string;
  name: string;
  country: string;
}

interface ExpenseSummary {
  totalTTC: number;
  totalHT: number;
  totalTVA: number;
  count: number;
  unpaidAmount: number;
}

interface RevenueSummary {
  totalTTC: number;
  totalHT: number;
  totalTVA: number;
  count: number;
}

export default function CompanyPage() {
  const { companyId } = useParams<{ companyId: string }>();
  useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { canUse } = usePlan(companyId);
  const { hasAccepted, loading: legalLoading } = useLegalAcceptance(companyId);
  const [showLegalGate, setShowLegalGate] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const [showFacturesUpsell, setShowFacturesUpsell] = useState(false);
  const [acceptedCGULocally, setAcceptedCGULocally] = useState(false);
  const [company, setCompany] = useState<Company | null>(null);
  const [expenseSummary, setExpenseSummary] = useState<ExpenseSummary>({ totalTTC: 0, totalHT: 0, totalTVA: 0, count: 0, unpaidAmount: 0 });
  const [revenueSummary, setRevenueSummary] = useState<RevenueSummary>({ totalTTC: 0, totalHT: 0, totalTVA: 0, count: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleProtectedAction = (action: () => void) => {
    if (legalLoading) {
      return;
    }
    if (!hasAccepted('cgu')) {
      setPendingAction(() => action);
      setShowLegalGate(true);
      return;
    }
    action();
  };

  const onCGUAccepted = () => {
    setAcceptedCGULocally(true);
    setShowLegalGate(false);
    if (pendingAction) {
      pendingAction();
      setPendingAction(null);
    }
  };

  useEffect(() => {
    const success = searchParams.get('success');
    if (success === 'expense_added') {
      setSuccessMessage('Dépense ajoutée avec succès');
      setSearchParams({});
      loadExpenseSummary();
      setTimeout(() => {
        setSuccessMessage(null);
      }, 4000);
    } else if (success === 'revenue_added') {
      setSuccessMessage('Revenu ajouté avec succès');
      setSearchParams({});
      loadRevenueSummary();
      setTimeout(() => {
        setSuccessMessage(null);
      }, 4000);
    } else if (success === 'expense_updated') {
      setSuccessMessage('Dépense modifiée avec succès');
      setSearchParams({});
      loadExpenseSummary();
      setTimeout(() => {
        setSuccessMessage(null);
      }, 4000);
    } else if (success === 'revenue_updated') {
      setSuccessMessage('Revenu modifié avec succès');
      setSearchParams({});
      loadRevenueSummary();
      setTimeout(() => {
        setSuccessMessage(null);
      }, 4000);
    }
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    const loadCompany = async () => {
      if (!companyId) {
        setError('ID entreprise manquant');
        setLoading(false);
        return;
      }

      const { data, error: fetchError } = await supabase
        .from('companies')
        .select('id, name, country')
        .eq('id', companyId)
        .maybeSingle();

      if (fetchError) {
        setError('Erreur de chargement');
        setLoading(false);
        return;
      }

      if (!data) {
        setError('Entreprise introuvable');
        setLoading(false);
        return;
      }

      setCompany(data);
      setLoading(false);
    };

    loadCompany();
  }, [companyId]);

  useEffect(() => {
    setAcceptedCGULocally(false);
  }, [companyId]);

  const loadExpenseSummary = async () => {
    if (!companyId) return;

    const now = new Date();
    const currentYear = now.getFullYear();
    const startDate = `${currentYear}-01-01`;
    const endDate = `${currentYear}-12-31`;

    const { data } = await supabase
      .from('expense_documents')
      .select('total_incl_vat, total_excl_vat, total_vat, payment_status')
      .eq('company_id', companyId)
      .gte('invoice_date', startDate)
      .lte('invoice_date', endDate);

    if (data) {
      const summary = data.reduce(
        (acc, doc) => ({
          totalTTC: acc.totalTTC + (Number(doc.total_incl_vat) || 0),
          totalHT: acc.totalHT + (Number(doc.total_excl_vat) || 0),
          totalTVA: acc.totalTVA + (Number(doc.total_vat) || 0),
          count: acc.count + 1,
          unpaidAmount: acc.unpaidAmount + (doc.payment_status !== 'paid' ? (Number(doc.total_incl_vat) || 0) : 0),
        }),
        { totalTTC: 0, totalHT: 0, totalTVA: 0, count: 0, unpaidAmount: 0 }
      );
      setExpenseSummary(summary);
    }
  };

  const loadRevenueSummary = async () => {
    if (!companyId) return;

    const now = new Date();
    const currentYear = now.getFullYear();
    const startDate = `${currentYear}-01-01`;
    const endDate = `${currentYear}-12-31`;

    const { data } = await supabase
      .from('revenue_documents')
      .select('total_incl_vat, total_excl_vat, total_vat')
      .eq('company_id', companyId)
      .gte('invoice_date', startDate)
      .lte('invoice_date', endDate);

    if (data) {
      const summary = data.reduce(
        (acc, doc) => ({
          totalTTC: acc.totalTTC + (Number(doc.total_incl_vat) || 0),
          totalHT: acc.totalHT + (Number(doc.total_excl_vat) || 0),
          totalTVA: acc.totalTVA + (Number(doc.total_vat) || 0),
          count: acc.count + 1,
        }),
        { totalTTC: 0, totalHT: 0, totalTVA: 0, count: 0 }
      );
      setRevenueSummary(summary);
    }
  };

  useEffect(() => {
    if (companyId) {
      loadExpenseSummary();
      loadRevenueSummary();
    }
  }, [companyId]);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && showFacturesUpsell) {
        setShowFacturesUpsell(false);
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [showFacturesUpsell]);

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

  if (error || !company) {
    return (
      <div style={{
        minHeight: '100vh',
        backgroundColor: '#f8f9fa',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <div style={{ textAlign: 'center' }}>
          <p style={{ color: '#dc2626', marginBottom: '24px', fontSize: '16px' }}>
            {error || 'Erreur'}
          </p>
          <BackButton to="/app" label="Retour à mes entreprises" />
        </div>
      </div>
    );
  }

  return (
    <>
      <style>{`
        @media (max-width: 767px) {
          .quick-actions-grid { grid-template-columns: 1fr !important; }
          .modules-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>

      <div style={{ backgroundColor: '#f8f9fa', minHeight: '100%' }}>
        <main style={{
          maxWidth: '1200px',
          margin: '0 auto',
          padding: '32px 24px',
        }}>
          {!legalLoading && !acceptedCGULocally && !hasAccepted('cgu') && (
            <div style={{
              padding: '16px 20px',
              backgroundColor: '#fef3c7',
              border: '2px solid #fbbf24',
              borderRadius: '12px',
              marginBottom: '24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
                <span style={{ fontSize: '24px' }}>⚠️</span>
                <p style={{
                  margin: 0,
                  color: '#92400e',
                  fontSize: '14px',
                  fontWeight: '500',
                }}>
                  Pour utiliser les fonctionnalités de ComptaApp (dépenses, revenus, factures), vous devez accepter les Conditions Générales d'Utilisation.
                </p>
              </div>
              <button
                onClick={() => setShowLegalGate(true)}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#f59e0b',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  marginLeft: '16px',
                }}
              >
                Lire et accepter
              </button>
            </div>
          )}
          {successMessage && (
            <div style={{
              padding: '12px 16px',
              backgroundColor: '#d1f4e0',
              border: '1px solid #9ae6b4',
              borderRadius: '8px',
              marginBottom: '24px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}>
              <span style={{ fontSize: '18px' }}>✓</span>
              <p style={{
                margin: 0,
                color: '#22543d',
                fontSize: '14px',
                fontWeight: '500',
              }}>
                {successMessage}
              </p>
            </div>
          )}

          <BackButton to="/app" label="Retour à mes entreprises" />

          <div style={{
            padding: '24px 32px',
            backgroundColor: 'white',
            borderRadius: '16px',
            boxShadow: '0 4px 6px rgba(0, 0, 0, 0.05)',
            border: '2px solid #e5e7eb',
            marginBottom: '32px',
          }}>
            <h2 style={{
              margin: '0 0 4px 0',
              fontSize: '32px',
              fontWeight: '700',
              color: '#1a1a1a',
            }}>
              {company.name}
            </h2>
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

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
            gap: '20px',
            marginBottom: '32px',
          }}>
            <div style={{
              padding: '24px',
              backgroundColor: 'white',
              borderRadius: '12px',
              border: '2px solid #d1fae5',
              boxShadow: '0 2px 4px rgba(0, 0, 0, 0.05)',
            }}>
              <p style={{
                margin: '0 0 8px 0',
                fontSize: '14px',
                fontWeight: '500',
                color: '#6b7280',
              }}>
                Encaissements
              </p>
              <p style={{
                margin: 0,
                fontSize: '32px',
                fontWeight: '700',
                color: '#16a34a',
              }}>
                {new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(revenueSummary.totalTTC)}
              </p>
            </div>

            <div style={{
              padding: '24px',
              backgroundColor: 'white',
              borderRadius: '12px',
              border: '2px solid #fee2e2',
              boxShadow: '0 2px 4px rgba(0, 0, 0, 0.05)',
            }}>
              <p style={{
                margin: '0 0 8px 0',
                fontSize: '14px',
                fontWeight: '500',
                color: '#6b7280',
              }}>
                Dépenses
              </p>
              <p style={{
                margin: 0,
                fontSize: '32px',
                fontWeight: '700',
                color: '#dc2626',
              }}>
                {new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(expenseSummary.totalTTC)}
              </p>
            </div>

            <div style={{
              padding: '24px',
              backgroundColor: 'white',
              borderRadius: '12px',
              border: '2px solid #dbeafe',
              boxShadow: '0 2px 4px rgba(0, 0, 0, 0.05)',
            }}>
              <p style={{
                margin: '0 0 8px 0',
                fontSize: '14px',
                fontWeight: '500',
                color: '#6b7280',
              }}>
                TVA estimée
              </p>
              <p style={{
                margin: 0,
                fontSize: '32px',
                fontWeight: '700',
                color: '#2563eb',
              }}>
                {new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(revenueSummary.totalTVA - expenseSummary.totalTVA)}
              </p>
            </div>

            <div style={{
              padding: '24px',
              backgroundColor: 'white',
              borderRadius: '12px',
              border: '2px solid #f3e8ff',
              boxShadow: '0 2px 4px rgba(0, 0, 0, 0.05)',
            }}>
              <p style={{
                margin: '0 0 8px 0',
                fontSize: '14px',
                fontWeight: '500',
                color: '#6b7280',
              }}>
                Résultat
              </p>
              <p style={{
                margin: 0,
                fontSize: '32px',
                fontWeight: '700',
                color: revenueSummary.totalHT - expenseSummary.totalHT - (revenueSummary.totalTVA - expenseSummary.totalTVA) >= 0 ? '#7c3aed' : '#dc2626',
              }}>
                {new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(revenueSummary.totalHT - expenseSummary.totalHT - (revenueSummary.totalTVA - expenseSummary.totalTVA))}
              </p>
            </div>
          </div>

          <div style={{
            padding: '28px 32px',
            backgroundColor: 'white',
            borderRadius: '16px',
            border: '2px solid #e5e7eb',
            marginBottom: '32px',
            boxShadow: '0 2px 4px rgba(0, 0, 0, 0.05)',
          }}>
            <h3 style={{
              margin: '0 0 24px 0',
              fontSize: '20px',
              fontWeight: '700',
              color: '#1a1a1a',
            }}>
              Actions rapides
            </h3>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '16px',
            }}>
              <button
                onClick={() => handleProtectedAction(() => navigate(`/app/company/${companyId}/expenses/new`))}
                style={{
                  padding: '24px 20px',
                  backgroundColor: '#fef2f2',
                  border: '2px solid #dc2626',
                  borderRadius: '12px',
                  cursor: 'pointer',
                  transition: 'all 0.3s ease',
                  textAlign: 'center',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#fee2e2';
                  e.currentTarget.style.transform = 'translateY(-4px)';
                  e.currentTarget.style.boxShadow = '0 8px 16px rgba(220, 38, 38, 0.2)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#fef2f2';
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                <div style={{ fontSize: '40px', marginBottom: '12px' }}>📤</div>
                <h4 style={{
                  margin: 0,
                  fontSize: '16px',
                  fontWeight: '600',
                  color: '#dc2626',
                }}>
                  Ajouter une dépense
                </h4>
              </button>

              <button
                onClick={() => handleProtectedAction(() => navigate(`/app/company/${companyId}/revenues/new`))}
                style={{
                  padding: '24px 20px',
                  backgroundColor: '#f0fdf4',
                  border: '2px solid #16a34a',
                  borderRadius: '12px',
                  cursor: 'pointer',
                  transition: 'all 0.3s ease',
                  textAlign: 'center',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#dcfce7';
                  e.currentTarget.style.transform = 'translateY(-4px)';
                  e.currentTarget.style.boxShadow = '0 8px 16px rgba(22, 163, 74, 0.2)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#f0fdf4';
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                <div style={{ fontSize: '40px', marginBottom: '12px' }}>📥</div>
                <h4 style={{
                  margin: 0,
                  fontSize: '16px',
                  fontWeight: '600',
                  color: '#16a34a',
                }}>
                  Ajouter un revenu
                </h4>
              </button>

              <button
                onClick={() => handleProtectedAction(() => {
                  if (canUse('facturation')) {
                    navigate(`/app/company/${companyId}/factures/new`);
                  } else {
                    setShowFacturesUpsell(true);
                  }
                })}
                style={{
                  padding: '24px 20px',
                  backgroundColor: '#eff6ff',
                  border: '2px solid #2563eb',
                  borderRadius: '12px',
                  cursor: 'pointer',
                  transition: 'all 0.3s ease',
                  textAlign: 'center',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#dbeafe';
                  e.currentTarget.style.transform = 'translateY(-4px)';
                  e.currentTarget.style.boxShadow = '0 8px 16px rgba(37, 99, 235, 0.2)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#eff6ff';
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                <div style={{ fontSize: '40px', marginBottom: '12px' }}>📄</div>
                <h4 style={{
                  margin: 0,
                  fontSize: '16px',
                  fontWeight: '600',
                  color: '#2563eb',
                }}>
                  Créer une facture
                </h4>
              </button>
            </div>
          </div>

          <KPIGraphs companyId={companyId!} />

          <div style={{
            padding: '24px 32px',
            backgroundColor: '#f9fafb',
            borderRadius: '16px',
            border: '2px solid #e5e7eb',
            marginBottom: '32px',
          }}>
            <h3 style={{
              margin: '0 0 20px 0',
              fontSize: '18px',
              fontWeight: '600',
              color: '#1a1a1a',
            }}>
              Trésorerie & Banque
            </h3>

            <div className="quick-actions-grid" style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: '16px',
            }}>
              <button
                onClick={() => navigate(`/app/company/${companyId}/tresorerie`)}
                style={{
                  padding: '20px',
                  backgroundColor: 'white',
                  border: '2px solid #10b981',
                  borderRadius: '12px',
                  cursor: 'pointer',
                  transition: 'all 0.3s ease-out',
                  textAlign: 'left',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#d1fae5';
                  e.currentTarget.style.transform = 'translateY(-2px) scale(1.05)';
                  e.currentTarget.style.boxShadow = '0 10px 20px rgba(0, 0, 0, 0.15)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'white';
                  e.currentTarget.style.transform = 'translateY(0) scale(1)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                <div style={{ fontSize: '28px', marginBottom: '12px' }}>💰</div>
                <h4 style={{
                  margin: '0 0 6px 0',
                  fontSize: '15px',
                  fontWeight: '600',
                  color: '#10b981',
                }}>
                  Trésorerie
                </h4>
                <p style={{
                  margin: 0,
                  fontSize: '12px',
                  color: '#6b7280',
                  lineHeight: '1.4',
                }}>
                  Soldes bancaires
                </p>
              </button>

              {canUse('banking') ? (
                <button
                  onClick={() => navigate(`/app/company/${companyId}/banque`)}
                  style={{
                    padding: '20px',
                    backgroundColor: 'white',
                    border: '2px solid #0ea5e9',
                    borderRadius: '12px',
                    cursor: 'pointer',
                    transition: 'all 0.3s ease-out',
                    textAlign: 'left',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#e0f2fe';
                    e.currentTarget.style.transform = 'translateY(-2px) scale(1.05)';
                    e.currentTarget.style.boxShadow = '0 10px 20px rgba(0, 0, 0, 0.15)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'white';
                    e.currentTarget.style.transform = 'translateY(0) scale(1)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                >
                  <div style={{ fontSize: '28px', marginBottom: '12px' }}>🏦</div>
                  <h4 style={{
                    margin: '0 0 6px 0',
                    fontSize: '15px',
                    fontWeight: '600',
                    color: '#0ea5e9',
                  }}>
                    Banque
                  </h4>
                  <p style={{
                    margin: 0,
                    fontSize: '12px',
                    color: '#6b7280',
                    lineHeight: '1.4',
                  }}>
                    Import & rapprochement
                  </p>
                </button>
              ) : (
                <button
                  onClick={() => navigate(`/app/company/${companyId}/subscription`)}
                  style={{
                    padding: '20px',
                    backgroundColor: '#f3f4f6',
                    border: '2px solid #d1d5db',
                    borderRadius: '12px',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    textAlign: 'left',
                    opacity: 0.7,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.opacity = '1';
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 6px 12px rgba(0, 0, 0, 0.1)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.opacity = '0.7';
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                >
                  <div style={{ fontSize: '28px', marginBottom: '12px' }}>🔒</div>
                  <h4 style={{
                    margin: '0 0 6px 0',
                    fontSize: '15px',
                    fontWeight: '600',
                    color: '#6b7280',
                  }}>
                    Banque
                  </h4>
                  <p style={{
                    margin: 0,
                    fontSize: '12px',
                    color: '#6b7280',
                    lineHeight: '1.4',
                  }}>
                    Pro+ requis
                  </p>
                </button>
              )}
            </div>
          </div>

          <div style={{
            padding: '24px 32px',
            backgroundColor: '#f9fafb',
            borderRadius: '16px',
            border: '2px solid #e5e7eb',
            marginBottom: '32px',
          }}>
            <h3 style={{
              margin: '0 0 20px 0',
              fontSize: '18px',
              fontWeight: '600',
              color: '#1a1a1a',
            }}>
              Modules comptables
            </h3>

            <div className="modules-grid" style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: '16px',
            }}>
              <button
                onClick={() => navigate(`/app/company/${companyId}/tva`)}
                style={{
                  padding: '20px',
                  backgroundColor: 'white',
                  border: '2px solid #3b82f6',
                  borderRadius: '12px',
                  cursor: 'pointer',
                  transition: 'all 0.3s ease-out',
                  textAlign: 'left',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#eff6ff';
                  e.currentTarget.style.transform = 'translateY(-2px) scale(1.05)';
                  e.currentTarget.style.boxShadow = '0 10px 20px rgba(0, 0, 0, 0.15)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'white';
                  e.currentTarget.style.transform = 'translateY(0) scale(1)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                <div style={{ fontSize: '28px', marginBottom: '12px' }}>📊</div>
                <h4 style={{
                  margin: '0 0 6px 0',
                  fontSize: '15px',
                  fontWeight: '600',
                  color: '#3b82f6',
                }}>
                  TVA
                </h4>
                <p style={{
                  margin: 0,
                  fontSize: '12px',
                  color: '#6b7280',
                  lineHeight: '1.4',
                }}>
                  Rapports et synthèses
                </p>
              </button>

              <button
                onClick={() => navigate(`/app/company/${companyId}/resultat`)}
                style={{
                  padding: '20px',
                  backgroundColor: 'white',
                  border: '2px solid #059669',
                  borderRadius: '12px',
                  cursor: 'pointer',
                  transition: 'all 0.3s ease-out',
                  textAlign: 'left',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#d1fae5';
                  e.currentTarget.style.transform = 'translateY(-2px) scale(1.05)';
                  e.currentTarget.style.boxShadow = '0 10px 20px rgba(0, 0, 0, 0.15)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'white';
                  e.currentTarget.style.transform = 'translateY(0) scale(1)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                <div style={{ fontSize: '28px', marginBottom: '12px' }}>📈</div>
                <h4 style={{
                  margin: '0 0 6px 0',
                  fontSize: '15px',
                  fontWeight: '600',
                  color: '#059669',
                }}>
                  Compte de résultat
                </h4>
                <p style={{
                  margin: 0,
                  fontSize: '12px',
                  color: '#6b7280',
                  lineHeight: '1.4',
                }}>
                  Produits et charges
                </p>
              </button>

              <button
                onClick={() => navigate(`/app/company/${companyId}/bilan`)}
                style={{
                  padding: '20px',
                  backgroundColor: 'white',
                  border: '2px solid #7c3aed',
                  borderRadius: '12px',
                  cursor: 'pointer',
                  transition: 'all 0.3s ease-out',
                  textAlign: 'left',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#f3e8ff';
                  e.currentTarget.style.transform = 'translateY(-2px) scale(1.05)';
                  e.currentTarget.style.boxShadow = '0 10px 20px rgba(0, 0, 0, 0.15)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'white';
                  e.currentTarget.style.transform = 'translateY(0) scale(1)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                <div style={{ fontSize: '28px', marginBottom: '12px' }}>⚖️</div>
                <h4 style={{
                  margin: '0 0 6px 0',
                  fontSize: '15px',
                  fontWeight: '600',
                  color: '#7c3aed',
                }}>
                  Bilan
                </h4>
                <p style={{
                  margin: 0,
                  fontSize: '12px',
                  color: '#6b7280',
                  lineHeight: '1.4',
                }}>
                  Actif et passif
                </p>
              </button>

              <button
                onClick={() => navigate(`/app/company/${companyId}/comptabilite`)}
                style={{
                  padding: '20px',
                  backgroundColor: 'white',
                  border: '2px solid #8b5cf6',
                  borderRadius: '12px',
                  cursor: 'pointer',
                  transition: 'all 0.3s ease-out',
                  textAlign: 'left',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#f5f3ff';
                  e.currentTarget.style.transform = 'translateY(-2px) scale(1.05)';
                  e.currentTarget.style.boxShadow = '0 10px 20px rgba(0, 0, 0, 0.15)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'white';
                  e.currentTarget.style.transform = 'translateY(0) scale(1)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                <div style={{ fontSize: '28px', marginBottom: '12px' }}>📒</div>
                <h4 style={{
                  margin: '0 0 6px 0',
                  fontSize: '15px',
                  fontWeight: '600',
                  color: '#8b5cf6',
                }}>
                  Comptabilité
                </h4>
                <p style={{
                  margin: 0,
                  fontSize: '12px',
                  color: '#6b7280',
                  lineHeight: '1.4',
                }}>
                  Écritures comptables
                </p>
              </button>
            </div>
          </div>

          <div style={{
            padding: '24px 32px',
            backgroundColor: '#f9fafb',
            borderRadius: '16px',
            border: '2px solid #e5e7eb',
            marginBottom: '32px',
          }}>
            <h3 style={{
              margin: '0 0 20px 0',
              fontSize: '18px',
              fontWeight: '600',
              color: '#1a1a1a',
            }}>
              Rapports & contrôles
            </h3>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: '16px',
            }}>
              <button
                onClick={() => navigate(`/app/company/${companyId}/rapports`)}
                style={{
                  padding: '20px',
                  backgroundColor: 'white',
                  border: '2px solid #f97316',
                  borderRadius: '12px',
                  cursor: 'pointer',
                  transition: 'all 0.3s ease-out',
                  textAlign: 'left',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#ffedd5';
                  e.currentTarget.style.transform = 'translateY(-2px) scale(1.05)';
                  e.currentTarget.style.boxShadow = '0 10px 20px rgba(0, 0, 0, 0.15)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'white';
                  e.currentTarget.style.transform = 'translateY(0) scale(1)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                <div style={{ fontSize: '28px', marginBottom: '12px' }}>📄</div>
                <h4 style={{
                  margin: '0 0 6px 0',
                  fontSize: '15px',
                  fontWeight: '600',
                  color: '#f97316',
                }}>
                  Rapports
                </h4>
                <p style={{
                  margin: 0,
                  fontSize: '12px',
                  color: '#6b7280',
                  lineHeight: '1.4',
                }}>
                  Documents et exports
                </p>
              </button>

              <button
                onClick={() => navigate(`/app/company/${companyId}/verification`)}
                style={{
                  padding: '20px',
                  backgroundColor: 'white',
                  border: '2px solid #8b5cf6',
                  borderRadius: '12px',
                  cursor: 'pointer',
                  transition: 'all 0.3s ease-out',
                  textAlign: 'left',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#ede9fe';
                  e.currentTarget.style.transform = 'translateY(-2px) scale(1.05)';
                  e.currentTarget.style.boxShadow = '0 10px 20px rgba(0, 0, 0, 0.15)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'white';
                  e.currentTarget.style.transform = 'translateY(0) scale(1)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                <div style={{ fontSize: '28px', marginBottom: '12px' }}>✓</div>
                <h4 style={{
                  margin: '0 0 6px 0',
                  fontSize: '15px',
                  fontWeight: '600',
                  color: '#8b5cf6',
                }}>
                  Vérification V1
                </h4>
                <p style={{
                  margin: 0,
                  fontSize: '12px',
                  color: '#6b7280',
                  lineHeight: '1.4',
                }}>
                  Contrôle cohérence
                </p>
              </button>
            </div>
          </div>

          <div style={{
            padding: '24px 32px',
            backgroundColor: '#f9fafb',
            borderRadius: '16px',
            border: '2px solid #e5e7eb',
            marginBottom: '32px',
          }}>
            <h3 style={{
              margin: '0 0 20px 0',
              fontSize: '18px',
              fontWeight: '600',
              color: '#1a1a1a',
            }}>
              Configuration & aide
            </h3>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: '16px',
            }}>
              <button
                onClick={() => navigate(`/app/company/${companyId}/parametres`)}
                style={{
                  padding: '20px',
                  backgroundColor: 'white',
                  border: '2px solid #64748b',
                  borderRadius: '12px',
                  cursor: 'pointer',
                  transition: 'all 0.3s ease-out',
                  textAlign: 'left',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#f1f5f9';
                  e.currentTarget.style.transform = 'translateY(-2px) scale(1.05)';
                  e.currentTarget.style.boxShadow = '0 10px 20px rgba(0, 0, 0, 0.15)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'white';
                  e.currentTarget.style.transform = 'translateY(0) scale(1)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                <div style={{ fontSize: '28px', marginBottom: '12px' }}>⚙️</div>
                <h4 style={{
                  margin: '0 0 6px 0',
                  fontSize: '15px',
                  fontWeight: '600',
                  color: '#64748b',
                }}>
                  Paramètres
                </h4>
                <p style={{
                  margin: 0,
                  fontSize: '12px',
                  color: '#6b7280',
                  lineHeight: '1.4',
                }}>
                  Configuration
                </p>
              </button>

              <button
                onClick={() => navigate(`/app/company/${companyId}/reprise-historique`)}
                style={{
                  padding: '20px',
                  backgroundColor: 'white',
                  border: '2px solid #3b82f6',
                  borderRadius: '12px',
                  cursor: 'pointer',
                  transition: 'all 0.3s ease-out',
                  textAlign: 'left',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#eff6ff';
                  e.currentTarget.style.transform = 'translateY(-2px) scale(1.05)';
                  e.currentTarget.style.boxShadow = '0 10px 20px rgba(0, 0, 0, 0.15)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'white';
                  e.currentTarget.style.transform = 'translateY(0) scale(1)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                <div style={{ fontSize: '28px', marginBottom: '12px' }}>📥</div>
                <h4 style={{
                  margin: '0 0 6px 0',
                  fontSize: '15px',
                  fontWeight: '600',
                  color: '#3b82f6',
                }}>
                  Reprise d'historique
                </h4>
                <p style={{
                  margin: 0,
                  fontSize: '12px',
                  color: '#6b7280',
                  lineHeight: '1.4',
                }}>
                  Soldes d'ouverture
                </p>
              </button>

              <button
                onClick={() => navigate(`/app/company/${companyId}/subscription`)}
                style={{
                  padding: '20px',
                  backgroundColor: 'white',
                  border: '2px solid #f59e0b',
                  borderRadius: '12px',
                  cursor: 'pointer',
                  transition: 'all 0.3s ease-out',
                  textAlign: 'left',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#fffbeb';
                  e.currentTarget.style.transform = 'translateY(-2px) scale(1.05)';
                  e.currentTarget.style.boxShadow = '0 10px 20px rgba(0, 0, 0, 0.15)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'white';
                  e.currentTarget.style.transform = 'translateY(0) scale(1)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                <div style={{ fontSize: '28px', marginBottom: '12px' }}>⭐</div>
                <h4 style={{
                  margin: '0 0 6px 0',
                  fontSize: '15px',
                  fontWeight: '600',
                  color: '#f59e0b',
                }}>
                  Abonnement
                </h4>
                <p style={{
                  margin: 0,
                  fontSize: '12px',
                  color: '#6b7280',
                  lineHeight: '1.4',
                }}>
                  Plans et facturation
                </p>
              </button>

              <button
                onClick={() => navigate(`/app/company/${companyId}/guide`)}
                style={{
                  padding: '20px',
                  backgroundColor: 'white',
                  border: '2px solid #0891b2',
                  borderRadius: '12px',
                  cursor: 'pointer',
                  transition: 'all 0.3s ease-out',
                  textAlign: 'left',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#ecfeff';
                  e.currentTarget.style.transform = 'translateY(-2px) scale(1.05)';
                  e.currentTarget.style.boxShadow = '0 10px 20px rgba(0, 0, 0, 0.15)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'white';
                  e.currentTarget.style.transform = 'translateY(0) scale(1)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                <div style={{ fontSize: '28px', marginBottom: '12px' }}>📖</div>
                <h4 style={{
                  margin: '0 0 6px 0',
                  fontSize: '15px',
                  fontWeight: '600',
                  color: '#0891b2',
                }}>
                  Mode d'utilisation
                </h4>
                <p style={{
                  margin: 0,
                  fontSize: '12px',
                  color: '#6b7280',
                  lineHeight: '1.4',
                }}>
                  Guide de l'application
                </p>
              </button>
            </div>
          </div>
        </main>

        <style>
          {`
            @keyframes pulse {
              0%, 100% { opacity: 0.6; }
              50% { opacity: 1; }
            }
          `}
        </style>
      </div>

      {showFacturesUpsell && (
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
          onClick={() => setShowFacturesUpsell(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: 'white',
              borderRadius: '12px',
              width: '90%',
              maxWidth: '500px',
              boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
            }}
          >
            <div
              style={{
                padding: '20px 24px',
                borderBottom: '1px solid #e5e7eb',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '600', color: '#111827' }}>
                Facturation
              </h2>
              <button
                onClick={() => setShowFacturesUpsell(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '24px',
                  color: '#6b7280',
                  cursor: 'pointer',
                  padding: '0',
                  width: '32px',
                  height: '32px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                ×
              </button>
            </div>

            <div style={{ padding: '40px 24px', textAlign: 'center' }}>
              <div style={{ fontSize: '48px', marginBottom: '16px' }}>🔒</div>
              <h3 style={{ fontSize: '20px', fontWeight: '600', color: '#111827', marginBottom: '12px' }}>
                Module Factures disponible à partir du plan Pro
              </h3>
              <p style={{ fontSize: '14px', color: '#6b7280', marginBottom: '24px', lineHeight: '1.6' }}>
                Le module Factures est disponible sur tous les plans payants. Passez à un plan payant pour y accéder.
              </p>
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                <button
                  onClick={() => setShowFacturesUpsell(false)}
                  style={{
                    padding: '12px 24px',
                    backgroundColor: 'white',
                    color: '#6b7280',
                    border: '1px solid #d1d5db',
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontWeight: '600',
                    cursor: 'pointer',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#f9fafb';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'white';
                  }}
                >
                  Annuler
                </button>
                <button
                  onClick={() => {
                    setShowFacturesUpsell(false);
                    navigate(`/app/company/${companyId}/subscription`);
                  }}
                  style={{
                    padding: '12px 24px',
                    backgroundColor: '#2563eb',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontWeight: '600',
                    cursor: 'pointer',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#1d4ed8';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '#2563eb';
                  }}
                >
                  Voir les plans payants
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <LegalGateModal
        companyId={companyId || ''}
        documentKey="cgu"
        isOpen={showLegalGate}
        onClose={() => {
          setShowLegalGate(false);
          setPendingAction(null);
        }}
        onAccepted={onCGUAccepted}
      />
    </>
  );
}
