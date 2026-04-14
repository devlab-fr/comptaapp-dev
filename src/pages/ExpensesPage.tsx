import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import BackButton from '../components/BackButton';
import { StatusBadges } from '../components/StatusBadges';
import { ActionsDropdown } from '../components/ActionsDropdown';
import { ExpenseMobileCard } from '../components/ExpenseMobileCard';
import { useUserRole } from '../lib/useUserRole';

interface ExpenseDocument {
  id: string;
  invoice_date: string;
  total_excl_vat: number;
  total_vat: number;
  total_incl_vat: number;
  accounting_status: string;
  payment_status: string;
  description: string | null;
  category_name?: string;
  subcategory_name?: string;
  category_id?: string;
  subcategory_id?: string;
  linked_accounting_entry_id?: string | null;
  payment_entry_id?: string | null;
}

interface Category {
  id: string;
  name: string;
}

interface Subcategory {
  id: string;
  name: string;
  category_id: string;
}

export default function ExpensesPage() {
  const navigate = useNavigate();
  useAuth();
  const { companyId } = useParams<{ companyId: string }>();
  const { canModify } = useUserRole(companyId);

  const [expenses, setExpenses] = useState<ExpenseDocument[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [subcategories, setSubcategories] = useState<Subcategory[]>([]);
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteModal, setDeleteModal] = useState<{ show: boolean; id: string | null }>({ show: false, id: null });
  const [showFilters, setShowFilters] = useState(false);
  const [isDesktop, setIsDesktop] = useState<boolean>(window.innerWidth >= 1024);

  const [selectedYear, setSelectedYear] = useState<string>('all');
  const [selectedMonth, setSelectedMonth] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedSubcategory, setSelectedSubcategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const [currentPage, setCurrentPage] = useState<number>(1);
  const [totalCount, setTotalCount] = useState<number>(0);
  const pageSize = 10;

  const [showHistoryBanner, setShowHistoryBanner] = useState<boolean>(false);

  useEffect(() => {
    const bannerDismissed = localStorage.getItem(`history-banner-dismissed-${companyId}`);
    if (!bannerDismissed) {
      setShowHistoryBanner(true);
    }
  }, [companyId]);

  const dismissHistoryBanner = () => {
    localStorage.setItem(`history-banner-dismissed-${companyId}`, 'true');
    setShowHistoryBanner(false);
  };

  useEffect(() => {
    if (companyId) {
      loadData();
    }
  }, [companyId]);

  useEffect(() => {
    if (companyId && !loading) {
      setCurrentPage(1);
      loadExpenses();
    }
  }, [selectedYear, selectedMonth, selectedCategory, selectedSubcategory, searchQuery]);

  useEffect(() => {
    if (companyId && !loading) {
      loadExpenses();
    }
  }, [currentPage]);

  useEffect(() => {
    const onResize = () => setIsDesktop(window.innerWidth >= 1024);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const loadData = async () => {
    setLoading(true);

    const categoriesData = await loadCategories();
    await loadSubcategories();
    await loadYears();

    await loadExpenses(undefined, categoriesData);

    setLoading(false);
  };

  const loadCategories = async (): Promise<Category[]> => {
    const { data, error } = await supabase
      .from('expense_categories')
      .select('id, name')
      .eq('is_active', true)
      .order('sort_order');

    if (error) {
      console.error('LOAD_EXPENSE_CATEGORIES_ERROR', error);
      setCategories([]);
      return [];
    }

    const cats = (data ?? []) as Category[];
    setCategories(cats);
    return cats;
  };

  const loadSubcategories = async () => {
    const { data, error } = await supabase
      .from('expense_subcategories')
      .select('id, name, category_id')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (!error && data) {
      setSubcategories(data);
    } else {
      console.error('LOAD_EXPENSE_SUBCATEGORIES_ERROR', error);
      setSubcategories([]);
    }
  };

  const loadYears = async () => {
    const { data } = await supabase
      .from('expense_documents')
      .select('invoice_date')
      .eq('company_id', companyId);

    if (data && data.length > 0) {
      const years = data.map((e) => new Date(e.invoice_date).getFullYear());
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

  const loadExpenses = async (subcatsData?: Subcategory[], categoriesData?: Category[]) => {
    if (!companyId) return;

    let query = supabase
      .from('expense_documents')
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
        .from('expense_lines')
        .select('document_id, description, category_id, subcategory_id')
        .in('document_id', docs.map(d => d.id))
        .order('line_order');

      const subcatsSource = subcatsData ?? subcategories;
      const categoriesSource = categoriesData ?? categories;

      const enriched = docs.map(doc => {
        const docLines = lines?.filter(l => l.document_id === doc.id) || [];
        const firstLine = docLines[0];
        const lineCount = docLines.length;

        let description = 'Sans description';
        if (firstLine) {
          description = lineCount > 1
            ? `${firstLine.description} (+${lineCount - 1})`
            : firstLine.description;
        }

        let category_name = '';
        let subcategory_name = '';
        let category_id = '';
        let subcategory_id = '';

        if (firstLine) {
          const cat = categoriesSource.find((c) => c.id === firstLine.category_id);
          const subcat = subcatsSource.find((s) => s.id === firstLine.subcategory_id);
          category_name = cat?.name || '';
          subcategory_name = subcat?.name || '';
          category_id = firstLine.category_id;
          subcategory_id = firstLine.subcategory_id || '';
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
          subcategory_name,
          category_id,
          subcategory_id,
          linked_accounting_entry_id: doc.linked_accounting_entry_id ?? null,
          payment_entry_id: doc.payment_entry_id ?? null,
        };
      });

      let filtered = enriched;

      if (selectedCategory !== 'all') {
        filtered = filtered.filter(e => e.category_id === selectedCategory);
      }

      if (selectedSubcategory !== 'all') {
        filtered = filtered.filter(e => e.subcategory_id === selectedSubcategory);
      }

      if (searchQuery) {
        filtered = filtered.filter(e =>
          e.description?.toLowerCase().includes(searchQuery.toLowerCase())
        );
      }

      setExpenses(filtered);
    }
  };

  const handleDelete = async () => {
    if (!deleteModal.id) return;

    const { error } = await supabase.from('expense_documents').delete().eq('id', deleteModal.id);

    if (!error) {
      setDeleteModal({ show: false, id: null });
      loadExpenses();
    } else {
      alert('Erreur lors de la suppression');
    }
  };

  const handleToggleValidation = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === 'validated' ? 'draft' : 'validated';
    const { error } = await supabase
      .from('expense_documents')
      .update({ accounting_status: newStatus })
      .eq('id', id);

    if (!error) {
      loadExpenses();
    } else {
      alert('Erreur lors de la mise à jour du statut');
    }
  };

  const handleTogglePaid = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === 'paid' ? 'unpaid' : 'paid';
    const { error } = await supabase
      .from('expense_documents')
      .update({ payment_status: newStatus })
      .eq('id', id);

    if (!error) {
      loadExpenses();
    } else {
      alert('Erreur lors de la mise à jour du statut de paiement');
    }
  };

  const resetFilters = () => {
    setSelectedYear('all');
    setSelectedMonth('all');
    setSelectedCategory('all');
    setSelectedSubcategory('all');
    setSearchQuery('');
    setCurrentPage(1);
  };

  const filteredSubcategories = selectedCategory === 'all'
    ? []
    : subcategories.filter((s) => s.category_id === selectedCategory);

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
              Dépenses
            </h2>
            <p style={{ margin: 0, color: '#6b7280', fontSize: '14px' }}>
              Gérez toutes vos dépenses avec filtres et recherche
            </p>
          </div>

          {showHistoryBanner && (
            <div
              style={{
                padding: '16px 20px',
                backgroundColor: '#eff6ff',
                border: '1px solid #bfdbfe',
                borderRadius: '12px',
                marginBottom: '24px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '16px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
                <div style={{ fontSize: '24px' }}>📥</div>
                <div>
                  <p style={{ margin: '0 0 4px 0', fontSize: '14px', fontWeight: '600', color: '#1e40af' }}>
                    Vous avez commencé en cours d'année ?
                  </p>
                  <p style={{ margin: 0, fontSize: '13px', color: '#3b82f6' }}>
                    Configurez la reprise d'historique pour inclure vos soldes d'ouverture dans les rapports annuels.
                  </p>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button
                  onClick={() => navigate(`/app/company/${companyId}/reprise-historique`)}
                  style={{
                    padding: '8px 16px',
                    fontSize: '13px',
                    fontWeight: '600',
                    color: 'white',
                    backgroundColor: '#3b82f6',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    transition: 'background-color 0.2s',
                    whiteSpace: 'nowrap',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#2563eb';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '#3b82f6';
                  }}
                >
                  Configurer
                </button>
                <button
                  onClick={dismissHistoryBanner}
                  style={{
                    padding: '8px',
                    fontSize: '18px',
                    color: '#6b7280',
                    backgroundColor: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    borderRadius: '4px',
                    lineHeight: 1,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#dbeafe';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                  title="Masquer ce message"
                >
                  ✕
                </button>
              </div>
            </div>
          )}

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
                    onChange={(e) => {
                      setSelectedCategory(e.target.value);
                      setSelectedSubcategory('all');
                    }}
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

                <div style={{ flex: '1 1 200px' }}>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '6px' }}>
                    Sous-catégorie
                  </label>
                  <select
                    value={selectedSubcategory}
                    onChange={(e) => setSelectedSubcategory(e.target.value)}
                    disabled={selectedCategory === 'all'}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      fontSize: '14px',
                      border: '1px solid #d1d5db',
                      borderRadius: '8px',
                      cursor: selectedCategory === 'all' ? 'not-allowed' : 'pointer',
                      backgroundColor: selectedCategory === 'all' ? '#f3f4f6' : 'white',
                      opacity: selectedCategory === 'all' ? 0.6 : 1,
                    }}
                  >
                    <option value="all">Toutes</option>
                    {filteredSubcategories.map((sub) => (
                      <option key={sub.id} value={sub.id}>{sub.name}</option>
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

                {canModify && (
                  <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                    <button
                      onClick={() => navigate(`/app/company/${companyId}/ai-scan?type=expense`)}
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
                      onClick={() => navigate(`/app/company/${companyId}/expenses/new`)}
                      style={{
                        padding: '10px 16px',
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
                      Ajouter une dépense
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '48px', color: '#6b7280' }}>
              Chargement...
            </div>
          ) : expenses.length === 0 ? (
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
                Aucune dépense trouvée
              </h3>
              <p style={{ margin: '0 0 24px 0', color: '#6b7280', fontSize: '14px' }}>
                {canModify ? 'Commencez par ajouter votre première dépense ou scannez un justificatif.' : 'Aucune dépense enregistrée pour le moment.'}
              </p>
              {canModify && (
                <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
                  <button
                    onClick={() => navigate(`/app/company/${companyId}/ai-scan?type=expense`)}
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
                    onClick={() => navigate(`/app/company/${companyId}/expenses/new`)}
                    style={{
                      padding: '10px 16px',
                      fontSize: '14px',
                      fontWeight: '600',
                      color: 'white',
                      backgroundColor: '#dc2626',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: 'pointer',
                    }}
                  >
                    Ajouter une dépense
                  </button>
                </div>
              )}
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
                        {expenses.map((exp) => (
                          <tr key={exp.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                            <td style={{ padding: '14px 16px', fontSize: '14px', color: '#1f2937', whiteSpace: 'nowrap' }}>
                              {new Date(exp.invoice_date).toLocaleDateString('fr-FR')}
                            </td>
                            <td style={{ padding: '14px 16px', fontSize: '14px', color: '#1f2937', maxWidth: '300px' }}>
                              <div style={{ fontWeight: '500' }}>{exp.description || 'Sans libellé'}</div>
                            </td>
                            <td style={{ padding: '14px 16px', fontSize: '14px', color: '#1f2937' }}>
                              <div style={{ fontWeight: '500', marginBottom: '2px' }}>{exp.category_name || '-'}</div>
                              {exp.subcategory_name && (
                                <div style={{ fontSize: '12px', color: '#6b7280' }}>{exp.subcategory_name}</div>
                              )}
                            </td>
                            <td style={{ padding: '14px 16px', textAlign: 'right', fontSize: '14px', color: '#1f2937', whiteSpace: 'nowrap' }}>
                              {parseFloat(exp.total_excl_vat.toString()).toFixed(2)} €
                            </td>
                            <td style={{ padding: '14px 16px', textAlign: 'right', fontSize: '14px', color: '#6b7280', whiteSpace: 'nowrap' }}>
                              {parseFloat(exp.total_vat.toString()).toFixed(2)} €
                            </td>
                            <td style={{ padding: '14px 16px', textAlign: 'right', fontSize: '15px', fontWeight: '600', color: '#1f2937', whiteSpace: 'nowrap' }}>
                              {parseFloat(exp.total_incl_vat.toString()).toFixed(2)} €
                            </td>
                            <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                              <StatusBadges
                                accountingStatus={exp.accounting_status}
                                paymentStatus={exp.payment_status}
                                paymentEntryId={exp.payment_entry_id}
                              />
                            </td>
                            <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                              {(() => {
                                const expLocked = !!exp.linked_accounting_entry_id || !!exp.payment_entry_id;
                                const canTogglePaid = !exp.payment_entry_id;
                                return (
                                  <ActionsDropdown
                                    onView={() => navigate(`/app/company/${companyId}/expenses/${exp.id}`)}
                                    onEdit={!expLocked ? () => navigate(`/app/company/${companyId}/expenses/${exp.id}/edit`) : undefined}
                                    onDelete={!expLocked ? () => setDeleteModal({ show: true, id: exp.id }) : undefined}
                                    onToggleValidation={!expLocked ? () => handleToggleValidation(exp.id, exp.accounting_status) : undefined}
                                    onTogglePaid={canTogglePaid ? () => handleTogglePaid(exp.id, exp.payment_status) : undefined}
                                    accountingStatus={exp.accounting_status}
                                    paymentStatus={exp.payment_status}
                                    readOnly={!canModify}
                                  />
                                );
                              })()}
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
                {expenses.map((exp) => {
                  const expLocked = !!exp.linked_accounting_entry_id || !!exp.payment_entry_id;
                  const canTogglePaid = !exp.payment_entry_id;
                  return (
                    <ExpenseMobileCard
                      key={exp.id}
                      expense={{
                        ...exp,
                        amount_excl_vat: exp.total_excl_vat,
                        vat_amount: exp.total_vat,
                        amount_incl_vat: exp.total_incl_vat,
                      }}
                      onView={(id) => navigate(`/app/company/${companyId}/expenses/${id}`)}
                      onEdit={!expLocked ? (id) => navigate(`/app/company/${companyId}/expenses/${id}/edit`) : undefined}
                      onDelete={!expLocked ? (id) => setDeleteModal({ show: true, id }) : undefined}
                      onToggleValidation={!expLocked ? (id) => handleToggleValidation(id, exp.accounting_status) : undefined}
                      onTogglePaid={canTogglePaid ? (id) => handleTogglePaid(id, exp.payment_status) : undefined}
                      readOnly={!canModify}
                    />
                  );
                })}

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
                Êtes-vous sûr de vouloir supprimer cette dépense ? Cette action est irréversible.
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
