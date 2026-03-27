import { useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { HOME_RECENT_LIMIT } from '../constants';
import BackButton from '../components/BackButton';
import KPIGraphs from '../components/KPIGraphs';
import AIAssistant from '../components/AIAssistant';
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

interface RecentItem {
  id: string;
  invoice_date: string;
  description: string;
  amount_incl_vat: number;
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
  const [recentExpenses, setRecentExpenses] = useState<RecentItem[]>([]);
  const [recentRevenues, setRecentRevenues] = useState<RecentItem[]>([]);
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
      loadRecentExpenses();
      setTimeout(() => {
        setSuccessMessage(null);
      }, 4000);
    } else if (success === 'revenue_added') {
      setSuccessMessage('Revenu ajouté avec succès');
      setSearchParams({});
      loadRevenueSummary();
      loadRecentRevenues();
      setTimeout(() => {
        setSuccessMessage(null);
      }, 4000);
    } else if (success === 'expense_updated') {
      setSuccessMessage('Dépense modifiée avec succès');
      setSearchParams({});
      loadExpenseSummary();
      loadRecentExpenses();
      setTimeout(() => {
        setSuccessMessage(null);
      }, 4000);
    } else if (success === 'revenue_updated') {
      setSuccessMessage('Revenu modifié avec succès');
      setSearchParams({});
      loadRevenueSummary();
      loadRecentRevenues();
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

  const loadRecentExpenses = async () => {
    if (!companyId) return;

    const { data: docs } = await supabase
      .from('expense_documents')
      .select('id, invoice_date, total_incl_vat')
      .eq('company_id', companyId)
      .order('invoice_date', { ascending: false })
      .limit(HOME_RECENT_LIMIT);

    if (docs) {
      const { data: lines } = await supabase
        .from('expense_lines')
        .select('document_id, description')
        .in('document_id', docs.map(d => d.id))
        .order('line_order');

      const items = docs.map(doc => {
        const firstLine = lines?.find(l => l.document_id === doc.id);
        const lineCount = lines?.filter(l => l.document_id === doc.id).length || 0;
        return {
          id: doc.id,
          invoice_date: doc.invoice_date,
          description: lineCount > 1 ? `${firstLine?.description || 'Sans description'} (+${lineCount - 1})` : firstLine?.description || 'Sans description',
          amount_incl_vat: doc.total_incl_vat,
        };
      });
      setRecentExpenses(items);
    }
  };

  const loadRecentRevenues = async () => {
    if (!companyId) return;

    const { data: docs } = await supabase
      .from('revenue_documents')
      .select('id, invoice_date, total_incl_vat')
      .eq('company_id', companyId)
      .order('invoice_date', { ascending: false })
      .limit(HOME_RECENT_LIMIT);

    if (docs) {
      const { data: lines } = await supabase
        .from('revenue_lines')
        .select('document_id, description')
        .in('document_id', docs.map(d => d.id))
        .order('line_order');

      const items = docs.map(doc => {
        const firstLine = lines?.find(l => l.document_id === doc.id);
        const lineCount = lines?.filter(l => l.document_id === doc.id).length || 0;
        return {
          id: doc.id,
          invoice_date: doc.invoice_date,
          description: lineCount > 1 ? `${firstLine?.description || 'Sans description'} (+${lineCount - 1})` : firstLine?.description || 'Sans description',
          amount_incl_vat: doc.total_incl_vat,
        };
      });
      setRecentRevenues(items);
    }
  };

  useEffect(() => {
    if (companyId) {
      loadExpenseSummary();
      loadRevenueSummary();
      loadRecentExpenses();
      loadRecentRevenues();
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
          .dashboard-cards { grid-template-columns: 1fr !important; }
          .quick-actions-grid { grid-template-columns: 1fr !important; }
          .modules-grid { grid-template-columns: repeat(2, 1fr) !important; }
          .kpi-cards { grid-template-columns: 1fr !important; }
        }
        @media (min-width: 768px) and (max-width: 1023px) {
          .dashboard-cards { grid-template-columns: 1fr !important; }
          .quick-actions-grid { grid-template-columns: 1fr !important; }
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
            padding: '32px',
            backgroundColor: 'white',
            borderRadius: '16px',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
            border: '2px solid #e5e7eb',
            marginBottom: '32px',
            textAlign: 'center',
            animation: 'fadeInUp 0.3s ease-out',
          }}>
            <h3 style={{
              margin: '0 0 20px 0',
              fontSize: '22px',
              fontWeight: '800',
              color: '#1f2937',
              textTransform: 'uppercase',
              letterSpacing: '1.2px',
            }}>
              Résultat actuel
            </h3>
            <p style={{
              margin: '0 0 8px 0',
              fontSize: '48px',
              fontWeight: '800',
              color: revenueSummary.totalTTC - expenseSummary.totalTTC > 0
                ? '#16a34a'
                : revenueSummary.totalTTC - expenseSummary.totalTTC < 0
                ? '#dc2626'
                : '#6b7280',
            }}>
              {new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(revenueSummary.totalTTC - expenseSummary.totalTTC)}
            </p>
            <p style={{
              margin: '0 0 32px 0',
              fontSize: '13px',
              color: '#9ca3af',
            }}>
              Revenus - Dépenses (période en cours)
            </p>

            <div className="kpi-cards" style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '20px',
              maxWidth: '600px',
              margin: '0 auto',
              animation: 'fadeIn 0.5s ease-out 0.15s backwards',
            }}>
              <div style={{
                padding: '16px',
                backgroundColor: '#f0fdf4',
                borderRadius: '12px',
                border: '1px solid #d1fae5',
              }}>
                <p style={{
                  margin: '0 0 8px 0',
                  fontSize: '11px',
                  fontWeight: '500',
                  color: '#14532d',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                }}>
                  Revenus
                </p>
                <p style={{
                  margin: 0,
                  fontSize: '20px',
                  fontWeight: '700',
                  color: '#16a34a',
                }}>
                  {new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(revenueSummary.totalTTC)}
                </p>
              </div>

              <div style={{
                padding: '16px',
                backgroundColor: '#fef2f2',
                borderRadius: '12px',
                border: '1px solid #fee2e2',
              }}>
                <p style={{
                  margin: '0 0 8px 0',
                  fontSize: '11px',
                  fontWeight: '500',
                  color: '#7f1d1d',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                }}>
                  Dépenses
                </p>
                <p style={{
                  margin: 0,
                  fontSize: '20px',
                  fontWeight: '700',
                  color: '#dc2626',
                }}>
                  {new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(expenseSummary.totalTTC)}
                </p>
              </div>

              <div style={{
                padding: '16px',
                backgroundColor: '#fff7ed',
                borderRadius: '12px',
                border: '1px solid #fed7aa',
              }}>
                <p style={{
                  margin: '0 0 8px 0',
                  fontSize: '11px',
                  fontWeight: '500',
                  color: '#7c2d12',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                }}>
                  TVA
                </p>
                <p style={{
                  margin: 0,
                  fontSize: '20px',
                  fontWeight: '700',
                  color: '#ea580c',
                }}>
                  {new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(revenueSummary.totalTVA + expenseSummary.totalTVA)}
                </p>
              </div>
            </div>
          </div>

          <div style={{
            textAlign: 'center',
            marginBottom: '32px',
          }}>
            <button
              onClick={() => navigate(`/app/company/${companyId}/subscription`)}
              style={{
                padding: '14px 32px',
                fontSize: '15px',
                fontWeight: '600',
                color: 'white',
                backgroundColor: '#2563eb',
                border: 'none',
                borderRadius: '10px',
                cursor: 'pointer',
                transition: 'all 0.3s ease',
                boxShadow: '0 4px 12px rgba(37, 99, 235, 0.3)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#1d4ed8';
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 6px 20px rgba(37, 99, 235, 0.4)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#2563eb';
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(37, 99, 235, 0.3)';
              }}
            >
              Voir les offres
            </button>
          </div>

          <div className="dashboard-cards" style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: '24px',
            marginBottom: '32px',
          }}>
            <div style={{
              padding: '28px',
              backgroundColor: 'white',
              borderRadius: '16px',
              border: '2px solid #fee2e2',
              boxShadow: '0 2px 4px rgba(0, 0, 0, 0.05)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
                <div style={{ fontSize: '36px' }}>📤</div>
                <h3 style={{
                  margin: 0,
                  fontSize: '22px',
                  fontWeight: '700',
                  color: '#dc2626',
                }}>
                  Dépenses
                </h3>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', marginBottom: '20px' }}>
                <div style={{
                  padding: '14px',
                  backgroundColor: '#fef2f2',
                  borderRadius: '10px',
                }}>
                  <p style={{
                    margin: '0 0 4px 0',
                    fontSize: '11px',
                    fontWeight: '600',
                    color: '#991b1b',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                  }}>
                    Total TTC
                  </p>
                  <p style={{
                    margin: 0,
                    fontSize: '20px',
                    fontWeight: '700',
                    color: '#dc2626',
                  }}>
                    {new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(expenseSummary.totalTTC)}
                  </p>
                </div>

                <div style={{
                  padding: '14px',
                  backgroundColor: '#fef2f2',
                  borderRadius: '10px',
                }}>
                  <p style={{
                    margin: '0 0 4px 0',
                    fontSize: '11px',
                    fontWeight: '600',
                    color: '#991b1b',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                  }}>
                    Nombre
                  </p>
                  <p style={{
                    margin: 0,
                    fontSize: '20px',
                    fontWeight: '700',
                    color: '#dc2626',
                  }}>
                    {expenseSummary.count}
                  </p>
                </div>

                {expenseSummary.unpaidAmount > 0 && (
                  <div style={{
                    padding: '14px',
                    backgroundColor: '#fef3c7',
                    borderRadius: '10px',
                    gridColumn: '1 / -1',
                  }}>
                    <p style={{
                      margin: '0 0 4px 0',
                      fontSize: '11px',
                      fontWeight: '600',
                      color: '#92400e',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                    }}>
                      Non payé
                    </p>
                    <p style={{
                      margin: 0,
                      fontSize: '18px',
                      fontWeight: '700',
                      color: '#f59e0b',
                    }}>
                      {new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(expenseSummary.unpaidAmount)}
                    </p>
                  </div>
                )}
              </div>

              {recentExpenses.length > 0 && (
                <div style={{ marginBottom: '20px' }}>
                  <p style={{
                    margin: '0 0 12px 0',
                    fontSize: '13px',
                    fontWeight: '600',
                    color: '#6b7280',
                  }}>
                    Dernières dépenses
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {recentExpenses.map((item) => (
                      <div key={item.id} style={{
                        padding: '10px 12px',
                        backgroundColor: '#f9fafb',
                        borderRadius: '8px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: '12px',
                      }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{
                            margin: '0 0 2px 0',
                            fontSize: '13px',
                            fontWeight: '500',
                            color: '#1f2937',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}>
                            {item.description}
                          </p>
                          <p style={{
                            margin: 0,
                            fontSize: '11px',
                            color: '#6b7280',
                          }}>
                            {new Date(item.invoice_date).toLocaleDateString('fr-FR')}
                          </p>
                        </div>
                        <p style={{
                          margin: 0,
                          fontSize: '14px',
                          fontWeight: '600',
                          color: '#dc2626',
                          whiteSpace: 'nowrap',
                        }}>
                          {new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(item.amount_incl_vat)}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <button
                  onClick={() => navigate(`/app/company/${companyId}/expenses`)}
                  style={{
                    padding: '12px 20px',
                    fontSize: '14px',
                    fontWeight: '600',
                    color: 'white',
                    backgroundColor: '#dc2626',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#b91c1c'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#dc2626'}
                >
                  Gérer les dépenses
                </button>
                <button
                  onClick={() => handleProtectedAction(() => navigate(`/app/company/${companyId}/expenses/new`))}
                  style={{
                    padding: '12px 20px',
                    fontSize: '14px',
                    fontWeight: '600',
                    color: '#dc2626',
                    backgroundColor: 'white',
                    border: '2px solid #dc2626',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#fef2f2'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'white'}
                >
                  Ajouter une dépense
                </button>
              </div>
            </div>

            <div style={{
              padding: '28px',
              backgroundColor: 'white',
              borderRadius: '16px',
              border: '2px solid #d1fae5',
              boxShadow: '0 2px 4px rgba(0, 0, 0, 0.05)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
                <div style={{ fontSize: '36px' }}>📥</div>
                <h3 style={{
                  margin: 0,
                  fontSize: '22px',
                  fontWeight: '700',
                  color: '#16a34a',
                }}>
                  Revenus
                </h3>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', marginBottom: '20px' }}>
                <div style={{
                  padding: '14px',
                  backgroundColor: '#f0fdf4',
                  borderRadius: '10px',
                }}>
                  <p style={{
                    margin: '0 0 4px 0',
                    fontSize: '11px',
                    fontWeight: '600',
                    color: '#15803d',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                  }}>
                    Total TTC
                  </p>
                  <p style={{
                    margin: 0,
                    fontSize: '20px',
                    fontWeight: '700',
                    color: '#16a34a',
                  }}>
                    {new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(revenueSummary.totalTTC)}
                  </p>
                </div>

                <div style={{
                  padding: '14px',
                  backgroundColor: '#f0fdf4',
                  borderRadius: '10px',
                }}>
                  <p style={{
                    margin: '0 0 4px 0',
                    fontSize: '11px',
                    fontWeight: '600',
                    color: '#15803d',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                  }}>
                    Nombre
                  </p>
                  <p style={{
                    margin: 0,
                    fontSize: '20px',
                    fontWeight: '700',
                    color: '#16a34a',
                  }}>
                    {revenueSummary.count}
                  </p>
                </div>
              </div>

              {recentRevenues.length > 0 && (
                <div style={{ marginBottom: '20px' }}>
                  <p style={{
                    margin: '0 0 12px 0',
                    fontSize: '13px',
                    fontWeight: '600',
                    color: '#6b7280',
                  }}>
                    Derniers revenus
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {recentRevenues.map((item) => (
                      <div key={item.id} style={{
                        padding: '10px 12px',
                        backgroundColor: '#f9fafb',
                        borderRadius: '8px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: '12px',
                      }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{
                            margin: '0 0 2px 0',
                            fontSize: '13px',
                            fontWeight: '500',
                            color: '#1f2937',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}>
                            {item.description}
                          </p>
                          <p style={{
                            margin: 0,
                            fontSize: '11px',
                            color: '#6b7280',
                          }}>
                            {new Date(item.invoice_date).toLocaleDateString('fr-FR')}
                          </p>
                        </div>
                        <p style={{
                          margin: 0,
                          fontSize: '14px',
                          fontWeight: '600',
                          color: '#16a34a',
                          whiteSpace: 'nowrap',
                        }}>
                          {new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(item.amount_incl_vat)}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <button
                  onClick={() => navigate(`/app/company/${companyId}/revenues`)}
                  style={{
                    padding: '12px 20px',
                    fontSize: '14px',
                    fontWeight: '600',
                    color: 'white',
                    backgroundColor: '#16a34a',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#15803d'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#16a34a'}
                >
                  Gérer les revenus
                </button>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    onClick={() => handleProtectedAction(() => navigate(`/app/company/${companyId}/revenues/new`))}
                    style={{
                      padding: '12px 20px',
                      fontSize: '14px',
                      fontWeight: '600',
                      color: '#16a34a',
                      backgroundColor: 'white',
                      border: '2px solid #16a34a',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      flex: 1,
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f0fdf4'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'white'}
                  >
                    Ajouter un revenu
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
                      padding: '12px 20px',
                      fontSize: '14px',
                      fontWeight: '600',
                      color: '#16a34a',
                      backgroundColor: 'white',
                      border: '2px solid #16a34a',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      flex: 1,
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f0fdf4'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'white'}
                  >
                    Créer une facture
                  </button>
                </div>
              </div>
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
              Actions rapides
            </h3>

            <div className="quick-actions-grid" style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: '16px',
            }}>
              <button
                onClick={() => navigate(`/app/company/${companyId}/ai-scan`)}
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
                <div style={{ fontSize: '32px', marginBottom: '12px' }}>🧠</div>
                <h4 style={{
                  margin: '0 0 8px 0',
                  fontSize: '16px',
                  fontWeight: '600',
                  color: '#7c3aed',
                }}>
                  Scanner un justificatif (IA)
                </h4>
                <p style={{
                  margin: 0,
                  fontSize: '13px',
                  color: '#6b7280',
                  lineHeight: '1.4',
                }}>
                  Extraire automatiquement les informations
                </p>
              </button>

              <button
                onClick={() => {
                  handleProtectedAction(() => {
                    if (canUse('facturation')) {
                      navigate(`/app/company/${companyId}/factures`);
                    } else {
                      setShowFacturesUpsell(true);
                    }
                  });
                }}
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
                  e.currentTarget.style.backgroundColor = '#cffafe';
                  e.currentTarget.style.transform = 'translateY(-2px) scale(1.05)';
                  e.currentTarget.style.boxShadow = '0 10px 20px rgba(0, 0, 0, 0.15)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'white';
                  e.currentTarget.style.transform = 'translateY(0) scale(1)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                <div style={{ fontSize: '32px', marginBottom: '12px' }}>📄</div>
                <h4 style={{
                  margin: '0 0 8px 0',
                  fontSize: '16px',
                  fontWeight: '600',
                  color: '#0891b2',
                }}>
                  Créer des factures
                  <span style={{
                    marginLeft: '8px',
                    padding: '2px 6px',
                    backgroundColor: '#0891b2',
                    color: 'white',
                    fontSize: '10px',
                    borderRadius: '4px',
                    fontWeight: '600',
                  }}>
                    PRO
                  </span>
                </h4>
                <p style={{
                  margin: 0,
                  fontSize: '13px',
                  color: '#6b7280',
                  lineHeight: '1.4',
                }}>
                  Documents commerciaux PDF
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

          <KPIGraphs companyId={companyId!} />

          <AIAssistant
            context="synthese"
            data={{
              netResult: revenueSummary.totalHT - expenseSummary.totalHT,
              revenues: revenueSummary.totalHT,
              expenses: expenseSummary.totalHT,
            }}
            companyId={companyId!}
          />

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
            @keyframes fadeInUp {
              from {
                opacity: 0;
                transform: translateY(12px);
              }
              to {
                opacity: 1;
                transform: translateY(0);
              }
            }
            @keyframes fadeIn {
              from {
                opacity: 0;
              }
              to {
                opacity: 1;
              }
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
