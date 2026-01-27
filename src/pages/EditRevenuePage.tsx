import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import AppHeader from '../components/AppHeader';
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

export default function EditRevenuePage() {
  const { companyId, documentId } = useParams<{ companyId: string; documentId: string }>();
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [lines, setLines] = useState<RevenueLine[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [subcategoriesMap, setSubcategoriesMap] = useState<Record<string, Subcategory[]>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  useEffect(() => {
    loadDocument();
    loadCategories();
    loadAllSubcategories();
  }, [documentId]);

  const loadDocument = async () => {
    if (!documentId) return;

    setLoading(true);
    const { data: doc, error: docError } = await supabase
      .from('revenue_documents')
      .select('*')
      .eq('id', documentId)
      .single();

    if (docError || !doc) {
      setError('Document introuvable');
      setLoading(false);
      return;
    }

    setDate(doc.invoice_date);

    const { data: linesData, error: linesError } = await supabase
      .from('revenue_lines')
      .select('*')
      .eq('document_id', documentId)
      .order('line_order');

    if (!linesError && linesData) {
      setLines(
        linesData.map((line) => ({
          id: line.id,
          description: line.description,
          categoryId: line.category_id,
          subcategoryId: line.subcategory_id,
          amountHT: line.amount_excl_vat.toString(),
          tvaRate: line.vat_rate.toString(),
        }))
      );
    }

    setLoading(false);
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

    if (!companyId || !documentId) return;

    setError(null);
    setSaving(true);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const amountHTNum = parseFloat(line.amountHT);

      if (isNaN(amountHTNum) || amountHTNum < 0) {
        setError(`Ligne ${i + 1}: Le montant HT doit être un nombre positif`);
        setSaving(false);
        return;
      }

      if (!line.description.trim()) {
        setError(`Ligne ${i + 1}: Le libellé est requis`);
        setSaving(false);
        return;
      }

      if (!line.categoryId) {
        setError(`Ligne ${i + 1}: La catégorie est requise`);
        setSaving(false);
        return;
      }

      if (!line.subcategoryId) {
        setError(`Ligne ${i + 1}: La sous-catégorie est requise`);
        setSaving(false);
        return;
      }
    }

    const totals = calculateTotals();

    const { error: docError } = await supabase
      .from('revenue_documents')
      .update({
        invoice_date: date,
        total_excl_vat: totals.totalHT,
        total_vat: totals.totalTVA,
        total_incl_vat: totals.totalTTC,
      })
      .eq('id', documentId);

    if (docError) {
      setError('Erreur lors de la mise à jour du document');
      setSaving(false);
      return;
    }

    await supabase.from('revenue_lines').delete().eq('document_id', documentId);

    const lineInserts = lines.map((line, index) => {
      const amountHTNum = parseFloat(line.amountHT);
      const tvaRateNum = parseFloat(line.tvaRate);
      const tvaAmount = Math.round(amountHTNum * tvaRateNum * 100) / 100;
      const ttc = Math.round((amountHTNum + tvaAmount) * 100) / 100;

      return {
        document_id: documentId,
        description: line.description,
        category_id: line.categoryId,
        subcategory_id: line.subcategoryId,
        amount_excl_vat: amountHTNum,
        vat_rate: tvaRateNum,
        vat_amount: tvaAmount,
        amount_incl_vat: ttc,
        line_order: index,
      };
    });

    const { error: linesError } = await supabase.from('revenue_lines').insert(lineInserts);

    if (linesError) {
      setError("Erreur lors de l'ajout des lignes");
      setSaving(false);
      return;
    }

    navigate(`/app/company/${companyId}?success=revenue_updated`);
  };

  const totals = calculateTotals();

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#f8f9fa', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p>Chargement...</p>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8f9fa' }}>
      <AppHeader subtitle={user?.email} onSignOut={handleSignOut} />

      <main
        style={{
          maxWidth: '1000px',
          margin: '0 auto',
          padding: '32px 24px',
        }}
      >
        <button
          onClick={() => navigate(`/app/company/${companyId}`)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 12px',
            fontSize: '14px',
            fontWeight: '500',
            color: '#6b7280',
            backgroundColor: 'white',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            marginBottom: '24px',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#f9fafb';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'white';
          }}
        >
          <span>←</span>
          Retour
        </button>

        <div
          style={{
            padding: '32px',
            backgroundColor: 'white',
            borderRadius: '16px',
            boxShadow: '0 4px 6px rgba(0, 0, 0, 0.05)',
            marginBottom: '24px',
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
            Modifier le revenu
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
                        required
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
                            ? "Sélectionnez d'abord une catégorie"
                            : 'Sélectionnez une sous-catégorie'}
                        </option>
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
                disabled={saving}
                style={{
                  padding: '12px 24px',
                  fontSize: '14px',
                  fontWeight: '600',
                  color: 'white',
                  backgroundColor: saving ? '#9ca3af' : '#28a745',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: saving ? 'not-allowed' : 'pointer',
                  transition: 'all 0.2s ease',
                }}
                onMouseEnter={(e) => {
                  if (!saving) {
                    e.currentTarget.style.backgroundColor = '#218838';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!saving) {
                    e.currentTarget.style.backgroundColor = '#28a745';
                  }
                }}
              >
                {saving ? 'Enregistrement...' : 'Enregistrer'}
              </button>
            </div>
          </form>
        </div>

        <div
          style={{
            padding: '32px',
            backgroundColor: 'white',
            borderRadius: '16px',
            boxShadow: '0 4px 6px rgba(0, 0, 0, 0.05)',
          }}
        >
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
            recordId={documentId!}
            setToast={setToast}
          />
        </div>
      </main>
    </div>
  );
}
