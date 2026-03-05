import { useState, useEffect } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { getBankAccounts, getBankStatementLines, updateReconciliation, BankAccount, BankStatementLine } from '../banking/queries';
import { importCSVToBank } from '../banking/csvImport';
import { exportBankStatementCSV, exportReconciliationCSV, downloadCSV } from '../banking/csvExport';
import { CreateBankAccountDialog } from '../banking/components/CreateBankAccountDialog';
import { supabase } from '../lib/supabase';
import Footer from '../components/Footer';
import BackButton from '../components/BackButton';
import Toast from '../components/Toast';

export default function BankPage() {
  const { companyId } = useParams<{ companyId: string }>();
  const navigate = useNavigate();
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
        <Footer />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="bg-gray-50">
        <main className="container mx-auto px-4 py-8">
          <p>Chargement...</p>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-br from-gray-50 to-gray-100">
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
                        line.match_status === 'matched' ? 'bg-green-100 text-green-800' :
                        line.match_status === 'partial' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {line.match_status === 'matched' ? 'Rapproché' :
                         line.match_status === 'partial' ? 'Partiel' :
                         'Non rapproché'}
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
                      <button
                        onClick={() => startEditing(line)}
                        className="text-blue-600 hover:text-blue-800"
                      >
                        Modifier
                      </button>
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

        {showToast && (
          <Toast
            message="Date de reprise enregistrée"
            type="success"
            onClose={() => setShowToast(false)}
          />
        )}
      </main>
      <Footer />
    </div>
  );
}
