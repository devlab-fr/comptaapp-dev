import { useState, useEffect } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { getBankAccounts, BankAccount } from '../banking/queries';
import { calculateTreasuryBalance, TreasuryBalance } from '../treasury/calculations';
import BackButton from '../components/BackButton';

export default function TreasuryPage() {
  const { companyId } = useParams<{ companyId: string }>();
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [balance, setBalance] = useState<TreasuryBalance | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (companyId) {
      loadAccounts();
    } else {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    if (selectedAccountId && companyId) {
      loadBalance();
    }
  }, [selectedAccountId, companyId]);

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

  async function loadBalance() {
    if (!selectedAccountId || !companyId) return;
    try {
      const data = await calculateTreasuryBalance(companyId, selectedAccountId);
      setBalance(data);
    } catch (err) {
      console.error('Error loading balance:', err);
    }
  }

  function formatAmount(cents: number): string {
    const amount = cents / 100;
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(amount);
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

  if (loading) {
    return (
      <div className="bg-gray-50">
        <main className="container mx-auto px-4 py-8">
          <p>Chargement...</p>
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
          <h1 className="text-3xl font-bold text-gray-900">Trésorerie</h1>
          <Link
            to={`/app/company/${companyId}/banque`}
            className="px-3.5 py-2 border-2 border-blue-500 text-blue-600 bg-blue-500/5 rounded-lg hover:bg-blue-500/10 transition-all duration-150 font-medium"
          >
            Gérer Banque →
          </Link>
        </div>

        <div className="mb-6 bg-white rounded-xl shadow-md border border-gray-100 p-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Compte bancaire</h2>
          <select
            value={selectedAccountId || ''}
            onChange={(e) => setSelectedAccountId(e.target.value)}
            className="w-full md:w-auto px-4 py-2 border-2 border-gray-200 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
          >
            {accounts.map((acc) => (
              <option key={acc.id} value={acc.id}>
                {acc.name}
              </option>
            ))}
          </select>
          <p className="text-sm text-gray-500 mt-3">Montants affichés : solde bancaire (TTC)</p>
        </div>

        {balance && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-6 border-l-4 border-l-blue-500">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Solde réel</h3>
              <p className="text-4xl font-bold text-gray-900 mb-2">
                {formatAmount(balance.real)}
              </p>
              <p className="text-xs text-gray-500">
                Solde bancaire actuel
              </p>
            </div>

            <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-6 border-l-4 border-l-gray-300">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Solde théorique</h3>
              <p className="text-4xl font-bold text-gray-900 mb-2">
                {formatAmount(balance.theoretical || 0)}
              </p>
              <p className="text-xs text-gray-500">
                Validé + Payé uniquement
                {balance.startDate && (
                  <>
                    {' '}(à partir du{' '}
                    {new Intl.DateTimeFormat('fr-FR', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric'
                    }).format(new Date(balance.startDate))})
                  </>
                )}
              </p>
            </div>

            <div className={`bg-white rounded-xl shadow-lg border border-gray-100 p-6 border-l-4 ${
              (balance.gap || 0) === 0
                ? 'border-l-green-500'
                : (balance.gap || 0) > 0
                ? 'border-l-orange-500'
                : 'border-l-red-500'
            }`}>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Écart</h3>
              <p className={`text-4xl font-bold mb-2 ${
                (balance.gap || 0) === 0 ? 'text-green-600' :
                (balance.gap || 0) > 0 ? 'text-orange-600' :
                'text-red-600'
              }`}>
                {formatAmount(balance.gap || 0)}
              </p>
              <p className="text-xs text-gray-500">
                Réel - Théorique
              </p>
            </div>
          </div>
        )}

        {accounts.length === 0 && (
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <p className="text-gray-600 mb-4">
              Aucun compte bancaire configuré.
            </p>
            <Link
              to={`/app/company/${companyId}/banque`}
              className="inline-block px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Créer un compte bancaire
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}
