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
  tvaRate: string;
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
  const prefillReceiptUrl = searchParams.get('receipt_url') || '';
  const prefillReceiptStoragePath = searchParams.get('receipt_storage_path') || '';
  const prefillReceiptFilename = searchParams.get('receipt_filename') || '';

  const calculatedTVARate = prefillAmountHT && prefillVAT
    ? (parseFloat(prefillVAT) / parseFloat(prefillAmountHT)).toFixed(2)
    : '0.20';

  const [date, setDate] = useState(prefillDate);
  const [lines, setLines] = useState<RevenueLine[]>([
    {
      id: crypto.randomUUID(),
      description: prefillDescription || prefillClient || '',
      categoryId: prefillCategoryId || '',
      subcategoryId: prefillSubcategoryId || '',
      amountHT: prefillAmountHT || '',
      tvaRate: calculatedTVARate,
    },
  ]);
  const [receiptUrl] = useState(prefillReceiptUrl);
  const [receiptStoragePath] = useState(prefillReceiptStoragePath);
  const [receiptFilename] = useState(prefillReceiptFilename);
  const [categories, setCategories] = useState<Category[]>([]);
  const [subcategoriesMap, setSubcategoriesMap] = useState<Record<string, Subcategory[]>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdDocumentId, setCreatedDocumentId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
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

    loadCategories();
  }, []);

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

  const addLine = () => {
    setLines([
      ...lines,
      {
        id: crypto.randomUUID(),
        description: '',
        categoryId: '',
        subcategoryId: '',
        amountHT: '',
        tvaRate: '0.20',
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
        if (line.id === id) {
          const updated = { ...line, [field]: value };
          if (field === 'categoryId') {
            updated.subcategoryId = '';
          }
          return updated;
        }
        return line;
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
    }

    const totals = calculateTotals();

    const documentData: any = {
      company_id: companyId,
      invoice_date: date,
      total_excl_vat: totals.totalHT,
      total_vat: totals.totalTVA,
      total_incl_vat: totals.totalTTC,
      accounting_status: 'draft',
      payment_status: 'unpaid',
    };

    if (receiptUrl) {
      documentData.receipt_url = receiptUrl;
      documentData.receipt_storage_path = receiptStoragePath;
      documentData.receipt_filename = receiptFilename;
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
            Ajouter un revenu
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
                        Taux de TVA
                      </label>
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
