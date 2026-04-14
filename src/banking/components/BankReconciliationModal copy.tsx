import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { BankStatementLine } from '../queries';

const AUTOMATCH_THRESHOLD = 120;

export interface MatchSuggestion {
  entry_id: string;
  entry_number: string;
  entry_date: string;
  description: string;
  montant_ecriture: number;
  journal_code: string;
  score: number;
}

interface BankReconciliationModalProps {
  open: boolean;
  onClose: () => void;
  companyId: string;
  bankLine: BankStatementLine;
  onSuccess: () => void;
  initialSuggestions?: MatchSuggestion[];
}

export function BankReconciliationModal({
  open,
  onClose,
  companyId,
  bankLine,
  onSuccess,
  initialSuggestions,
}: BankReconciliationModalProps) {
  const [suggestions, setSuggestions] = useState<MatchSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoMatched, setAutoMatched] = useState(false);
  const [showAutoMatchToast, setShowAutoMatchToast] = useState(false);
  const [autoMatchComplete, setAutoMatchComplete] = useState(false);

  useEffect(() => {
    if (open && bankLine) {
      if (initialSuggestions) {
        setSuggestions(initialSuggestions);
      } else {
        loadSuggestions();
      }
      setAutoMatched(false);
      setAutoMatchComplete(false);
      setShowAutoMatchToast(false);
    }
  }, [open, bankLine, initialSuggestions]);

  useEffect(() => {
    if (
      !autoMatched &&
      !loading &&
      !validating &&
      suggestions.length === 1 &&
      suggestions[0]?.entry_id &&
      suggestions[0].score >= AUTOMATCH_THRESHOLD &&
      !bankLine.linked_accounting_entry_id
    ) {
      setAutoMatched(true);
      setShowAutoMatchToast(true);
      setTimeout(() => {
        handleValidate(suggestions[0].entry_id);
      }, 800);
    }
  }, [suggestions, autoMatched, loading, validating, bankLine.linked_accounting_entry_id]);

  async function loadSuggestions() {
    setLoading(true);
    setError(null);
    try {
      const { data, error: rpcError } = await supabase.rpc('suggest_bank_matches', {
        p_company_id: companyId,
        p_line_id: bankLine.id,
        p_line_amount: bankLine.amount_cents / 100,
        p_line_date: bankLine.date,
        p_line_description: bankLine.label,
      });

      if (rpcError) throw rpcError;
      setSuggestions(data || []);
    } catch (err) {
      console.error('Error loading suggestions:', err);
      setError('Erreur lors du chargement des suggestions');
    } finally {
      setLoading(false);
    }
  }

  async function handleValidate(entryId: string) {
    setValidating(true);
    setError(null);
    try {
      const { data, error: rpcError } = await supabase.rpc('validate_bank_match', {
        p_company_id: companyId,
        p_entry_id: entryId,
        p_line_id: bankLine.id,
      });

      if (rpcError) throw rpcError;

      const result = data as { success: boolean; error?: string };
      if (!result.success) {
        throw new Error(result.error || 'Erreur inconnue');
      }

      setAutoMatchComplete(true);
      onSuccess();
      onClose();
    } catch (err) {
      console.error('Error validating match:', err);
      setError(err instanceof Error ? err.message : 'Erreur lors de la validation');
    } finally {
      setValidating(false);
    }
  }

  function formatAmount(amount: number): string {
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(amount);
  }

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('fr-FR');
  }

  if (!open) return null;

  return (
    <>
      {showAutoMatchToast && (
        <div className="fixed top-4 right-4 z-[60] bg-green-600 text-white px-6 py-3 rounded-lg shadow-lg">
          {autoMatchComplete ? 'Rapprochement automatique effectué' : 'Rapprochement automatique en cours...'}
        </div>
      )}
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900">Rapprochement bancaire</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Ligne bancaire</h3>
          <div className="bg-white rounded-lg p-4 border border-gray-200">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <p className="text-sm text-gray-600">Date : {formatDate(bankLine.date)}</p>
                <p className="text-base font-medium text-gray-900 mt-1">{bankLine.label}</p>
              </div>
              <div className="text-right">
                <span className={`text-lg font-bold ${bankLine.amount_cents >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatAmount(bankLine.amount_cents / 100)}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">
            Suggestions d'écritures comptables ({suggestions.length})
          </h3>

          {loading ? (
            <div className="text-center py-8 text-gray-600">Recherche en cours...</div>
          ) : error ? (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
              {error}
            </div>
          ) : suggestions.length === 0 ? (
            <div className="text-center py-8 text-gray-600">
              Aucune écriture correspondante trouvée
            </div>
          ) : (
            <div className="space-y-3">
              {suggestions.map((suggestion) => (
                <div
                  key={suggestion.entry_id}
                  className="bg-white border border-gray-200 rounded-lg p-4 hover:border-blue-300 transition-colors"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium text-gray-900">
                        {suggestion.entry_number}
                      </span>
                      <span className="px-2 py-0.5 bg-gray-100 text-gray-700 text-xs rounded">
                        {suggestion.journal_code}
                      </span>
                      <span className="text-sm text-gray-600">
                        {formatDate(suggestion.entry_date)}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-semibold text-gray-900">
                        {formatAmount(suggestion.montant_ecriture)}
                      </span>
                      <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded font-medium">
                        Score: {suggestion.score}
                      </span>
                    </div>
                  </div>
                  <p className="text-sm text-gray-700 mb-3">{suggestion.description}</p>
                  <button
                    onClick={() => handleValidate(suggestion.entry_id)}
                    disabled={validating}
                    className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors font-medium"
                  >
                    {validating ? 'Validation...' : 'Valider ce rapprochement'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
    </>
  );
}
