import { useState, useEffect, useRef } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { getBankAccounts, getBankStatementLines, updateReconciliation, BankAccount, BankStatementLine } from '../banking/queries';
import { importCSVToBank } from '../banking/csvImport';
import { exportBankStatementCSV, exportReconciliationCSV, downloadCSV } from '../banking/csvExport';
import { CreateBankAccountDialog } from '../banking/components/CreateBankAccountDialog';
import { CreateBankEntryModal } from '../banking/components/CreateBankEntryModal';
import { BankReconciliationModal, MatchSuggestion } from '../banking/components/BankReconciliationModal';
import { applyBusinessRanking, normalize } from '../banking/rankingUtils';
import { supabase } from '../lib/supabase';
import BackButton from '../components/BackButton';
import Toast from '../components/Toast';
import { usePlan } from '../lib/usePlan';
import UpgradePrompt from '../components/UpgradePrompt';

export default function BankPage() {
  const { companyId } = useParams<{ companyId: string }>();
  const navigate = useNavigate();
  const { canUse, loading: planLoading } = usePlan(companyId);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [lines, setLines] = useState<BankStatementLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [editingLine, setEditingLine] = useState<string | null>(null);
  const [editMatchStatus, setEditMatchStatus] = useState<string>('unmatched');
  const [editNote, setEditNote] = useState<string>('');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [startDate, setStartDate] = useState<string>('');
  const [savedStartDate, setSavedStartDate] = useState<string>('');
  const [savingStartDate, setSavingStartDate] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [showCreateEntryModal, setShowCreateEntryModal] = useState(false);
  const [selectedLineForEntry, setSelectedLineForEntry] = useState<BankStatementLine | null>(null);
  const [openMenuLineId, setOpenMenuLineId] = useState<string | null>(null);
  const [showReconciliationModal, setShowReconciliationModal] = useState(false);
  const [selectedLineForReconciliation, setSelectedLineForReconciliation] = useState<BankStatementLine | null>(null);
  const [initialSuggestions, setInitialSuggestions] = useState<MatchSuggestion[]>([]);
  const [autoMatchingLineId, setAutoMatchingLineId] = useState<string | null>(null);
  const [autoMatchToast, setAutoMatchToast] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (companyId) {
      loadAccounts();
    } else {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    if (selectedAccountId && companyId) {
      loadLines();
      const selectedAccount = accounts.find(acc => acc.id === selectedAccountId);
      const accountStartDate = selectedAccount?.start_date || '';
      setStartDate(accountStartDate);
      setSavedStartDate(accountStartDate);
    }
  }, [selectedAccountId, companyId, accounts]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpenMenuLineId(null);
      }
    }

    if (openMenuLineId) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [openMenuLineId]);

  async function loadAccounts() {
    if (!companyId) return;
    try {
      setLoading(true);
      const data = await getBankAccounts(companyId);
      setAccounts(data);
      if (data.length > 0 && !selectedAccountId) {
        setSelectedAccountId(data[0].id);
      }
    } catch (err) {
      console.error('Error loading accounts:', err);
    } finally {
      setLoading(false);
    }
  }

  async function loadLines() {
    if (!selectedAccountId || !companyId) return;
    try {
      const data = await getBankStatementLines(companyId, selectedAccountId);
      setLines(data);
    } catch (err) {
      console.error('Error loading lines:', err);
    }
  }

  function handleCreateAccount() {
    setShowCreateDialog(true);
  }

  async function handleAccountCreated(accountId: string) {
    await loadAccounts();
    setSelectedAccountId(accountId);
  }

  async function handleImportCSV() {
    if (!companyId || !selectedAccountId) {
      alert('Veuillez sélectionner un compte bancaire');
      return;
    }

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv';
    input.onchange = async (e: Event) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file || !companyId) return;

      try {
        setImportStatus('Import en cours...');
        const content = await file.text();
        const result = await importCSVToBank(companyId, content, selectedAccountId);
        setImportStatus(`Importé: ${result.imported} | Doublons: ${result.duplicates} | Erreurs: ${result.errors.length}`);
        await loadLines();
        setTimeout(() => setImportStatus(null), 5000);
      } catch (err) {
        setImportStatus(`Erreur: ${err instanceof Error ? err.message : String(err)}`);
        setTimeout(() => setImportStatus(null), 5000);
      }
    };
    input.click();
  }

  function handleExportStatement() {
    const csv = exportBankStatementCSV(lines);
    downloadCSV(csv, `releve_${selectedAccountId}_${new Date().toISOString().split('T')[0]}.csv`);
  }

  function handleExportReconciliation() {
    const csv = exportReconciliationCSV(lines);
    downloadCSV(csv, `rapprochement_${selectedAccountId}_${new Date().toISOString().split('T')[0]}.csv`);
  }

  function startEditing(line: BankStatementLine) {
    setEditingLine(line.id);
    setEditMatchStatus(line.match_status || 'unmatched');
    setEditNote(line.note || '');
  }

  async function saveEditing() {
    if (!editingLine || !companyId) return;

    try {
      await updateReconciliation(companyId, editingLine, editMatchStatus, editNote || null);
      setEditingLine(null);
      await loadLines();
    } catch (err) {
      alert('Erreur lors de la mise à jour');
      console.error(err);
    }
  }

  function cancelEditing() {
    setEditingLine(null);
  }

  function handleCreateEntry(line: BankStatementLine) {
    setSelectedLineForEntry(line);
    setShowCreateEntryModal(true);
    setOpenMenuLineId(null);
  }

  function handleEntryCreated() {
    setShowCreateEntryModal(false);
    setSelectedLineForEntry(null);
    loadLines();
  }

  function handleViewEntry(entryId: string) {
    if (!companyId) return;
    navigate(`/app/company/${companyId}/accounting-entry/${entryId}`);
  }

  async function handleReconcile(line: BankStatementLine) {
    if (!companyId) return;

    // Protection anti-double validation
    if (autoMatchingLineId === line.id) return;

    setOpenMenuLineId(null);

    const AUTOMATCH_THRESHOLD = 95;

    try {
      // Appeler suggest_bank_matches UNE SEULE FOIS
      const { data, error: rpcError } = await supabase.rpc('suggest_bank_matches', {
        p_company_id: companyId,
        p_line_id: line.id,
        p_line_amount: line.amount_cents / 100,
        p_line_date: line.date,
        p_line_description: line.label,
      });

      if (rpcError) throw rpcError;

      const suggestions = (data || []) as MatchSuggestion[];

      // ÉTAPE 1 : Récupérer les comptes métier des suggestions (batch query)
      const entryIds = suggestions.map((s) => s.entry_id);
      const accountCodeMap = new Map<string, string>();

      if (entryIds.length > 0) {
        try {
          const { data: accountData } = await supabase
            .from('accounting_lines')
            .select('entry_id, chart_of_accounts!inner(code)')
            .in('entry_id', entryIds)
            .order('line_order');

          if (accountData) {
            // Filtrer les comptes pertinents et garder le premier par entry_id
            const processedEntries = new Set<string>();

            for (const row of accountData) {
              const code = (row.chart_of_accounts as any).code;
              const entryId = row.entry_id;

              // Ignorer 512
              if (code === '512') continue;

              // Si déjà traité, passer
              if (processedEntries.has(entryId)) continue;

              // Priorité 1 : 6xx / 7xx
              if (code.startsWith('6') || code.startsWith('7')) {
                accountCodeMap.set(entryId, code);
                processedEntries.add(entryId);
                continue;
              }

              // Priorité 2 : 401 / 411 (uniquement si pas déjà de 6xx/7xx)
              if (code === '401' || code === '411') {
                if (!accountCodeMap.has(entryId)) {
                  accountCodeMap.set(entryId, code);
                  processedEntries.add(entryId);
                }
              }
            }
          }
        } catch (err) {
          console.error('Error loading account codes:', err);
        }
      }

      // ÉTAPE 2 : Récupérer la mémoire utilisateur pour ce libellé bancaire
      let memoryAccountCode: string | null = null;
      try {
        const normalizedLabel = normalize(line.label);
        const { data: memoryData } = await supabase
          .from('bank_match_memory')
          .select('account_code')
          .eq('company_id', companyId)
          .eq('normalized_label', normalizedLabel)
          .order('usage_count', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (memoryData?.account_code) {
          memoryAccountCode = memoryData.account_code;
        }
      } catch (err) {
        console.error('Error loading memory:', err);
      }

      // ÉTAPE 3 : Appliquer le ranking métier local + mémoire ciblée
      const rankedSuggestions = applyBusinessRanking(suggestions, line, accountCodeMap, memoryAccountCode);

      // TEST AUTOMATCH AVANT TOUTE OUVERTURE MODALE
      let shouldAutoMatch = false;

      if (rankedSuggestions.length === 1) {
        // Cas 1 suggestion : comportement inchangé
        shouldAutoMatch =
          !!rankedSuggestions[0]?.entry_id &&
          rankedSuggestions[0].score >= AUTOMATCH_THRESHOLD &&
          !line.linked_accounting_entry_id;
      } else if (rankedSuggestions.length > 1) {
        // Cas plusieurs suggestions : automatch uniquement si écart significatif
        const top1 = rankedSuggestions[0];
        const top2 = rankedSuggestions[1];
        const scoreFinal1 = 'score_final' in top1 ? (top1 as any).score_final : (top1 as MatchSuggestion).score;
        const scoreFinal2 = 'score_final' in top2 ? (top2 as any).score_final : (top2 as MatchSuggestion).score;

        shouldAutoMatch =
          !!top1?.entry_id &&
          scoreFinal1 >= AUTOMATCH_THRESHOLD &&
          scoreFinal1 - scoreFinal2 >= 15 &&
          !line.linked_accounting_entry_id;
      }

      if (shouldAutoMatch) {
        // Automatch invisible - AUCUNE MODALE
        try {
          setAutoMatchingLineId(line.id);
          setAutoMatchToast(true);

          const { data: validateData, error: validateError } = await supabase.rpc('validate_bank_match', {
            p_company_id: companyId,
            p_entry_id: rankedSuggestions[0].entry_id,
            p_line_id: line.id,
          });

          if (validateError) throw validateError;

          const result = validateData as { success: boolean; error?: string };
          if (!result.success) {
            throw new Error(result.error || 'Erreur inconnue');
          }

          // Rafraîchir les lignes
          await loadLines();

          // Cacher toast après 2s
          setTimeout(() => setAutoMatchToast(false), 2000);
        } finally {
          setAutoMatchingLineId(null);
        }

        // STOP ICI - ne pas ouvrir la modale
        return;
      }

      // Fallback : ouvrir la modale uniquement si pas d'automatch
      setInitialSuggestions(rankedSuggestions);
      setSelectedLineForReconciliation(line);
      setShowReconciliationModal(true);
    } catch (err) {
      console.error('Error during reconciliation:', err);
      setAutoMatchingLineId(null);
      // En cas d'erreur, ouvrir la modale en fallback
      setInitialSuggestions([]);
      setSelectedLineForReconciliation(line);
      setShowReconciliationModal(true);
    }
  }

  function handleReconciliationSuccess() {
    setShowReconciliationModal(false);
    setSelectedLineForReconciliation(null);
    loadLines();
  }

  async function handleCancelReconciliation(lineId: string) {
    if (!companyId) return;
    try {
      const { data, error: rpcError } = await supabase.rpc('cancel_bank_match', {
        p_company_id: companyId,
        p_line_id: lineId,
      });

      if (rpcError) throw rpcError;

      const result = data as { success: boolean; error?: string };
      if (!result.success) {
        throw new Error(result.error || 'Erreur inconnue');
      }

      await loadLines();
      setOpenMenuLineId(null);
    } catch (err) {
      console.error('Error canceling reconciliation:', err);
      alert(err instanceof Error ? err.message : 'Erreur lors de l\'annulation');
    }
  }

  async function handleSaveStartDate() {
    if (!selectedAccountId || !companyId) return;

    try {
      setSavingStartDate(true);
      const { error } = await supabase
        .from('bank_accounts')
        .update({ start_date: startDate || null })
        .eq('id', selectedAccountId)
        .eq('company_id', companyId);

      if (error) throw error;

      setSavedStartDate(startDate);
      await loadAccounts();
      setShowToast(true);
    } catch (err) {
      console.error('Error saving start_date:', err);
      alert('Erreur lors de l\'enregistrement');
    } finally {
      setSavingStartDate(false);
    }
  }

  function formatAmount(cents: number): string {
    const amount = cents / 100;
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(amount);
  }

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('fr-FR');
  }

  if (!companyId) {
    return (
      <div className="bg-gray-50">
        <main className="container mx-auto px-4 py-8">
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <p className="text-gray-600 mb-4">Aucune entreprise sélectionnée.</p>
            <button
              onClick={() => navigate('/app')}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Retour aux entreprises
            </button>
          </div>
        </main>
      </div>
    );
  }

  if (planLoading || loading) {
    return (
      <div className="bg-gray-50">
        <main className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-center min-h-[60vh]">
            <p className="text-gray-600 text-lg">Chargement...</p>
          </div>
        </main>
      </div>
    );
  }

  if (!canUse('banking')) {
    return (
      <div className="bg-gray-50">
        <main className="container mx-auto px-4 py-8">
          <div className="mb-6">
            <BackButton />
          </div>
          <UpgradePrompt
            feature="Module Banque (import bancaire et rapprochement)"
            requiredPlan="PRO_PLUS"
          />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-gray-50 to-gray-100">
      <main className="container mx-auto px-4 py-10">
        <div className="mb-6">
          <BackButton />
        </div>

        <div className="mb-8 flex items-center justify-between">
          <h1 className="text-3xl font-bold text-gray-900">Banque</h1>
          <Link
            to={`/app/company/${companyId}/tresorerie`}
            className="px-3.5 py-2 border-2 border-blue-500 text-blue-600 bg-blue-500/5 rounded-lg hover:bg-blue-500/10 transition-all duration-150 font-medium"
          >
            Voir Trésorerie →
          </Link>
        </div>

        <div className="mb-6 bg-white rounded-xl shadow-md border border-gray-100 p-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Compte bancaire</h2>
          <div className="flex items-center gap-3 mb-4">
            <select
              value={selectedAccountId || ''}
              onChange={(e) => setSelectedAccountId(e.target.value)}
              className="flex-1 px-4 py-2 border-2 border-gray-200 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
            >
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.name}
                </option>
              ))}
            </select>
            <button
              onClick={handleCreateAccount}
              className="px-4 py-2 bg-white border-2 border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-colors whitespace-nowrap font-medium"
            >
              + Nouveau compte
            </button>
          </div>

          <div className="pt-4 border-t border-gray-100">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <label className="text-sm text-gray-600 whitespace-nowrap">
                Date de reprise comptable :
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full sm:w-auto px-3 py-1.5 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
              />
              <button
                onClick={handleSaveStartDate}
                disabled={savingStartDate || startDate === savedStartDate}
                className="w-full sm:w-auto px-4 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
              >
                {savingStartDate ? 'Enregistrement...' : 'Enregistrer'}
              </button>
            </div>
            {startDate === savedStartDate && !savingStartDate && (
              <p className="text-xs text-gray-500 mt-2">Aucun changement à enregistrer</p>
            )}
          </div>
        </div>

        <div className="mb-6 flex items-center gap-3">
          <button
            onClick={handleImportCSV}
            disabled={!selectedAccountId}
            className="px-6 py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            Importer CSV
          </button>
          <button
            onClick={handleExportStatement}
            disabled={lines.length === 0}
            className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Export relevé
          </button>
          <button
            onClick={handleExportReconciliation}
            disabled={lines.length === 0}
            className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Export rapprochement
          </button>
        </div>

        {importStatus && (
          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            {importStatus}
          </div>
        )}

        <div className="bg-white rounded-lg shadow overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Libellé</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Montant</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Statut</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Comptabilité</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Note</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {lines.map((line) => (
                <tr key={line.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {formatDate(line.date)}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900">
                    {line.label}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-right">
                    <span className={line.amount_cents >= 0 ? 'text-green-600' : 'text-red-600'}>
                      {formatAmount(line.amount_cents)}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    {editingLine === line.id ? (
                      <select
                        value={editMatchStatus}
                        onChange={(e) => setEditMatchStatus(e.target.value)}
                        className="px-2 py-1 border border-gray-300 rounded"
                      >
                        <option value="unmatched">Non rapproché</option>
                        <option value="partial">Partiel</option>
                        <option value="matched">Rapproché</option>
                      </select>
                    ) : (
                      <span className={`px-2 py-1 rounded ${
                        line.linked_accounting_entry_id ? 'bg-green-100 text-green-800' :
                        line.match_status === 'partial' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {line.linked_accounting_entry_id ? 'Rapproché' :
                         line.match_status === 'partial' ? 'Partiel' :
                         'Non rapproché'}
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    {line.linked_accounting_entry_id ? (
                      <span className="inline-flex items-center px-2 py-1 rounded bg-blue-100 text-blue-800">
                        Comptabilisé
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-1 rounded bg-gray-100 text-gray-600">
                        Non comptabilisé
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {editingLine === line.id ? (
                      <input
                        type="text"
                        value={editNote}
                        onChange={(e) => setEditNote(e.target.value)}
                        className="px-2 py-1 border border-gray-300 rounded w-full"
                        placeholder="Note..."
                      />
                    ) : (
                      line.note || '-'
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    {editingLine === line.id ? (
                      <div className="flex gap-2">
                        <button
                          onClick={saveEditing}
                          className="text-green-600 hover:text-green-800"
                        >
                          Enregistrer
                        </button>
                        <button
                          onClick={cancelEditing}
                          className="text-gray-600 hover:text-gray-800"
                        >
                          Annuler
                        </button>
                      </div>
                    ) : (
                      <div className="relative">
                        <button
                          onClick={() => setOpenMenuLineId(openMenuLineId === line.id ? null : line.id)}
                          className="p-1 hover:bg-gray-100 rounded transition-colors"
                        >
                          <svg className="w-5 h-5 text-gray-600" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                          </svg>
                        </button>
                        {openMenuLineId === line.id && (
                          <div
                            ref={menuRef}
                            className="absolute right-0 mt-1 w-56 bg-white rounded-lg shadow-xl border border-gray-200 z-10 flex flex-col py-1"
                          >
                            <button
                              onClick={() => {
                                startEditing(line);
                                setOpenMenuLineId(null);
                              }}
                              className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                            >
                              Modifier statut
                            </button>
                            {!line.linked_accounting_entry_id ? (
                              <>
                                <button
                                  onClick={() => handleReconcile(line)}
                                  className="w-full text-left px-4 py-2 text-sm text-green-600 hover:bg-green-50"
                                >
                                  Rapprocher automatiquement
                                </button>
                                <button
                                  onClick={() => handleCreateEntry(line)}
                                  className="w-full text-left px-4 py-2 text-sm text-blue-600 hover:bg-blue-50"
                                >
                                  Créer écriture comptable
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  onClick={() => {
                                    handleViewEntry(line.linked_accounting_entry_id!);
                                    setOpenMenuLineId(null);
                                  }}
                                  className="w-full text-left px-4 py-2 text-sm text-blue-600 hover:bg-blue-50"
                                >
                                  Voir écriture liée
                                </button>
                                <button
                                  onClick={() => handleCancelReconciliation(line.id)}
                                  className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                                >
                                  Annuler rapprochement
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {lines.length === 0 && (
            <div className="p-8 text-center text-gray-500">
              Aucune ligne bancaire. Importez un fichier CSV pour commencer.
            </div>
          )}
        </div>

        <CreateBankAccountDialog
          open={showCreateDialog}
          onOpenChange={setShowCreateDialog}
          companyId={companyId}
          onCreated={handleAccountCreated}
        />

        {showCreateEntryModal && selectedLineForEntry && (
          <CreateBankEntryModal
            open={showCreateEntryModal}
            onClose={() => {
              setShowCreateEntryModal(false);
              setSelectedLineForEntry(null);
            }}
            companyId={companyId}
            bankLine={selectedLineForEntry}
            onSuccess={handleEntryCreated}
          />
        )}

        {showToast && (
          <Toast
            message="Date de reprise enregistrée"
            type="success"
            onClose={() => setShowToast(false)}
          />
        )}

        {autoMatchToast && (
          <div className="fixed top-4 right-4 z-50 bg-green-600 text-white px-6 py-3 rounded-lg shadow-lg">
            Rapprochement automatique effectué
          </div>
        )}

        {showReconciliationModal && selectedLineForReconciliation && (
          <BankReconciliationModal
            open={showReconciliationModal}
            onClose={() => {
              setShowReconciliationModal(false);
              setSelectedLineForReconciliation(null);
              setInitialSuggestions([]);
            }}
            companyId={companyId}
            bankLine={selectedLineForReconciliation}
            onSuccess={handleReconciliationSuccess}
            initialSuggestions={initialSuggestions.length > 0 ? initialSuggestions : undefined}
          />
        )}
      </main>
    </div>
  );
}
