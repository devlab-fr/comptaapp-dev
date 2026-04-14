import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import BackButton from '../components/BackButton';
import Toast from '../components/Toast';
import { AttachmentUpload } from '../components/AttachmentUpload';
import { useEntitlements } from '../billing/useEntitlements';
import { guardCreateExpenseMonthlyQuota } from '../billing/guard';

interface Category {
  id: string;
  name: string;
  sort_order: number;
}

interface Subcategory {
  id: string;
  name: string;
  category_id: string;
  sort_order: number;
}

export default function AddExpensePage() {
  const { companyId } = useParams<{ companyId: string }>();
  useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const entitlements = useEntitlements();

  const prefillDate = searchParams.get('date') || new Date().toISOString().split('T')[0];
  const prefillAmountHT = searchParams.get('amount_ht') || '';
  const prefillVAT = searchParams.get('vat') || '';
  const prefillSupplier = searchParams.get('supplier') || '';
  const prefillDescription = searchParams.get('description') || '';
  const prefillCategoryId = searchParams.get('category_id') || '';
  const prefillSubcategoryId = searchParams.get('subcategory_id') || '';
  const prefillReceiptUrl = searchParams.get('receipt_url') || '';
  const prefillReceiptStoragePath = searchParams.get('receipt_storage_path') || '';
  const prefillReceiptFilename = searchParams.get('receipt_filename') || '';

  const calculatedTVARate = prefillAmountHT && prefillVAT
    ? (parseFloat(prefillVAT) / parseFloat(prefillAmountHT)).toFixed(2)
    : '0.20';

  const [date, setDate] = useState(prefillDate);
  const [description, setDescription] = useState(prefillDescription || prefillSupplier || '');
  const [categoryId, setCategoryId] = useState(prefillCategoryId || '');
  const [subcategoryId, setSubcategoryId] = useState(prefillSubcategoryId || '');
  const [amountHT, setAmountHT] = useState(prefillAmountHT || '');
  const [amountTTC, setAmountTTC] = useState('');
  const [tvaRate, setTvaRate] = useState(calculatedTVARate);
  const [inputMode, setInputMode] = useState<'ht' | 'ttc'>('ht');
  const [companyVatRegime, setCompanyVatRegime] = useState<string>('');
  const [categories, setCategories] = useState<Category[]>([]);
  const [subcategories, setSubcategories] = useState<Subcategory[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [createdDocumentId, setCreatedDocumentId] = useState<string | null>(null);

  useEffect(() => {
    const loadCompanyVatRegime = async () => {
      if (!companyId) return;

      const { data, error: fetchError } = await supabase
        .from('companies')
        .select('vat_regime')
        .eq('id', companyId)
        .maybeSingle();

      if (!fetchError && data) {
        setCompanyVatRegime(data.vat_regime || '');
      }
    };

    const loadCategories = async () => {
      const { data, error: fetchError } = await supabase
        .from('expense_categories')
        .select('id, name, sort_order')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });

      if (!fetchError && data) {
        setCategories(data);
      } else if (fetchError) {
        console.error('LOAD_EXPENSE_CATEGORIES_ERROR', fetchError);
        setError('Impossible de charger les catégories.');
      }
    };

    loadCompanyVatRegime();
    loadCategories();
  }, [companyId]);

  useEffect(() => {
    if (companyVatRegime === 'franchise') {
      setTvaRate('0');
    }
  }, [companyVatRegime]);

  useEffect(() => {
    const loadSubcategories = async () => {
      if (!categoryId) {
        setSubcategories([]);
        setSubcategoryId('');
        return;
      }

      const { data, error: fetchError } = await supabase
        .from('expense_subcategories')
        .select('id, name, category_id, sort_order')
        .eq('category_id', categoryId)
        .eq('is_active', true)
        .order('sort_order', { ascending: true });

      if (!fetchError && data) {
        setSubcategories(data);
      } else {
        setSubcategories([]);
        if (fetchError) {
          console.error('LOAD_EXPENSE_SUBCATEGORIES_ERROR', fetchError);
        }
      }
    };

    loadSubcategories();
  }, [categoryId]);

  const handleAmountHTChange = (value: string) => {
    setAmountHT(value);
    if (inputMode === 'ht') {
      const ht = parseFloat(value) || 0;
      const taux = parseFloat(tvaRate) || 0;
      const tva = Math.round(ht * taux * 100) / 100;
      const ttc = ht + tva;
      setAmountTTC(ttc.toFixed(2));
    }
  };

  const handleAmountTTCChange = (value: string) => {
    setAmountTTC(value);
    if (inputMode === 'ttc') {
      const ttc = parseFloat(value) || 0;
      const taux = parseFloat(tvaRate) || 0;
      const ht = Math.round(ttc / (1 + taux) * 100) / 100;
      setAmountHT(ht.toFixed(2));
    }
  };

  const handleTvaRateChange = (value: string) => {
    setTvaRate(value);
    if (inputMode === 'ht') {
      const ht = parseFloat(amountHT) || 0;
      const taux = parseFloat(value) || 0;
      const tva = Math.round(ht * taux * 100) / 100;
      const ttc = ht + tva;
      setAmountTTC(ttc.toFixed(2));
    } else {
      const ttc = parseFloat(amountTTC) || 0;
      const taux = parseFloat(value) || 0;
      const ht = Math.round(ttc / (1 + taux) * 100) / 100;
      setAmountHT(ht.toFixed(2));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!companyId) return;

    setError(null);
    setLoading(true);

    const amountHTNum = parseFloat(amountHT);
    const tvaRateNum = parseFloat(tvaRate);

    if (isNaN(amountHTNum) || amountHTNum < 0) {
      setError('Le montant HT doit être un nombre positif');
      setLoading(false);
      return;
    }

    if (!description.trim()) {
      setError('Le libellé est requis');
      setLoading(false);
      return;
    }

    if (!categoryId) {
      setError('La catégorie est requise');
      setLoading(false);
      return;
    }

    let validCategoryId = categoryId;
    let validSubcategoryId: string | null = null;

    const categoryInList = categories.find(c => c.id === categoryId);

    if (!categoryInList) {
      if (categories.length > 0) {
        validCategoryId = categories[0].id;
        validSubcategoryId = null;
      } else {
        setError('Aucune catégorie disponible. Rechargez la page.');
        setLoading(false);
        return;
      }
    }

    if (subcategoryId && subcategories.some(s => s.id === subcategoryId)) {
      validSubcategoryId = subcategoryId;
    }

    const amountTva = Math.round(amountHTNum * tvaRateNum * 100) / 100;
    const amountTtc = Math.round((amountHTNum + amountTva) * 100) / 100;

    const getCurrentMonthExpenseCount = async (): Promise<number> => {
      const targetDate = new Date(date);
      const firstDayOfMonth = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1);
      const firstDayOfNextMonth = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 1);

      const { count, error: countError } = await supabase
        .from('expense_documents')
        .select('*', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .gte('invoice_date', firstDayOfMonth.toISOString().split('T')[0])
        .lt('invoice_date', firstDayOfNextMonth.toISOString().split('T')[0]);

      if (countError) {
        console.error('COUNT_EXPENSES_ERROR', countError);
        return 0;
      }

      return count || 0;
    };

    const guardResult = await guardCreateExpenseMonthlyQuota({
      entitlements,
      getCurrentMonthExpenseCount,
    });

    if (!guardResult.ok) {
      setToast({
        message: guardResult.message || 'Limite de quota atteinte',
        type: 'error'
      });
      setLoading(false);
      setTimeout(() => {
        navigate('/app/subscription');
      }, 2000);
      return;
    }

    const documentData: any = {
      company_id: companyId,
      invoice_date: date,
      total_excl_vat: amountHTNum,
      total_vat: amountTva,
      total_incl_vat: amountTtc,
      accounting_status: 'draft',
      payment_status: 'unpaid',
    };

    if (prefillReceiptUrl) {
      documentData.receipt_url = prefillReceiptUrl;
      documentData.receipt_storage_path = prefillReceiptStoragePath;
      documentData.receipt_filename = prefillReceiptFilename;
    }

    const { data: docData, error: docError } = await supabase
      .from('expense_documents')
      .insert(documentData)
      .select()
      .single();

    if (docError || !docData?.id) {
      console.error('INSERT_EXPENSE_DOCUMENT_ERROR', docError);
      setToast({
        message: `Erreur lors de la création de la dépense: ${docError?.message || 'Aucun document créé'}`,
        type: 'error'
      });
      setLoading(false);
      return;
    }

    const lineData = {
      document_id: docData.id,
      description: description,
      category_id: validCategoryId,
      subcategory_id: validSubcategoryId,
      amount_excl_vat: amountHTNum,
      vat_rate: tvaRateNum,
      vat_amount: amountTva,
      amount_incl_vat: amountTtc,
      line_order: 0,
    };

    const { data: lineDataResult, error: lineError } = await supabase
      .from('expense_lines')
      .insert(lineData)
      .select()
      .single();

    if (lineError || !lineDataResult?.id) {
      console.error('INSERT_EXPENSE_LINE_ERROR', lineError);
      await supabase.from('expense_documents').delete().eq('id', docData.id);
      setToast({
        message: `Erreur lors de la création de la ligne de dépense: ${lineError?.message || 'Aucune ligne créée'}`,
        type: 'error'
      });
      setLoading(false);
      return;
    }

    if (prefillReceiptUrl && docData.id) {
      await supabase.from('attachments').insert({
        company_id: companyId,
        expense_document_id: docData.id,
        file_path: prefillReceiptStoragePath,
      });
    }

    setCreatedDocumentId(docData.id);
    setLoading(false);
  };

  if (createdDocumentId) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#f8f9fa' }}>
        <main
          style={{
            maxWidth: '1000px',
            margin: '0 auto',
            padding: '32px 24px',
          }}
        >
          <div
            style={{
              padding: '32px',
              backgroundColor: 'white',
              borderRadius: '16px',
              boxShadow: '0 4px 6px rgba(0, 0, 0, 0.05)',
            }}
          >
            <div
              style={{
                textAlign: 'center',
                marginBottom: '32px',
              }}
            >
              <div
                style={{
                  width: '64px',
                  height: '64px',
                  backgroundColor: '#fee2e2',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 16px',
                }}
              >
                <span style={{ fontSize: '32px' }}>✓</span>
              </div>
              <h2
                style={{
                  margin: '0 0 8px 0',
                  fontSize: '24px',
                  fontWeight: '700',
                  color: '#1a1a1a',
                }}
              >
                Dépense créée avec succès
              </h2>
              <p
                style={{
                  margin: 0,
                  color: '#6b7280',
                  fontSize: '14px',
                }}
              >
                Vous pouvez maintenant ajouter des justificatifs (optionnel)
              </p>
            </div>

            <div style={{ marginBottom: '24px' }}>
              <h3
                style={{
                  margin: '0 0 16px 0',
                  fontSize: '18px',
                  fontWeight: '600',
                  color: '#1a1a1a',
                }}
              >
                Justificatifs
              </h3>
              {toast && (
                <div style={{ marginBottom: '16px' }}>
                  <p style={{ margin: 0, color: toast.type === 'success' ? '#166534' : '#dc2626' }}>
                    {toast.message}
                  </p>
                </div>
              )}
              <AttachmentUpload
                companyId={companyId!}
                fiscalYear={new Date(date).getFullYear()}
                recordType="expense_documents"
                recordId={createdDocumentId}
                setToast={setToast}
              />
            </div>

            <div
              style={{
                display: 'flex',
                gap: '12px',
                justifyContent: 'center',
              }}
            >
              <button
                onClick={() => navigate(`/app/company/${companyId}?success=expense_added`)}
                style={{
                  padding: '12px 24px',
                  fontSize: '14px',
                  fontWeight: '600',
                  color: 'white',
                  backgroundColor: '#dc2626',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#b91c1c';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#dc2626';
                }}
              >
                Terminer
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8f9fa' }}>
      <main
        style={{
          maxWidth: '1000px',
          margin: '0 auto',
          padding: '32px 24px',
        }}
      >
        <BackButton to={`/app/company/${companyId}`} />

        <div
          style={{
            padding: '32px',
            backgroundColor: 'white',
            borderRadius: '16px',
            boxShadow: '0 4px 6px rgba(0, 0, 0, 0.05)',
          }}
        >
          <h2
            style={{
              margin: '0 0 24px 0',
              fontSize: '28px',
              fontWeight: '700',
              color: '#1a1a1a',
            }}
          >
            Ajouter une dépense
          </h2>

          {error && (
            <div
              style={{
                padding: '12px 16px',
                backgroundColor: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: '8px',
                marginBottom: '24px',
              }}
            >
              <p
                style={{
                  margin: 0,
                  color: '#dc2626',
                  fontSize: '14px',
                }}
              >
                {error}
              </p>
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <span style={{ fontSize: '14px', color: '#6b7280', fontWeight: '500' }}>
                  Mode de saisie :
                </span>
                <button
                  type="button"
                  onClick={() => setInputMode(inputMode === 'ht' ? 'ttc' : 'ht')}
                  style={{
                    padding: '6px 12px',
                    fontSize: '14px',
                    fontWeight: '600',
                    color: 'white',
                    backgroundColor: inputMode === 'ht' ? '#dc2626' : '#0ea5e9',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.opacity = '0.9';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.opacity = '1';
                  }}
                >
                  {inputMode === 'ht' ? 'HT' : 'TTC'}
                </button>
              </div>
            </div>

            <div style={{ marginBottom: '24px' }}>
              <label
                style={{
                  display: 'block',
                  marginBottom: '8px',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#374151',
                }}
              >
                Date
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  fontSize: '14px',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  outline: 'none',
                  transition: 'border-color 0.2s ease',
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = '#dc2626';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = '#d1d5db';
                }}
              />
            </div>

            <div style={{ marginBottom: '24px' }}>
              <label
                style={{
                  display: 'block',
                  marginBottom: '8px',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#374151',
                }}
              >
                Libellé
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
                placeholder="Description de la dépense"
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  fontSize: '14px',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  outline: 'none',
                  transition: 'border-color 0.2s ease',
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = '#dc2626';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = '#d1d5db';
                }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
              <div>
                <label
                  style={{
                    display: 'block',
                    marginBottom: '8px',
                    fontSize: '14px',
                    fontWeight: '500',
                    color: '#374151',
                  }}
                >
                  Catégorie
                </label>
                <select
                  value={categoryId}
                  onChange={(e) => {
                    setCategoryId(e.target.value);
                    setSubcategoryId('');
                  }}
                  required
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    fontSize: '14px',
                    border: '1px solid #d1d5db',
                    borderRadius: '8px',
                    outline: 'none',
                    transition: 'border-color 0.2s ease',
                    cursor: 'pointer',
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = '#dc2626';
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = '#d1d5db';
                  }}
                >
                  <option value="">Sélectionnez une catégorie</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  style={{
                    display: 'block',
                    marginBottom: '8px',
                    fontSize: '14px',
                    fontWeight: '500',
                    color: '#374151',
                  }}
                >
                  Sous-catégorie (optionnel)
                </label>
                <select
                  value={subcategoryId}
                  onChange={(e) => setSubcategoryId(e.target.value)}
                  disabled={!categoryId || subcategories.length === 0}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    fontSize: '14px',
                    border: '1px solid #d1d5db',
                    borderRadius: '8px',
                    outline: 'none',
                    transition: 'border-color 0.2s ease',
                    backgroundColor: (!categoryId || subcategories.length === 0) ? '#f3f4f6' : 'white',
                    cursor: (!categoryId || subcategories.length === 0) ? 'not-allowed' : 'pointer',
                    opacity: (!categoryId || subcategories.length === 0) ? 0.6 : 1,
                  }}
                  onFocus={(e) => {
                    if (categoryId && subcategories.length > 0) {
                      e.currentTarget.style.borderColor = '#dc2626';
                    }
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = '#d1d5db';
                  }}
                >
                  <option value="">
                    {!categoryId
                      ? 'Sélectionnez d\'abord une catégorie'
                      : subcategories.length === 0
                      ? 'Aucune sous-catégorie'
                      : 'Sélectionnez une sous-catégorie (optionnel)'}
                  </option>
                  {subcategories.map((sub) => (
                    <option key={sub.id} value={sub.id}>
                      {sub.name}
                    </option>
                  ))}
                </select>
              </div>

              {inputMode === 'ht' ? (
                <div>
                  <label
                    style={{
                      display: 'block',
                      marginBottom: '8px',
                      fontSize: '14px',
                      fontWeight: '500',
                      color: '#374151',
                    }}
                  >
                    Montant HT (€)
                  </label>
                  <input
                    type="number"
                    value={amountHT}
                    onChange={(e) => handleAmountHTChange(e.target.value)}
                    required
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      fontSize: '14px',
                      border: '1px solid #d1d5db',
                      borderRadius: '8px',
                      outline: 'none',
                      transition: 'border-color 0.2s ease',
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = '#dc2626';
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = '#d1d5db';
                    }}
                  />
                  {amountTTC && (
                    <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#6b7280' }}>
                      TTC calculé : {parseFloat(amountTTC).toFixed(2)} €
                    </p>
                  )}
                </div>
              ) : (
                <div>
                  <label
                    style={{
                      display: 'block',
                      marginBottom: '8px',
                      fontSize: '14px',
                      fontWeight: '500',
                      color: '#374151',
                    }}
                  >
                    Montant TTC (€)
                  </label>
                  <input
                    type="number"
                    value={amountTTC}
                    onChange={(e) => handleAmountTTCChange(e.target.value)}
                    required
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      fontSize: '14px',
                      border: '1px solid #d1d5db',
                      borderRadius: '8px',
                      outline: 'none',
                      transition: 'border-color 0.2s ease',
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = '#0ea5e9';
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = '#d1d5db';
                    }}
                  />
                  {amountHT && (
                    <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#6b7280' }}>
                      HT calculé : {parseFloat(amountHT).toFixed(2)} €
                    </p>
                  )}
                </div>
              )}

              <div>
                <label
                  style={{
                    display: 'block',
                    marginBottom: '8px',
                    fontSize: '14px',
                    fontWeight: '500',
                    color: '#374151',
                  }}
                >
                  Taux de TVA
                </label>
                {companyVatRegime === 'franchise' ? (
                  <input
                    type="text"
                    value="0% - TVA non applicable"
                    disabled
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      fontSize: '14px',
                      border: '1px solid #d1d5db',
                      borderRadius: '8px',
                      outline: 'none',
                      backgroundColor: '#f9fafb',
                      color: '#6b7280',
                      cursor: 'not-allowed',
                    }}
                  />
                ) : (
                  <select
                    value={tvaRate}
                    onChange={(e) => handleTvaRateChange(e.target.value)}
                    required
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      fontSize: '14px',
                      border: '1px solid #d1d5db',
                      borderRadius: '8px',
                      outline: 'none',
                      transition: 'border-color 0.2s ease',
                      cursor: 'pointer',
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = '#dc2626';
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = '#d1d5db';
                    }}
                  >
                    <option value="0">0% - TVA non applicable</option>
                    <option value="0.055">5,5% - Taux réduit</option>
                    <option value="0.10">10% - Taux intermédiaire</option>
                    <option value="0.20">20% - Taux normal</option>
                  </select>
                )}
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                gap: '12px',
                justifyContent: 'flex-end',
              }}
            >
              <button
                type="button"
                onClick={() => navigate(`/app/company/${companyId}`)}
                style={{
                  padding: '12px 24px',
                  fontSize: '14px',
                  fontWeight: '600',
                  color: '#6b7280',
                  backgroundColor: 'white',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
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
                type="submit"
                disabled={loading}
                style={{
                  padding: '12px 24px',
                  fontSize: '14px',
                  fontWeight: '600',
                  color: 'white',
                  backgroundColor: loading ? '#9ca3af' : '#dc2626',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  transition: 'all 0.2s ease',
                }}
                onMouseEnter={(e) => {
                  if (!loading) {
                    e.currentTarget.style.backgroundColor = '#b91c1c';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!loading) {
                    e.currentTarget.style.backgroundColor = '#dc2626';
                  }
                }}
              >
                {loading ? 'Enregistrement...' : 'Enregistrer'}
              </button>
            </div>
          </form>
        </div>
      </main>

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}
