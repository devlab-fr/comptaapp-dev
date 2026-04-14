import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import BackButton from '../components/BackButton';
import { useUserRole } from '../lib/useUserRole';

interface AccountingEntry {
  id: string;
  entry_number: string;
  entry_date: string;
  description: string;
  is_locked: boolean;
  locked_at?: string;
  locked_by?: string;
  created_at: string;
  created_by?: string;
  fiscal_year: number;
  journal_id: string;
  journals?: {
    code: string;
    name: string;
  } | null;
}

interface AccountingLine {
  id: string;
  label: string;
  debit: number;
  credit: number;
  line_order: number;
  chart_of_accounts?: {
    code: string;
    name: string;
  } | null;
}

interface SourceDocument {
  type: 'expense' | 'revenue';
  id: string;
  total_incl_vat: number;
  linkType: 'entry' | 'payment';
}

export default function ViewAccountingEntryPage() {
  const { companyId, entryId } = useParams<{ companyId: string; entryId: string }>();
  const navigate = useNavigate();
  const { canModify } = useUserRole(companyId);

  const [accountingEntry, setAccountingEntry] = useState<AccountingEntry | null>(null);
  const [accountingLines, setAccountingLines] = useState<AccountingLine[]>([]);
  const [sourceDocument, setSourceDocument] = useState<SourceDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [allEntries, setAllEntries] = useState<{ id: string; entry_number: string }[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(-1);

  useEffect(() => {
    if (companyId && entryId) {
      loadAllEntries();
      loadEntry();
    }
  }, [companyId, entryId]);

  useEffect(() => {
    if (allEntries.length > 0 && entryId) {
      const index = allEntries.findIndex((e) => e.id === entryId);
      setCurrentIndex(index);
    }
  }, [allEntries, entryId]);

  const loadAllEntries = async () => {
    try {
      if (!accountingEntry) {
        const { data: currentEntry } = await supabase
          .from('accounting_entries')
          .select('fiscal_year')
          .eq('id', entryId)
          .maybeSingle();

        if (currentEntry) {
          const { data, error } = await supabase
            .from('accounting_entries')
            .select('id, entry_number')
            .eq('company_id', companyId)
            .eq('fiscal_year', currentEntry.fiscal_year)
            .order('entry_date', { ascending: false });

          if (!error && data) {
            setAllEntries(data);
          }
        }
      } else {
        const { data, error } = await supabase
          .from('accounting_entries')
          .select('id, entry_number')
          .eq('company_id', companyId)
          .eq('fiscal_year', accountingEntry.fiscal_year)
          .order('entry_date', { ascending: false });

        if (!error && data) {
          setAllEntries(data);
        }
      }
    } catch (error) {
      console.error('Erreur lors du chargement de la liste des écritures:', error);
    }
  };

  const loadEntry = async () => {
    setLoading(true);
    try {
      const { data: entryData, error: entryError } = await supabase
        .from('accounting_entries')
        .select(`
          *,
          journals (code, name)
        `)
        .eq('id', entryId)
        .maybeSingle();

      if (entryError) throw entryError;
      if (!entryData) {
        setLoading(false);
        return;
      }
      setAccountingEntry(entryData);

      const { data: linesData } = await supabase
        .from('accounting_lines')
        .select(`
          id,
          label,
          debit,
          credit,
          line_order,
          account_id
        `)
        .eq('entry_id', entryId)
        .order('line_order', { ascending: true });

      if (linesData && linesData.length > 0) {
        const accountIds = [...new Set(linesData.map((line: any) => line.account_id))];

        const { data: accountsData } = await supabase
          .from('chart_of_accounts')
          .select('id, code, name')
          .in('id', accountIds);

        const accountsMap = new Map(
          (accountsData || []).map((acc: any) => [acc.id, { code: acc.code, name: acc.name }])
        );

        const mappedLines: AccountingLine[] = linesData.map((line: any) => ({
          id: line.id,
          label: line.label,
          debit: line.debit || 0,
          credit: line.credit || 0,
          line_order: line.line_order,
          chart_of_accounts: accountsMap.get(line.account_id) || null,
        }));
        setAccountingLines(mappedLines);
      }

      await loadSourceDocument();
    } catch (error) {
      console.error('Erreur lors du chargement de l\'écriture:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadSourceDocument = async () => {
    try {
      const { data: expenseData } = await supabase
        .from('expense_documents')
        .select('id, total_incl_vat, linked_accounting_entry_id, payment_entry_id')
        .or(`linked_accounting_entry_id.eq.${entryId},payment_entry_id.eq.${entryId}`)
        .maybeSingle();

      if (expenseData) {
        setSourceDocument({
          type: 'expense',
          id: expenseData.id,
          total_incl_vat: expenseData.total_incl_vat,
          linkType: expenseData.linked_accounting_entry_id === entryId ? 'entry' : 'payment',
        });
        return;
      }

      const { data: revenueData } = await supabase
        .from('revenue_documents')
        .select('id, total_incl_vat, linked_accounting_entry_id, payment_entry_id')
        .or(`linked_accounting_entry_id.eq.${entryId},payment_entry_id.eq.${entryId}`)
        .maybeSingle();

      if (revenueData) {
        setSourceDocument({
          type: 'revenue',
          id: revenueData.id,
          total_incl_vat: revenueData.total_incl_vat,
          linkType: revenueData.linked_accounting_entry_id === entryId ? 'entry' : 'payment',
        });
      }
    } catch (error) {
      console.error('Erreur lors du chargement du document source:', error);
    }
  };

  const handleLockEntry = async () => {
    if (!canModify || !accountingEntry || accountingEntry.is_locked) return;

    const confirmLock = window.confirm('Verrouiller cette écriture comptable ? Une fois verrouillée, elle ne pourra plus être modifiée.');
    if (!confirmLock) return;

    try {
      const { error } = await supabase.rpc('lock_accounting_entry', {
        p_entry_id: entryId,
      });

      if (error) throw error;

      await loadEntry();
    } catch (error) {
      console.error('Erreur lors du verrouillage:', error);
      alert('Erreur lors du verrouillage de l\'écriture');
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '60px 20px', textAlign: 'center', color: '#6b7280' }}>
        Chargement...
      </div>
    );
  }

  if (!accountingEntry) {
    return (
      <div style={{ padding: '60px 20px', textAlign: 'center', color: '#6b7280' }}>
        Écriture comptable introuvable
      </div>
    );
  }

  const totalDebit = accountingLines.reduce((sum, line) => sum + (line.debit || 0), 0);
  const totalCredit = accountingLines.reduce((sum, line) => sum + (line.credit || 0), 0);
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01;

  const getEntryType = (journalCode: string | undefined) => {
    if (!journalCode) return { label: 'Non défini', color: '#e5e7eb', textColor: '#6b7280' };

    const code = journalCode.toUpperCase();
    if (code === 'ACH') return { label: 'Achat', color: '#fed7aa', textColor: '#92400e' };
    if (code === 'VT') return { label: 'Vente', color: '#d1fae5', textColor: '#065f46' };
    if (code === 'BQ') return { label: 'Banque', color: '#dbeafe', textColor: '#1e40af' };
    if (code === 'OD') return { label: 'Opération diverse', color: '#e5e7eb', textColor: '#374151' };

    return { label: 'Autre', color: '#e5e7eb', textColor: '#6b7280' };
  };

  const entryType = getEntryType(accountingEntry?.journals?.code);

  const hasPrevious = currentIndex > 0;
  const hasNext = currentIndex >= 0 && currentIndex < allEntries.length - 1;

  const handleNavigatePrevious = () => {
    if (hasPrevious) {
      const prevEntry = allEntries[currentIndex - 1];
      navigate(`/app/company/${companyId}/accounting-entry/${prevEntry.id}`);
    }
  };

  const handleNavigateNext = () => {
    if (hasNext) {
      const nextEntry = allEntries[currentIndex + 1];
      navigate(`/app/company/${companyId}/accounting-entry/${nextEntry.id}`);
    }
  };

  return (
    <div style={{ padding: '32px 20px', maxWidth: '1000px', margin: '0 auto' }}>
      <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '24px' }}>
        <BackButton />
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={handleNavigatePrevious}
            disabled={!hasPrevious}
            style={{
              padding: '8px 16px',
              backgroundColor: 'white',
              color: hasPrevious ? '#374151' : '#9ca3af',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '13px',
              fontWeight: '500',
              cursor: hasPrevious ? 'pointer' : 'not-allowed',
              opacity: hasPrevious ? 1 : 0.5,
            }}
          >
            ← Précédente
          </button>
          <button
            onClick={handleNavigateNext}
            disabled={!hasNext}
            style={{
              padding: '8px 16px',
              backgroundColor: 'white',
              color: hasNext ? '#374151' : '#9ca3af',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '13px',
              fontWeight: '500',
              cursor: hasNext ? 'pointer' : 'not-allowed',
              opacity: hasNext ? 1 : 0.5,
            }}
          >
            Suivante →
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px', gap: '16px', flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: '28px', fontWeight: '700', color: '#111827', margin: 0 }}>
          Écriture {accountingEntry.entry_number}
        </h1>
        {canModify && !accountingEntry.is_locked && (
          <button
            onClick={handleLockEntry}
            style={{
              padding: '10px 20px',
              backgroundColor: '#fef3c7',
              color: '#92400e',
              border: 'none',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer',
            }}
          >
            Verrouiller
          </button>
        )}
      </div>

      <div style={{ backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', padding: '24px', marginBottom: '24px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#111827', marginBottom: '16px' }}>
          Informations générales
        </h3>

        <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: '16px', fontSize: '14px' }}>
          <div style={{ color: '#6b7280', fontWeight: '500' }}>Numéro</div>
          <div style={{ color: '#111827' }}>{accountingEntry.entry_number}</div>

          <div style={{ color: '#6b7280', fontWeight: '500' }}>Date</div>
          <div style={{ color: '#111827' }}>
            {new Date(accountingEntry.entry_date).toLocaleDateString('fr-FR')}
          </div>

          <div style={{ color: '#6b7280', fontWeight: '500' }}>Journal</div>
          <div>
            <span style={{
              padding: '4px 12px',
              borderRadius: '6px',
              fontSize: '13px',
              fontWeight: '600',
              backgroundColor: '#dbeafe',
              color: '#1e40af',
            }}>
              {accountingEntry.journals?.code || '—'}
            </span>
            {accountingEntry.journals?.name && (
              <span style={{ marginLeft: '8px', color: '#6b7280', fontSize: '13px' }}>
                {accountingEntry.journals.name}
              </span>
            )}
          </div>

          <div style={{ color: '#6b7280', fontWeight: '500' }}>Type d'écriture</div>
          <div>
            <span style={{
              padding: '4px 12px',
              borderRadius: '6px',
              fontSize: '13px',
              fontWeight: '600',
              backgroundColor: entryType.color,
              color: entryType.textColor,
            }}>
              {entryType.label}
            </span>
          </div>

          <div style={{ color: '#6b7280', fontWeight: '500' }}>Description</div>
          <div style={{ color: '#111827' }}>{accountingEntry.description || '—'}</div>

          <div style={{ color: '#6b7280', fontWeight: '500' }}>Exercice fiscal</div>
          <div style={{ color: '#111827' }}>{accountingEntry.fiscal_year}</div>

          <div style={{ color: '#6b7280', fontWeight: '500' }}>Statut</div>
          <div>
            <span style={{
              padding: '4px 12px',
              borderRadius: '6px',
              fontSize: '13px',
              fontWeight: '600',
              backgroundColor: accountingEntry.is_locked ? '#fee2e2' : '#d1fae5',
              color: accountingEntry.is_locked ? '#991b1b' : '#065f46',
            }}>
              {accountingEntry.is_locked ? 'Verrouillée' : 'Non verrouillée'}
            </span>
          </div>

          {accountingEntry.is_locked && accountingEntry.locked_at && (
            <>
              <div style={{ color: '#6b7280', fontWeight: '500' }}>Date verrouillage</div>
              <div style={{ color: '#111827' }}>
                {new Date(accountingEntry.locked_at).toLocaleDateString('fr-FR')} à {new Date(accountingEntry.locked_at).toLocaleTimeString('fr-FR')}
              </div>
            </>
          )}

          <div style={{ color: '#6b7280', fontWeight: '500' }}>Date création</div>
          <div style={{ color: '#111827' }}>
            {new Date(accountingEntry.created_at).toLocaleDateString('fr-FR')} à {new Date(accountingEntry.created_at).toLocaleTimeString('fr-FR')}
          </div>
        </div>
      </div>

      <div style={{ backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', padding: '24px', marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#111827', margin: 0 }}>
            Lignes comptables
          </h3>
          <span style={{
            padding: '4px 12px',
            borderRadius: '6px',
            fontSize: '13px',
            fontWeight: '600',
            backgroundColor: isBalanced ? '#d1fae5' : '#fee2e2',
            color: isBalanced ? '#065f46' : '#991b1b',
          }}>
            {isBalanced ? 'Équilibrée' : `Non équilibrée (${new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(Math.abs(totalDebit - totalCredit))})`}
          </span>
        </div>

        {accountingLines.length === 0 ? (
          <p style={{ color: '#6b7280', fontSize: '14px', textAlign: 'center', padding: '24px' }}>
            Aucune ligne comptable
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                  <th style={{ padding: '12px 8px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>
                    Compte
                  </th>
                  <th style={{ padding: '12px 8px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>
                    Libellé
                  </th>
                  <th style={{ padding: '12px 8px', textAlign: 'right', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>
                    Débit
                  </th>
                  <th style={{ padding: '12px 8px', textAlign: 'right', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>
                    Crédit
                  </th>
                </tr>
              </thead>
              <tbody>
                {accountingLines.map((line) => (
                  <tr key={line.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                    <td style={{ padding: '12px 8px', fontSize: '13px', color: '#111827' }}>
                      <div style={{ fontFamily: 'monospace', fontWeight: '600', marginBottom: '2px' }}>
                        {line.chart_of_accounts?.code || '—'}
                      </div>
                      <div style={{ fontSize: '12px', color: '#6b7280' }}>
                        {line.chart_of_accounts?.name || ''}
                      </div>
                    </td>
                    <td style={{ padding: '12px 8px', fontSize: '13px', color: '#111827' }}>
                      {line.label}
                    </td>
                    <td style={{ padding: '12px 8px', fontSize: '13px', color: '#111827', textAlign: 'right', fontFamily: 'monospace' }}>
                      {line.debit > 0 ? new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(line.debit) : '—'}
                    </td>
                    <td style={{ padding: '12px 8px', fontSize: '13px', color: '#111827', textAlign: 'right', fontFamily: 'monospace' }}>
                      {line.credit > 0 ? new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(line.credit) : '—'}
                    </td>
                  </tr>
                ))}
                <tr style={{ borderTop: '2px solid #1f2937', backgroundColor: '#f3f4f6' }}>
                  <td colSpan={2} style={{ padding: '12px 8px', fontSize: '14px', color: '#111827', fontWeight: '700' }}>
                    Total
                  </td>
                  <td style={{ padding: '12px 8px', fontSize: '14px', color: '#111827', textAlign: 'right', fontWeight: '700', fontFamily: 'monospace' }}>
                    {new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(totalDebit)}
                  </td>
                  <td style={{ padding: '12px 8px', fontSize: '14px', color: '#111827', textAlign: 'right', fontWeight: '700', fontFamily: 'monospace' }}>
                    {new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(totalCredit)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div style={{ backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', padding: '24px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#111827', marginBottom: '16px' }}>
          Document source
        </h3>

        {!sourceDocument ? (
          <div style={{ textAlign: 'center', padding: '24px' }}>
            <p style={{ color: '#6b7280', fontSize: '14px', marginBottom: '4px' }}>
              Aucun document lié
            </p>
            <p style={{ color: '#9ca3af', fontSize: '13px', margin: 0 }}>
              (Écriture manuelle)
            </p>
          </div>
        ) : (
          <div style={{ padding: '16px', backgroundColor: '#f9fafb', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: '12px', fontSize: '14px', marginBottom: '16px' }}>
              <div style={{ color: '#6b7280', fontWeight: '500' }}>Type document</div>
              <div>
                <span style={{
                  padding: '4px 10px',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontWeight: '600',
                  backgroundColor: sourceDocument.type === 'expense' ? '#fef3c7' : '#d1fae5',
                  color: sourceDocument.type === 'expense' ? '#92400e' : '#065f46',
                }}>
                  {sourceDocument.type === 'expense' ? 'Dépense' : 'Revenu'}
                </span>
              </div>

              <div style={{ color: '#6b7280', fontWeight: '500' }}>Type lien</div>
              <div style={{ color: '#111827' }}>
                {sourceDocument.linkType === 'entry'
                  ? (sourceDocument.type === 'expense' ? 'Écriture d\'achat' : 'Écriture de vente')
                  : 'Écriture de paiement'
                }
              </div>

              <div style={{ color: '#6b7280', fontWeight: '500' }}>Montant TTC</div>
              <div style={{ color: '#111827', fontWeight: '600' }}>
                {new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(sourceDocument.total_incl_vat)}
              </div>
            </div>

            <button
              onClick={() => {
                const path = sourceDocument.type === 'expense'
                  ? `/app/company/${companyId}/expenses/${sourceDocument.id}`
                  : `/app/company/${companyId}/revenues/${sourceDocument.id}`;
                navigate(path);
              }}
              style={{
                padding: '10px 20px',
                backgroundColor: '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: '600',
                cursor: 'pointer',
              }}
            >
              Voir le document
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
