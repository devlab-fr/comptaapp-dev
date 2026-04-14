import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { BankStatementLine } from '../queries';

interface CreateBankEntryModalProps {
  open: boolean;
  onClose: () => void;
  companyId: string;
  bankLine: BankStatementLine;
  onSuccess: () => void;
}

interface ChartAccount {
  id: string;
  code: string;
  name: string;
  type: string;
}

export function CreateBankEntryModal({
  open,
  onClose,
  companyId,
  bankLine,
  onSuccess,
}: CreateBankEntryModalProps) {
  const [accounts, setAccounts] = useState<ChartAccount[]>([]);
  const [selectedAccountCode, setSelectedAccountCode] = useState<string>('');
  const [label, setLabel] = useState<string>(bankLine.label);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isCredit = bankLine.amount_cents > 0;
  const amountEuros = Math.abs(bankLine.amount_cents) / 100;

  useEffect(() => {
    if (open && companyId) {
      loadAccounts();
    }
  }, [open, companyId]);

  async function loadAccounts() {
    try {
      const accountType = isCredit ? 'produit' : 'charge';

      const { data, error: fetchError } = await supabase
        .from('chart_of_accounts')
        .select('id, code, name, type')
        .eq('company_id', companyId)
        .eq('type', accountType)
        .eq('is_active', true)
        .order('code', { ascending: true });

      if (fetchError) throw fetchError;

      setAccounts(data || []);
    } catch (err) {
      console.error('Erreur lors du chargement des comptes:', err);
      setError('Impossible de charger les comptes comptables');
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!selectedAccountCode) {
      setError('Veuillez sélectionner un compte');
      return;
    }

    if (!label.trim()) {
      setError('Veuillez saisir un libellé');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { createBankAccountingEntry } = await import('../queries');

      await createBankAccountingEntry(
        companyId,
        bankLine.id,
        selectedAccountCode,
        label.trim()
      );

      onSuccess();
      onClose();
    } catch (err) {
      console.error('Erreur:', err);
      setError(err instanceof Error ? err.message : 'Erreur lors de la création');
    } finally {
      setLoading(false);
    }
  }

  function handleCancel() {
    setError(null);
    setSelectedAccountCode('');
    setLabel(bankLine.label);
    onClose();
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
        <h2 className="text-xl font-bold text-gray-900 mb-4">
          Créer écriture comptable
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Date
            </label>
            <input
              type="text"
              value={new Date(bankLine.date).toLocaleDateString('fr-FR')}
              readOnly
              className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-600"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Montant
            </label>
            <input
              type="text"
              value={new Intl.NumberFormat('fr-FR', {
                style: 'currency',
                currency: 'EUR',
              }).format(amountEuros)}
              readOnly
              className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-600"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Type
            </label>
            <input
              type="text"
              value={isCredit ? 'Crédit (recette)' : 'Débit (dépense)'}
              readOnly
              className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-600"
            />
          </div>

          <div>
            <label htmlFor="account" className="block text-sm font-medium text-gray-700 mb-1">
              Compte comptable *
            </label>
            <select
              id="account"
              value={selectedAccountCode}
              onChange={(e) => setSelectedAccountCode(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              disabled={loading}
              required
            >
              <option value="">Sélectionnez un compte...</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.code}>
                  {account.code} - {account.name}
                </option>
              ))}
            </select>
            {accounts.length === 0 && (
              <p className="text-sm text-gray-500 mt-1">
                Aucun compte {isCredit ? 'produit' : 'charge'} disponible
              </p>
            )}
          </div>

          <div>
            <label htmlFor="label" className="block text-sm font-medium text-gray-700 mb-1">
              Libellé *
            </label>
            <input
              id="label"
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              disabled={loading}
              required
              maxLength={200}
            />
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={handleCancel}
              disabled={loading}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={loading || !selectedAccountCode || !label.trim()}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Création...' : 'Créer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
