import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import BackButton from '../components/BackButton';
import { AttachmentUpload } from '../components/AttachmentUpload';

interface Category {
  id: string;
  name: string;
  sort_order: number;
}

interface Subcategory {
  id: string;
  name: string;
  sort_order: number;
}

interface RevenueLine {
  id: string;
  description: string;
  categoryId: string;
  subcategoryId: string;
  amountHT: string;
  amountTTC: string;
  tvaRate: string;
}

interface ThirdParty {
  id: string;
  name: string;
  code: string | null;
}

export default function AddRevenuePage() {
  const { companyId } = useParams<{ companyId: string }>();
  useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const prefillDate = searchParams.get('date') || new Date().toISOString().split('T')[0];
  const prefillAmountHT = searchParams.get('amount_ht') || '';
  const prefillVAT = searchParams.get('vat') || '';
  const prefillClient = searchParams.get('client') || '';
  const prefillDescription = searchParams.get('description') || '';
  const prefillCategoryId = searchParams.get('category_id') || '';
  const prefillSubcategoryId = searchParams.get('subcategory_id') || '';

  const calculatedTVARate = prefillAmountHT && prefillVAT
    ? (parseFloat(prefillVAT) / parseFloat(prefillAmountHT)).toFixed(2)
    : '0.20';

  const [date, setDate] = useState(prefillDate);
  const [documentNumber, setDocumentNumber] = useState('');
  const [sourceType, setSourceType] = useState<'manual' | 'cash'>('manual');
  const [paymentTiming, setPaymentTiming] = useState<'immediate' | 'deferred'>('deferred');
  const [companyVatRegime, setCompanyVatRegime] = useState<string>('');
  const [inputMode, setInputMode] = useState<'ht' | 'ttc'>('ht');
  const [lines, setLines] = useState<RevenueLine[]>([
    {
      id: crypto.randomUUID(),
      description: prefillDescription || prefillClient || '',
      categoryId: prefillCategoryId || '',
      subcategoryId: prefillSubcategoryId || '',
      amountHT: prefillAmountHT || '',
      amountTTC: '',
      tvaRate: calculatedTVARate,
    },
  ]);
  const [thirdPartyId, setThirdPartyId] = useState<string>('');
  const [thirdParties, setThirdParties] = useState<ThirdParty[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [subcategoriesMap, setSubcategoriesMap] = useState<Record<string, Subcategory[]>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdDocumentId, setCreatedDocumentId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

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
        .from('revenue_categories')
        .select('id, name, sort_order')
        .eq('is_active', true)
        .order('sort_order');

      if (!fetchError && data) {
        setCategories(data);
      }
    };

    const loadThirdParties = async () => {
      if (!companyId) return;
      const { data, error: fetchError } = await supabase
        .from('third_parties')
        .select('id, name, code')
        .eq('company_id', companyId)
        .eq('type', 'client')
        .order('name', { ascending: true });
      if (!fetchError && data) {
        setThirdParties(data);
      }
    };

    loadCompanyVatRegime();
    loadCategories();
    loadThirdParties();
  }, [companyId]);

  useEffect(() => {
    const loadAllSubcategories = async () => {
      const { data, error: fetchError } = await supabase
        .from('revenue_subcategories')
        .select('id, name, sort_order, category_id')
        .eq('is_active', true)
        .order('sort_order');

      if (!fetchError && data) {
        const map: Record<string, Subcategory[]> = {};
        data.forEach((subcat) => {
          if (!map[subcat.category_id]) {
            map[subcat.category_id] = [];
          }
          map[subcat.category_id].push({
            id: subcat.id,
            name: subcat.name,
            sort_order: subcat.sort_order,
          });
        });
        setSubcategoriesMap(map);
      }
    };

    loadAllSubcategories();
  }, []);

  useEffect(() => {
    if (companyVatRegime === 'franchise') {
      setLines(prevLines => prevLines.map(line => ({ ...line, tvaRate: '0' })));
    }
  }, [companyVatRegime]);

  const addLine = () => {
    const tvaRate = companyVatRegime === 'franchise' ? '0' : '0.20';
    setLines([
      ...lines,
      {
        id: crypto.randomUUID(),
        description: '',
        categoryId: '',
        subcategoryId: '',
        amountHT: '',
        amountTTC: '',
        tvaRate: tvaRate,
      },
    ]);
  };

  const removeLine = (id: string) => {
    if (lines.length === 1) {
      setError('Vous devez avoir au moins une ligne');
      return;
    }
    setLines(lines.filter((line) => line.id !== id));
  };

  const updateLine = (id: string, field: keyof RevenueLine, value: string) => {
    setLines(
      lines.map((line) => {
        if (line.id !== id) return line;

        const updated = { ...line, [field]: value };

        if (field === 'categoryId') {
          updated.subcategoryId = '';
        }

        if (field === 'amountHT' && inputMode === 'ht') {
          const ht = parseFloat(value) || 0;
          const taux = parseFloat(line.tvaRate) || 0;
          const tva = Math.round(ht * taux * 100) / 100;
          const ttc = ht + tva;
          updated.amountTTC = ttc.toFixed(2);
        }

        if (field === 'amountTTC' && inputMode === 'ttc') {
          const ttc = parseFloat(value) || 0;
          const taux = parseFloat(line.tvaRate) || 0;
          const ht = Math.round(ttc / (1 + taux) * 100) / 100;
          updated.amountHT = ht.toFixed(2);
        }

        if (field === 'tvaRate') {
          if (inputMode === 'ht') {
            const ht = parseFloat(line.amountHT) || 0;
            const taux = parseFloat(value) || 0;
            const tva = Math.round(ht * taux * 100) / 100;
            const ttc = ht + tva;
            updated.amountTTC = ttc.toFixed(2);
          } else {
            const ttc = parseFloat(line.amountTTC) || 0;
            const taux = parseFloat(value) || 0;
            const ht = Math.round(ttc / (1 + taux) * 100) / 100;
            updated.amountHT = ht.toFixed(2);
          }
        }

        return updated;
      })
    );
  };

  const calculateTotals = () => {
    let totalHT = 0;
    let totalTVA = 0;
    let totalTTC = 0;

    lines.forEach((line) => {
      const amountHTNum = parseFloat(line.amountHT) || 0;
      const tvaRateNum = parseFloat(line.tvaRate) || 0;
      const tvaAmount = Math.round(amountHTNum * tvaRateNum * 100) / 100;
      const ttc = Math.round((amountHTNum + tvaAmount) * 100) / 100;

      totalHT += amountHTNum;
      totalTVA += tvaAmount;
      totalTTC += ttc;
    });

    return {
      totalHT: Math.round(totalHT * 100) / 100,
      totalTVA: Math.round(totalTVA * 100) / 100,
      totalTTC: Math.round(totalTTC * 100) / 100,
    };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!companyId) return;

    setError(null);
    setLoading(true);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const amountHTNum = parseFloat(line.amountHT);
      const tvaRateNum = parseFloat(line.tvaRate);

      if (isNaN(amountHTNum) || amountHTNum < 0) {
        setError(`Ligne ${i + 1}: Le montant HT doit être un nombre positif`);
        setLoading(false);
        return;
      }

      if (!line.description.trim()) {
        setError(`Ligne ${i + 1}: Le libellé est requis`);
        setLoading(false);
        return;
      }

      if (!line.categoryId) {
        setError(`Ligne ${i + 1}: La catégorie est requise`);
        setLoading(false);
        return;
      }

      if (companyVatRegime === 'franchise' && tvaRateNum !== 0) {
        setError(`Ligne ${i + 1}: La TVA doit être à 0% pour le régime franchise`);
        setLoading(false);
        return;
      }
    }

    const totals = calculateTotals();

    const documentData: any = {
      company_id: companyId,
      invoice_date: date,
      total_excl_vat: totals.totalHT,
      total_vat: totals.totalTVA,
      total_incl_vat: totals.totalTTC,
      source_type: sourceType,
      payment_timing: paymentTiming,
      accounting_status: 'draft',
      payment_status: 'unpaid',
      third_party_id: thirdPartyId || null,
    };

    if (documentNumber.trim()) {
      documentData.document_number = documentNumber.trim();
    }

    const { data: document, error: docError } = await supabase
      .from('revenue_documents')
      .insert(documentData)
      .select()
      .single();

    if (docError || !document) {
      setError('Erreur lors de la création du document');
      setLoading(false);
      return;
    }

    const lineInserts = lines.map((line, index) => {
      const amountHTNum = parseFloat(line.amountHT);
      const tvaRateNum = parseFloat(line.tvaRate);
      const tvaAmount = Math.round(amountHTNum * tvaRateNum * 100) / 100;
      const ttc = Math.round((amountHTNum + tvaAmount) * 100) / 100;

      return {
        document_id: document.id,
        description: line.description,
        category_id: line.categoryId,
        subcategory_id: line.subcategoryId ? line.subcategoryId : null,
        amount_excl_vat: amountHTNum,
        vat_rate: tvaRateNum,
        vat_amount: tvaAmount,
        amount_incl_vat: ttc,
        line_order: index,
      };
    });

    const { error: linesError } = await supabase.from('revenue_lines').insert(lineInserts);

    if (linesError) {
      setError('Erreur lors de l\'ajout des lignes');
      setLoading(false);
      return;
    }

    // Générer l'écriture comptable maintenant que les lignes existent
    const { error: accountingError } = await supabase.rpc(
      'auto_create_revenue_accounting_entry_manual',
      { p_revenue_id: document.id }
    );

    if (accountingError) {
      console.warn('Avertissement: écriture comptable non générée', accountingError);
      // Ne pas bloquer la création du revenu si la génération comptable échoue
    }

    setCreatedDocumentId(document.id);
    setLoading(false);
  };

  const totals = calculateTotals();

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
                  backgroundColor: '#d1fae5',
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
                Revenu créé avec succès
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
                recordType="revenue_documents"
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
                onClick={() => navigate(`/app/company/${companyId}?success=revenue_added`)}
                style={{
                  padding: '12px 24px',
                  fontSize: '14px',
                  fontWeight: '600',
                  color: 'white',
                  backgroundColor: '#28a745',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#218838';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#28a745';
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
            borderTop: '3px solid #22c55e',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
            <h2
              style={{
                margin: 0,
                fontSize: '28px',
                fontWeight: '700',
                color: '#1a1a1a',
              }}
            >
              Ajouter un revenu
            </h2>
            <span
              style={{
                padding: '3px 10px',
                fontSize: '12px',
                fontWeight: '600',
                color: '#16a34a',
                backgroundColor: '#f0fdf4',
                border: '1px solid #bbf7d0',
                borderRadius: '20px',
                letterSpacing: '0.02em',
              }}
            >
              Recette
            </span>
          </div>

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
                  e.currentTarget.style.borderColor = '#28a745';
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
                Type de revenu
              </label>
              <select
                value={sourceType}
                onChange={(e) => setSourceType(e.target.value as 'manual' | 'cash')}
                required
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  fontSize: '14px',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  outline: 'none',
                  transition: 'border-color 0.2s ease',
                  backgroundColor: 'white',
                  cursor: 'pointer',
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = '#28a745';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = '#d1d5db';
                }}
              >
                <option value="manual">Recette directe</option>
                <option value="cash">Vente en caisse</option>
              </select>
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
                Mode d'encaissement
              </label>
              <select
                value={paymentTiming}
                onChange={(e) => setPaymentTiming(e.target.value as 'immediate' | 'deferred')}
                required
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  fontSize: '14px',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  outline: 'none',
                  transition: 'border-color 0.2s ease',
                  backgroundColor: 'white',
                  cursor: 'pointer',
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = '#28a745';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = '#d1d5db';
                }}
              >
                <option value="immediate">Immédiat (déjà encaissé)</option>
                <option value="deferred">Différé (facture à encaisser)</option>
              </select>
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
                Réf. document
                <span style={{ marginLeft: '6px', fontSize: '12px', color: '#9ca3af', fontWeight: '400' }}>(optionnel)</span>
              </label>
              <input
                type="text"
                value={documentNumber}
                onChange={(e) => setDocumentNumber(e.target.value)}
                placeholder="N° de bon de commande, devis, référence client..."
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
                  e.currentTarget.style.borderColor = '#28a745';
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
                Client
                <span style={{ marginLeft: '6px', fontSize: '12px', color: '#9ca3af', fontWeight: '400' }}>(optionnel)</span>
              </label>
              <select
                value={thirdPartyId}
                onChange={(e) => setThirdPartyId(e.target.value)}
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
                onFocus={(e) => { e.currentTarget.style.borderColor = '#28a745'; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = '#d1d5db'; }}
              >
                <option value="">— Aucun client —</option>
                {thirdParties.map((tp) => (
                  <option key={tp.id} value={tp.id}>
                    {tp.code ? `${tp.code} — ${tp.name}` : tp.name}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: '24px' }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '16px',
                }}
              >
                <h3
                  style={{
                    margin: 0,
                    fontSize: '18px',
                    fontWeight: '600',
                    color: '#1a1a1a',
                  }}
                >
                  Lignes de revenu
                </h3>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <span style={{ fontSize: '14px', color: '#6b7280', fontWeight: '500' }}>
                      Mode de saisie :
                    </span>
                    <div style={{ display: 'flex', borderRadius: '6px', overflow: 'hidden', border: '1px solid #e5e7eb' }}>
                      <button
                        type="button"
                        onClick={() => setInputMode('ht')}
                        style={{
                          padding: '6px 12px',
                          fontSize: '14px',
                          fontWeight: '600',
                          color: inputMode === 'ht' ? 'white' : '#374151',
                          backgroundColor: inputMode === 'ht' ? '#dc2626' : '#f9fafb',
                          border: 'none',
                          cursor: 'pointer',
                          transition: 'background-color 0.15s ease, color 0.15s ease',
                        }}
                        onMouseEnter={(e) => { if (inputMode !== 'ht') e.currentTarget.style.backgroundColor = '#f3f4f6'; }}
                        onMouseLeave={(e) => { if (inputMode !== 'ht') e.currentTarget.style.backgroundColor = '#f9fafb'; }}
                      >
                        HT
                      </button>
                      <button
                        type="button"
                        onClick={() => setInputMode('ttc')}
                        style={{
                          padding: '6px 12px',
                          fontSize: '14px',
                          fontWeight: '600',
                          color: inputMode === 'ttc' ? 'white' : '#374151',
                          backgroundColor: inputMode === 'ttc' ? '#0ea5e9' : '#f9fafb',
                          border: 'none',
                          borderLeft: '1px solid #e5e7eb',
                          cursor: 'pointer',
                          transition: 'background-color 0.15s ease, color 0.15s ease',
                        }}
                        onMouseEnter={(e) => { if (inputMode !== 'ttc') e.currentTarget.style.backgroundColor = '#f3f4f6'; }}
                        onMouseLeave={(e) => { if (inputMode !== 'ttc') e.currentTarget.style.backgroundColor = '#f9fafb'; }}
                      >
                        TTC
                      </button>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={addLine}
                    style={{
                      padding: '8px 16px',
                      fontSize: '14px',
                      fontWeight: '600',
                      color: '#28a745',
                      backgroundColor: 'white',
                      border: '1px solid #28a745',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = '#f0f9f4';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'white';
                    }}
                  >
                    + Ajouter une ligne
                  </button>
                </div>
              </div>

              {lines.map((line, index) => (
                <div
                  key={line.id}
                  style={{
                    padding: '20px',
                    backgroundColor: '#f9fafb',
                    borderRadius: '8px',
                    marginBottom: '16px',
                    border: '1px solid #e5e7eb',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: '16px',
                    }}
                  >
                    <h4
                      style={{
                        margin: 0,
                        fontSize: '16px',
                        fontWeight: '600',
                        color: '#374151',
                      }}
                    >
                      Ligne {index + 1}
                    </h4>
                    {lines.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeLine(line.id)}
                        style={{
                          padding: '4px 12px',
                          fontSize: '13px',
                          fontWeight: '500',
                          color: '#dc2626',
                          backgroundColor: 'white',
                          border: '1px solid #e5e7eb',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          transition: 'all 0.2s ease',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = '#fef2f2';
                          e.currentTarget.style.borderColor = '#fecaca';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = 'white';
                          e.currentTarget.style.borderColor = '#e5e7eb';
                        }}
                      >
                        Supprimer
                      </button>
                    )}
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <div style={{ gridColumn: '1 / -1' }}>
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
                        value={line.description}
                        onChange={(e) => updateLine(line.id, 'description', e.target.value)}
                        required
                        placeholder="Description du revenu"
                        style={{
                          width: '100%',
                          padding: '12px 16px',
                          fontSize: '14px',
                          border: '1px solid #d1d5db',
                          borderRadius: '8px',
                          outline: 'none',
                          transition: 'border-color 0.2s ease',
                          backgroundColor: 'white',
                        }}
                        onFocus={(e) => {
                          e.currentTarget.style.borderColor = '#28a745';
                        }}
                        onBlur={(e) => {
                          e.currentTarget.style.borderColor = '#d1d5db';
                        }}
                      />
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
                        Catégorie
                      </label>
                      <select
                        value={line.categoryId}
                        onChange={(e) => updateLine(line.id, 'categoryId', e.target.value)}
                        required
                        style={{
                          width: '100%',
                          padding: '12px 16px',
                          fontSize: '14px',
                          border: '1px solid #d1d5db',
                          borderRadius: '8px',
                          outline: 'none',
                          transition: 'border-color 0.2s ease',
                          backgroundColor: 'white',
                          cursor: 'pointer',
                        }}
                        onFocus={(e) => {
                          e.currentTarget.style.borderColor = '#28a745';
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
                        Sous-catégorie
                      </label>
                      <select
                        value={line.subcategoryId}
                        onChange={(e) => updateLine(line.id, 'subcategoryId', e.target.value)}
                        disabled={!line.categoryId || !subcategoriesMap[line.categoryId]}
                        style={{
                          width: '100%',
                          padding: '12px 16px',
                          fontSize: '14px',
                          border: '1px solid #d1d5db',
                          borderRadius: '8px',
                          outline: 'none',
                          transition: 'border-color 0.2s ease',
                          backgroundColor:
                            !line.categoryId || !subcategoriesMap[line.categoryId]
                              ? '#f3f4f6'
                              : 'white',
                          cursor:
                            !line.categoryId || !subcategoriesMap[line.categoryId]
                              ? 'not-allowed'
                              : 'pointer',
                          opacity:
                            !line.categoryId || !subcategoriesMap[line.categoryId] ? 0.6 : 1,
                        }}
                        onFocus={(e) => {
                          if (line.categoryId && subcategoriesMap[line.categoryId]) {
                            e.currentTarget.style.borderColor = '#28a745';
                          }
                        }}
                        onBlur={(e) => {
                          e.currentTarget.style.borderColor = '#d1d5db';
                        }}
                      >
                        <option value="">
                          {!line.categoryId
                            ? 'Sélectionnez d\'abord une catégorie'
                            : 'Sélectionnez une sous-catégorie'}
                        </option>
                        {line.categoryId && <option value="">Aucune sous-catégorie</option>}
                        {line.categoryId &&
                          subcategoriesMap[line.categoryId]?.map((subcat) => (
                            <option key={subcat.id} value={subcat.id}>
                              {subcat.name}
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
                          value={line.amountHT}
                          onChange={(e) => updateLine(line.id, 'amountHT', e.target.value)}
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
                            backgroundColor: 'white',
                          }}
                          onFocus={(e) => {
                            e.currentTarget.style.borderColor = '#28a745';
                          }}
                          onBlur={(e) => {
                            e.currentTarget.style.borderColor = '#d1d5db';
                          }}
                        />
                        {line.amountTTC && (
                          <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#6b7280' }}>
                            TTC calculé : {parseFloat(line.amountTTC).toFixed(2)} €
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
                          value={line.amountTTC}
                          onChange={(e) => updateLine(line.id, 'amountTTC', e.target.value)}
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
                            backgroundColor: 'white',
                          }}
                          onFocus={(e) => {
                            e.currentTarget.style.borderColor = '#0ea5e9';
                          }}
                          onBlur={(e) => {
                            e.currentTarget.style.borderColor = '#d1d5db';
                          }}
                        />
                        {line.amountHT && (
                          <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#6b7280' }}>
                            HT calculé : {parseFloat(line.amountHT).toFixed(2)} €
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
                            backgroundColor: '#f3f4f6',
                            color: '#6b7280',
                            cursor: 'not-allowed',
                          }}
                        />
                      ) : (
                        <select
                          value={line.tvaRate}
                          onChange={(e) => updateLine(line.id, 'tvaRate', e.target.value)}
                          required
                          style={{
                            width: '100%',
                            padding: '12px 16px',
                            fontSize: '14px',
                            border: '1px solid #d1d5db',
                            borderRadius: '8px',
                            outline: 'none',
                            transition: 'border-color 0.2s ease',
                            backgroundColor: 'white',
                            cursor: 'pointer',
                          }}
                          onFocus={(e) => {
                            e.currentTarget.style.borderColor = '#28a745';
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
                </div>
              ))}
            </div>

            <div
              style={{
                padding: '20px',
                backgroundColor: '#f0fdf4',
                borderRadius: '8px',
                marginBottom: '24px',
                border: '1px solid #bbf7d0',
              }}
            >
              <h3
                style={{
                  margin: '0 0 16px 0',
                  fontSize: '16px',
                  fontWeight: '600',
                  color: '#166534',
                }}
              >
                Total du document
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
                <div>
                  <p
                    style={{
                      margin: '0 0 4px 0',
                      fontSize: '13px',
                      color: '#15803d',
                      fontWeight: '500',
                    }}
                  >
                    Total HT
                  </p>
                  <p
                    style={{
                      margin: 0,
                      fontSize: '20px',
                      fontWeight: '700',
                      color: '#166534',
                    }}
                  >
                    {new Intl.NumberFormat('fr-FR', {
                      style: 'currency',
                      currency: 'EUR',
                    }).format(totals.totalHT)}
                  </p>
                </div>
                <div>
                  <p
                    style={{
                      margin: '0 0 4px 0',
                      fontSize: '13px',
                      color: '#15803d',
                      fontWeight: '500',
                    }}
                  >
                    Total TVA
                  </p>
                  <p
                    style={{
                      margin: 0,
                      fontSize: '20px',
                      fontWeight: '700',
                      color: '#166534',
                    }}
                  >
                    {new Intl.NumberFormat('fr-FR', {
                      style: 'currency',
                      currency: 'EUR',
                    }).format(totals.totalTVA)}
                  </p>
                </div>
                <div>
                  <p
                    style={{
                      margin: '0 0 4px 0',
                      fontSize: '13px',
                      color: '#15803d',
                      fontWeight: '500',
                    }}
                  >
                    Total TTC
                  </p>
                  <p
                    style={{
                      margin: 0,
                      fontSize: '20px',
                      fontWeight: '700',
                      color: '#166534',
                    }}
                  >
                    {new Intl.NumberFormat('fr-FR', {
                      style: 'currency',
                      currency: 'EUR',
                    }).format(totals.totalTTC)}
                  </p>
                </div>
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
                  backgroundColor: loading ? '#9ca3af' : '#28a745',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  transition: 'all 0.2s ease',
                }}
                onMouseEnter={(e) => {
                  if (!loading) {
                    e.currentTarget.style.backgroundColor = '#218838';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!loading) {
                    e.currentTarget.style.backgroundColor = '#28a745';
                  }
                }}
              >
                {loading ? 'Enregistrement...' : 'Enregistrer'}
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
