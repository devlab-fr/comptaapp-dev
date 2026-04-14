import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
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

interface ThirdParty {
  id: string;
  name: string;
  code: string | null;
}

interface ExpenseLine {
  id: string;
  description: string;
  categoryId: string;
  subcategoryId: string;
  amountHT: string;
  amountTTC: string;
  tvaRate: string;
}

export default function EditExpensePage() {
  const { companyId, documentId } = useParams<{ companyId: string; documentId: string }>();
  useAuth();
  const navigate = useNavigate();

  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [documentNumber, setDocumentNumber] = useState('');
  const [thirdPartyId, setThirdPartyId] = useState<string>('');
  const [thirdParties, setThirdParties] = useState<ThirdParty[]>([]);
  const [inputMode, setInputMode] = useState<'ht' | 'ttc'>('ht');
  const [lines, setLines] = useState<ExpenseLine[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [subcategoriesMap, setSubcategoriesMap] = useState<Record<string, Subcategory[]>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    loadDocument();
    loadCategories();
    loadAllSubcategories();
    loadThirdParties();
  }, [documentId]);

  const loadDocument = async () => {
    if (!documentId) return;

    setLoading(true);
    const { data: doc, error: docError } = await supabase
      .from('expense_documents')
      .select('*')
      .eq('id', documentId)
      .single();

    if (docError || !doc) {
      setError('Document introuvable');
      setLoading(false);
      return;
    }

    setDate(doc.invoice_date);
    setDocumentNumber(doc.document_number ?? '');
    setThirdPartyId(doc.third_party_id ?? '');

    const { data: linesData, error: linesError } = await supabase
      .from('expense_lines')
      .select('*')
      .eq('document_id', documentId)
      .order('line_order');

    if (!linesError && linesData) {
      setLines(
        linesData.map((line) => ({
          id: line.id,
          description: line.description,
          categoryId: line.category_id,
          subcategoryId: line.subcategory_id ?? '',
          amountHT: line.amount_excl_vat.toString(),
          amountTTC: line.amount_incl_vat.toString(),
          tvaRate: line.vat_rate.toString(),
        }))
      );
    }

    setLoading(false);
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
    }
  };

  const loadAllSubcategories = async () => {
    const { data, error: fetchError } = await supabase
      .from('expense_subcategories')
      .select('id, name, category_id, sort_order')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (!fetchError && data) {
      const map: Record<string, Subcategory[]> = {};
      data.forEach((sub) => {
        if (!map[sub.category_id]) {
          map[sub.category_id] = [];
        }
        map[sub.category_id].push({
          id: sub.id,
          name: sub.name,
          sort_order: sub.sort_order,
        });
      });
      setSubcategoriesMap(map);
    } else if (fetchError) {
      console.error('LOAD_EXPENSE_SUBCATEGORIES_ERROR', fetchError);
    }
  };

  const loadThirdParties = async () => {
    if (!companyId) return;
    const { data, error: fetchError } = await supabase
      .from('third_parties')
      .select('id, name, code')
      .eq('company_id', companyId)
      .eq('type', 'fournisseur')
      .order('name', { ascending: true });
    if (!fetchError && data) {
      setThirdParties(data);
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
        amountTTC: '',
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

  const updateLine = (id: string, field: keyof ExpenseLine, value: string) => {
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
    }

    const totals = calculateTotals();

    const docUpdate: Record<string, unknown> = {
      invoice_date: date,
      total_excl_vat: totals.totalHT,
      total_vat: totals.totalTVA,
      total_incl_vat: totals.totalTTC,
      third_party_id: thirdPartyId || null,
    };

    if (documentNumber.trim()) {
      docUpdate.document_number = documentNumber.trim();
    } else {
      docUpdate.document_number = null;
    }

    const { error: docError } = await supabase
      .from('expense_documents')
      .update(docUpdate)
      .eq('id', documentId);

    if (docError) {
      setError('Erreur lors de la mise à jour du document');
      setSaving(false);
      return;
    }

    await supabase.from('expense_lines').delete().eq('document_id', documentId);

    const lineInserts = lines.map((line, index) => {
      const amountHTNum = parseFloat(line.amountHT);
      const tvaRateNum = parseFloat(line.tvaRate);
      const tvaAmount = Math.round(amountHTNum * tvaRateNum * 100) / 100;
      const ttc = Math.round((amountHTNum + tvaAmount) * 100) / 100;

      return {
        document_id: documentId,
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

    const { error: linesError } = await supabase.from('expense_lines').insert(lineInserts);

    if (linesError) {
      setError("Erreur lors de l'ajout des lignes");
      setSaving(false);
      return;
    }

    navigate(`/app/company/${companyId}?success=expense_updated`);
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
            Modifier la dépense
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
                Réf. document fournisseur
                <span style={{ marginLeft: '6px', fontSize: '12px', color: '#9ca3af', fontWeight: '400' }}>(optionnel)</span>
              </label>
              <input
                type="text"
                value={documentNumber}
                onChange={(e) => setDocumentNumber(e.target.value)}
                placeholder="N° de facture fournisseur"
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
                Fournisseur
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
                onFocus={(e) => { e.currentTarget.style.borderColor = '#dc2626'; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = '#d1d5db'; }}
              >
                <option value="">— Aucun fournisseur —</option>
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
                  Lignes de dépense
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
                      color: '#dc2626',
                      backgroundColor: 'white',
                      border: '1px solid #dc2626',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = '#fef2f2';
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
                        placeholder="Description de la dépense"
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
                          e.currentTarget.style.borderColor = '#dc2626';
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
                            e.currentTarget.style.borderColor = '#dc2626';
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
                        <option value="">Aucune sous-catégorie</option>
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
                            e.currentTarget.style.borderColor = '#dc2626';
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
                  backgroundColor: saving ? '#9ca3af' : '#dc2626',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: saving ? 'not-allowed' : 'pointer',
                  transition: 'all 0.2s ease',
                }}
                onMouseEnter={(e) => {
                  if (!saving) {
                    e.currentTarget.style.backgroundColor = '#b91c1c';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!saving) {
                    e.currentTarget.style.backgroundColor = '#dc2626';
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
            recordType="expense_documents"
            recordId={documentId!}
            setToast={setToast}
          />
        </div>
      </main>
    </div>
  );
}
