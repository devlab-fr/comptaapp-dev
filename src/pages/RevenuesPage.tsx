import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import BackButton from '../components/BackButton';
import { StatusBadges } from '../components/StatusBadges';
import { ActionsDropdown } from '../components/ActionsDropdown';
import { RevenueMobileCard } from '../components/RevenueMobileCard';

interface RevenueDocument {
  id: string;
  invoice_date: string;
  total_excl_vat: number;
  total_vat: number;
  total_incl_vat: number;
  accounting_status: string;
  payment_status: string;
  description?: string;
  category_name?: string;
  category_id?: string;
  source_type?: string;
  source_invoice_id?: string;
}

interface Category {
  id: string;
  name: string;
}

export default function RevenuesPage() {
  const navigate = useNavigate();
  useAuth();
  const { companyId } = useParams<{ companyId: string }>();

  const [revenues, setRevenues] = useState<RevenueDocument[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteModal, setDeleteModal] = useState<{ show: boolean; id: string | null }>({ show: false, id: null });
  const [showFilters, setShowFilters] = useState(false);
  const [isDesktop, setIsDesktop] = useState<boolean>(window.innerWidth >= 1024);

  const [selectedYear, setSelectedYear] = useState<string>('all');
  const [selectedMonth, setSelectedMonth] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const [currentPage, setCurrentPage] = useState<number>(1);
  const [totalCount, setTotalCount] = useState<number>(0);
  const pageSize = 10;

  useEffect(() => {
    if (companyId) {
      loadData();
    }
  }, [companyId]);

  useEffect(() => {
    if (companyId && !loading) {
      setCurrentPage(1);
      loadRevenues();
    }
  }, [selectedYear, selectedMonth, selectedCategory, searchQuery]);

  useEffect(() => {
    if (companyId && !loading) {
      loadRevenues();
    }
  }, [currentPage]);

  useEffect(() => {
    const onResize = () => setIsDesktop(window.innerWidth >= 1024);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const loadData = async () => {
    setLoading(true);
    await Promise.all([loadCategories(), loadYears()]);
    await loadRevenues();
    setLoading(false);
  };

  const loadCategories = async () => {
    const { data } = await supabase
      .from('revenue_categories')
      .select('id, name')
      .eq('is_active', true)
      .order('sort_order');
    if (data) setCategories(data);
  };

  const loadYears = async () => {
    const { data } = await supabase
      .from('revenue_documents')
      .select('invoice_date')
      .eq('company_id', companyId);

    if (data && data.length > 0) {
      const years = data.map((r) => new Date(r.invoice_date).getFullYear());
      const uniqueYears = Array.from(new Set(years)).sort((a, b) => b - a);
      setAvailableYears(uniqueYears);

      if (selectedYear === 'all' && uniqueYears.length > 0) {
        setSelectedYear(uniqueYears[0].toString());
      }
    } else {
      setAvailableYears([]);
      setSelectedYear('all');
    }
  };

  const loadRevenues = async () => {
    if (!companyId) return;

    let query = supabase
      .from('revenue_documents')
      .select('*', { count: 'exact' })
      .eq('company_id', companyId);

    if (selectedYear !== 'all') {
      const year = parseInt(selectedYear);
      const startDate = selectedMonth === 'all'
        ? `${year}-01-01`
        : `${year}-${selectedMonth.padStart(2, '0')}-01`;

      const endDate = selectedMonth === 'all'
        ? `${year}-12-31`
        : new Date(year, parseInt(selectedMonth), 0).toISOString().split('T')[0];

      query = query.gte('invoice_date', startDate).lte('invoice_date', endDate);
    }

    query = query.order('invoice_date', { ascending: false });

    const countResult = await query;
    const totalRecords = countResult.count || 0;
    setTotalCount(totalRecords);

    const from = (currentPage - 1) * pageSize;
    const to = from + pageSize - 1;

    query = query.range(from, to);

    const { data: docs } = await query;

    if (docs) {
      const { data: lines } = await supabase
        .from('revenue_lines')
        .select('document_id, description, category_id, revenue_categories(id, name)')
        .in('document_id', docs.map(d => d.id))
        .order('line_order');

      // Charger les numéros de factures pour les revenus issus de factures
      const invoiceIds = docs
        .filter(d => d.source_type === 'invoice' && d.source_invoice_id)
        .map(d => d.source_invoice_id);

      let invoicesMap = new Map();
      if (invoiceIds.length > 0) {
        const { data: invoices } = await supabase
          .from('factures')
          .select('id, numero_facture')
          .in('id', invoiceIds);

        if (invoices) {
          invoices.forEach(inv => invoicesMap.set(inv.id, inv.numero_facture));
        }
      }

      const enriched = docs.map(doc => {
        const docLines = lines?.filter(l => l.document_id === doc.id) || [];
        const firstLine = docLines[0];
        const lineCount = docLines.length;

        let description = 'Sans description';

        // Si le revenu provient d'une facture, utiliser le numéro de facture comme libellé
        if (doc.source_type === 'invoice' && doc.source_invoice_id) {
          const numeroFacture = invoicesMap.get(doc.source_invoice_id);
          if (numeroFacture) {
            description = numeroFacture;
          }
        } else if (firstLine && firstLine.description) {
          // Sinon, utiliser la description de la première ligne
          description = lineCount > 1
            ? `${firstLine.description} (+${lineCount - 1})`
            : firstLine.description;
        }

        let category_name = '';
        let category_id = '';

        // Tenter de résoudre la catégorie réelle depuis les lignes
        if (firstLine && firstLine.category_id) {
          category_name = (firstLine as any).revenue_categories?.name || '';
          category_id = firstLine.category_id;
        }

        // Fallback "Prestations de services" uniquement pour les revenus issus de factures sans catégorie résolue
        if (!category_id && doc.source_type === 'invoice' && doc.source_invoice_id) {
          const defaultCat = categories.find((c) => c.name === 'Prestations de services');
          if (defaultCat) {
            category_name = defaultCat.name;
            category_id = defaultCat.id;
          }
        }

        return {
          id: doc.id,
          invoice_date: doc.invoice_date,
          total_excl_vat: doc.total_excl_vat,
          total_vat: doc.total_vat,
          total_incl_vat: doc.total_incl_vat,
          accounting_status: doc.accounting_status,
          payment_status: doc.payment_status,
          description,
          category_name,
          category_id,
          source_type: doc.source_type,
          source_invoice_id: doc.source_invoice_id,
        };
      });

      let filtered = enriched;

      if (selectedCategory !== 'all') {
        filtered = filtered.filter(r => r.category_id === selectedCategory);
      }

      if (searchQuery) {
        filtered = filtered.filter(r =>
          r.description?.toLowerCase().includes(searchQuery.toLowerCase())
        );
      }

      setRevenues(filtered);
    }
  };

  const handleDelete = async () => {
    if (!deleteModal.id) return;

    const { error } = await supabase.from('revenue_documents').delete().eq('id', deleteModal.id);

    if (!error) {
      setDeleteModal({ show: false, id: null });
      loadRevenues();
    } else {
      alert('Erreur lors de la suppression');
    }
  };

  const handleToggleValidation = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === 'validated' ? 'draft' : 'validated';
    const { error } = await supabase
      .from('revenue_documents')
      .update({ accounting_status: newStatus })
      .eq('id', id);

    if (!error) {
      loadRevenues();
    } else {
      alert('Erreur lors de la mise à jour du statut');
    }
  };

  const handleTogglePaid = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === 'paid' ? 'unpaid' : 'paid';
    const { error } = await supabase
      .from('revenue_documents')
      .update({ payment_status: newStatus })
      .eq('id', id);

    if (!error) {
      loadRevenues();
    } else {
      alert('Erreur lors de la mise à jour du statut de paiement');
    }
  };

  const resetFilters = () => {
    setSelectedYear('all');
    setSelectedMonth('all');
    setSelectedCategory('all');
    setSearchQuery('');
    setCurrentPage(1);
  };

  const totalPages = Math.ceil(totalCount / pageSize);

  return (
    <>
      <style>{`
        @media (max-width: 1023px) {
          .desktop-only { display: none !important; }
          .mobile-filters { display: block; }
        }
        @media (min-width: 1024px) {
          .mobile-only { display: none !important; }
          .mobile-filters { display: none; }
        }
      `}</style>

      <div style={{ backgroundColor: '#f8f9fa', minHeight: '100%' }}>
        <main style={{ maxWidth: '1400px', margin: '0 auto', padding: '32px 24px' }}>
          <BackButton to={`/app/company/${companyId}`} />

          <div style={{ marginBottom: '24px' }}>
            <h2 style={{ margin: '0 0 8px 0', fontSize: '28px', fontWeight: '700', color: '#1a1a1a' }}>
              Revenus
            </h2>
            <p style={{ margin: 0, color: '#6b7280', fontSize: '14px' }}>
              Gérez tous vos revenus avec filtres et recherche
            </p>
          </div>

          <div
            style={{
              padding: '24px',
              backgroundColor: 'white',
              borderRadius: '12px',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
              marginBottom: '24px',
            }}
          >
            <div className="mobile-filters" style={{ marginBottom: '16px' }}>
              <button
                onClick={() => setShowFilters(!showFilters)}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  fontSize: '14px',
                  fontWeight: '600',
                  color: '#1f2937',
                  backgroundColor: '#f9fafb',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span>Filtres</span>
                <span>{showFilters ? '▲' : '▼'}</span>
              </button>
            </div>

            <div style={{ display: showFilters || isDesktop ? 'block' : 'none' }}>
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '16px' }}>
                <div style={{ flex: '1 1 150px' }}>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '6px' }}>
                    Année
                  </label>
                  <select
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      fontSize: '14px',
                      border: '1px solid #d1d5db',
                      borderRadius: '8px',
                      cursor: 'pointer',
                    }}
                  >
                    <option value="all">Toutes</option>
                    {availableYears.map((year) => (
                      <option key={year} value={year}>{year}</option>
                    ))}
                  </select>
                </div>

                <div style={{ flex: '1 1 150px' }}>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '6px' }}>
                    Période
                  </label>
                  <select
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                    disabled={selectedYear === 'all'}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      fontSize: '14px',
                      border: '1px solid #d1d5db',
                      borderRadius: '8px',
                      cursor: selectedYear === 'all' ? 'not-allowed' : 'pointer',
                      backgroundColor: selectedYear === 'all' ? '#f3f4f6' : 'white',
                      opacity: selectedYear === 'all' ? 0.6 : 1,
                    }}
                  >
                    <option value="all">Année complète</option>
                    <option value="1">Janvier</option>
                    <option value="2">Février</option>
                    <option value="3">Mars</option>
                    <option value="4">Avril</option>
                    <option value="5">Mai</option>
                    <option value="6">Juin</option>
                    <option value="7">Juillet</option>
                    <option value="8">Août</option>
                    <option value="9">Septembre</option>
                    <option value="10">Octobre</option>
                    <option value="11">Novembre</option>
                    <option value="12">Décembre</option>
                  </select>
                </div>

                <div style={{ flex: '1 1 200px' }}>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '6px' }}>
                    Catégorie
                  </label>
                  <select
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      fontSize: '14px',
                      border: '1px solid #d1d5db',
                      borderRadius: '8px',
                      cursor: 'pointer',
                    }}
                  >
                    <option value="all">Toutes les catégories</option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>{cat.name}</option>
                    ))}
                  </select>
                </div>

                <div style={{ flex: '1 1 250px' }}>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '6px' }}>
                    Recherche
                  </label>
                  <input
                    type="text"
                    placeholder="Rechercher par libellé..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      fontSize: '14px',
                      border: '1px solid #d1d5db',
                      borderRadius: '8px',
                    }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'space-between', flexWrap: 'wrap' }}>
                <button
                  onClick={resetFilters}
                  style={{
                    padding: '10px 16px',
                    fontSize: '14px',
                    fontWeight: '600',
                    color: '#6b7280',
                    backgroundColor: 'white',
                    border: '1px solid #d1d5db',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f9fafb'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'white'}
                >
                  Réinitialiser
                </button>

                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                  <button
                    onClick={() => navigate(`/app/company/${companyId}/ai-scan?type=revenue`)}
                    style={{
                      padding: '10px 16px',
                      fontSize: '14px',
                      fontWeight: '600',
                      color: '#3b82f6',
                      backgroundColor: 'white',
                      border: '1px solid #3b82f6',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#eff6ff'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'white'}
                  >
                    Scanner (IA)
                  </button>
                  <button
                    onClick={() => navigate(`/app/company/${companyId}/revenues/new`)}
                    style={{
                      padding: '10px 16px',
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
                    Ajouter un revenu
                  </button>
                </div>
              </div>
            </div>
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '48px', color: '#6b7280' }}>
              Chargement...
            </div>
          ) : revenues.length === 0 ? (
            <div
              style={{
                padding: '48px',
                backgroundColor: 'white',
                borderRadius: '12px',
                boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: '48px', marginBottom: '16px' }}>📂</div>
              <h3 style={{ margin: '0 0 8px 0', fontSize: '18px', fontWeight: '600', color: '#1f2937' }}>
                Aucun revenu trouvé
              </h3>
              <p style={{ margin: '0 0 24px 0', color: '#6b7280', fontSize: '14px' }}>
                Commencez par ajouter votre premier revenu ou scannez un justificatif.
              </p>
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
                <button
                  onClick={() => navigate(`/app/company/${companyId}/ai-scan?type=revenue`)}
                  style={{
                    padding: '10px 16px',
                    fontSize: '14px',
                    fontWeight: '600',
                    color: '#3b82f6',
                    backgroundColor: 'white',
                    border: '1px solid #3b82f6',
                    borderRadius: '8px',
                    cursor: 'pointer',
                  }}
                >
                  Scanner (IA)
                </button>
                <button
                  onClick={() => navigate(`/app/company/${companyId}/revenues/new`)}
                  style={{
                    padding: '10px 16px',
                    fontSize: '14px',
                    fontWeight: '600',
                    color: 'white',
                    backgroundColor: '#16a34a',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                  }}
                >
                  Ajouter un revenu
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="desktop-only">
                <div
                  style={{
                    backgroundColor: 'white',
                    borderRadius: '12px',
                    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
                    overflow: 'hidden',
                  }}
                >
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '600px' }}>
                      <thead>
                        <tr style={{ backgroundColor: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
                          <th style={{ padding: '14px 16px', textAlign: 'left', fontSize: '13px', fontWeight: '600', color: '#374151', whiteSpace: 'nowrap' }}>
                            Date
                          </th>
                          <th style={{ padding: '14px 16px', textAlign: 'left', fontSize: '13px', fontWeight: '600', color: '#374151' }}>
                            Libellé
                          </th>
                          <th style={{ padding: '14px 16px', textAlign: 'left', fontSize: '13px', fontWeight: '600', color: '#374151' }}>
                            Catégorie
                          </th>
                          <th style={{ padding: '14px 16px', textAlign: 'right', fontSize: '13px', fontWeight: '600', color: '#374151', whiteSpace: 'nowrap' }}>
                            HT
                          </th>
                          <th style={{ padding: '14px 16px', textAlign: 'right', fontSize: '13px', fontWeight: '600', color: '#374151', whiteSpace: 'nowrap' }}>
                            TVA
                          </th>
                          <th style={{ padding: '14px 16px', textAlign: 'right', fontSize: '13px', fontWeight: '600', color: '#374151', whiteSpace: 'nowrap' }}>
                            TTC
                          </th>
                          <th style={{ padding: '14px 16px', textAlign: 'center', fontSize: '13px', fontWeight: '600', color: '#374151' }}>
                            Statut
                          </th>
                          <th style={{ padding: '14px 16px', textAlign: 'center', fontSize: '13px', fontWeight: '600', color: '#374151', whiteSpace: 'nowrap' }}>
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {revenues.map((rev) => (
                          <tr key={rev.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                            <td style={{ padding: '14px 16px', fontSize: '14px', color: '#1f2937', whiteSpace: 'nowrap' }}>
                              {new Date(rev.invoice_date).toLocaleDateString('fr-FR')}
                            </td>
                            <td style={{ padding: '14px 16px', fontSize: '14px', color: '#1f2937', maxWidth: '300px' }}>
                              <div style={{ fontWeight: '500' }}>{rev.description || 'Sans libellé'}</div>
                            </td>
                            <td style={{ padding: '14px 16px', fontSize: '14px', color: '#1f2937' }}>
                              <div style={{ fontWeight: '500' }}>
                                {rev.category_name || (rev.source_type === 'invoice' ? 'Prestations de services' : '-')}
                              </div>
                            </td>
                            <td style={{ padding: '14px 16px', textAlign: 'right', fontSize: '14px', color: '#1f2937', whiteSpace: 'nowrap' }}>
                              {parseFloat(rev.total_excl_vat.toString()).toFixed(2)} €
                            </td>
                            <td style={{ padding: '14px 16px', textAlign: 'right', fontSize: '14px', color: '#6b7280', whiteSpace: 'nowrap' }}>
                              {parseFloat(rev.total_vat.toString()).toFixed(2)} €
                            </td>
                            <td style={{ padding: '14px 16px', textAlign: 'right', fontSize: '15px', fontWeight: '600', color: '#1f2937', whiteSpace: 'nowrap' }}>
                              {parseFloat(rev.total_incl_vat.toString()).toFixed(2)} €
                            </td>
                            <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                              <StatusBadges
                                accountingStatus={rev.accounting_status}
                                paymentStatus={rev.payment_status}
                              />
                            </td>
                            <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                              <ActionsDropdown
                                onView={() => navigate(`/app/company/${companyId}/revenues/${rev.id}`)}
                                onEdit={rev.source_type !== 'invoice' ? () => navigate(`/app/company/${companyId}/revenues/${rev.id}/edit`) : undefined}
                                onDelete={rev.source_type !== 'invoice' ? () => setDeleteModal({ show: true, id: rev.id }) : undefined}
                                onToggleValidation={() => handleToggleValidation(rev.id, rev.accounting_status)}
                                onTogglePaid={() => handleTogglePaid(rev.id, rev.payment_status)}
                                accountingStatus={rev.accounting_status}
                                paymentStatus={rev.payment_status}
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {totalPages > 1 && (
                  <div style={{
                    marginTop: '24px',
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    gap: '16px',
                  }}>
                    <button
                      onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                      disabled={currentPage === 1}
                      style={{
                        padding: '8px 16px',
                        fontSize: '14px',
                        fontWeight: '600',
                        color: currentPage === 1 ? '#9ca3af' : '#374151',
                        backgroundColor: 'white',
                        border: '1px solid #d1d5db',
                        borderRadius: '8px',
                        cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                        transition: 'all 0.2s',
                      }}
                    >
                      Précédent
                    </button>
                    <span style={{ color: '#6b7280', fontSize: '14px', fontWeight: '500' }}>
                      Page {currentPage} / {totalPages}
                    </span>
                    <button
                      onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                      disabled={currentPage === totalPages}
                      style={{
                        padding: '8px 16px',
                        fontSize: '14px',
                        fontWeight: '600',
                        color: currentPage === totalPages ? '#9ca3af' : '#374151',
                        backgroundColor: 'white',
                        border: '1px solid #d1d5db',
                        borderRadius: '8px',
                        cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                        transition: 'all 0.2s',
                      }}
                    >
                      Suivant
                    </button>
                  </div>
                )}
              </div>

              <div className="mobile-only">
                {revenues.map((rev) => (
                  <RevenueMobileCard
                    key={rev.id}
                    revenue={{
                      ...rev,
                      amount_excl_vat: rev.total_excl_vat,
                      vat_amount: rev.total_vat,
                      amount_incl_vat: rev.total_incl_vat,
                    }}
                    onView={(id) => navigate(`/app/company/${companyId}/revenues/${id}`)}
                    onEdit={rev.source_type !== 'invoice' ? (id) => navigate(`/app/company/${companyId}/revenues/${id}/edit`) : undefined}
                    onDelete={rev.source_type !== 'invoice' ? (id) => setDeleteModal({ show: true, id }) : undefined}
                    onToggleValidation={(id) => handleToggleValidation(id, rev.accounting_status)}
                    onTogglePaid={(id) => handleTogglePaid(id, rev.payment_status)}
                  />
                ))}

                {totalPages > 1 && (
                  <div style={{
                    marginTop: '24px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '12px',
                  }}>
                    <span style={{ color: '#6b7280', fontSize: '14px', fontWeight: '500' }}>
                      Page {currentPage} / {totalPages}
                    </span>
                    <div style={{ display: 'flex', gap: '12px' }}>
                      <button
                        onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                        disabled={currentPage === 1}
                        style={{
                          padding: '8px 16px',
                          fontSize: '14px',
                          fontWeight: '600',
                          color: currentPage === 1 ? '#9ca3af' : '#374151',
                          backgroundColor: 'white',
                          border: '1px solid #d1d5db',
                          borderRadius: '8px',
                          cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                        }}
                      >
                        Précédent
                      </button>
                      <button
                        onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                        disabled={currentPage === totalPages}
                        style={{
                          padding: '8px 16px',
                          fontSize: '14px',
                          fontWeight: '600',
                          color: currentPage === totalPages ? '#9ca3af' : '#374151',
                          backgroundColor: 'white',
                          border: '1px solid #d1d5db',
                          borderRadius: '8px',
                          cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                        }}
                      >
                        Suivant
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </main>

        {deleteModal.show && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 50,
              padding: '16px',
            }}
            onClick={() => setDeleteModal({ show: false, id: null })}
          >
            <div
              style={{
                backgroundColor: 'white',
                borderRadius: '12px',
                padding: '24px',
                maxWidth: '400px',
                width: '100%',
                boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 style={{ margin: '0 0 12px 0', fontSize: '18px', fontWeight: '600', color: '#1f2937' }}>
                Confirmer la suppression
              </h3>
              <p style={{ margin: '0 0 24px 0', color: '#6b7280', fontSize: '14px' }}>
                Êtes-vous sûr de vouloir supprimer ce revenu ? Cette action est irréversible.
              </p>
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button
                  onClick={() => setDeleteModal({ show: false, id: null })}
                  style={{
                    padding: '8px 16px',
                    fontSize: '14px',
                    fontWeight: '600',
                    color: '#6b7280',
                    backgroundColor: 'white',
                    border: '1px solid #d1d5db',
                    borderRadius: '8px',
                    cursor: 'pointer',
                  }}
                >
                  Annuler
                </button>
                <button
                  onClick={handleDelete}
                  style={{
                    padding: '8px 16px',
                    fontSize: '14px',
                    fontWeight: '600',
                    color: 'white',
                    backgroundColor: '#dc2626',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                  }}
                >
                  Supprimer
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
