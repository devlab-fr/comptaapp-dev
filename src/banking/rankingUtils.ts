import { MatchSuggestion } from './components/BankReconciliationModal';
import { BankStatementLine } from './queries';

// Type local pour enrichir les suggestions avec le score final
type RankedSuggestion = MatchSuggestion & { score_final: number };

// Mots vides fréquents à exclure
const STOP_WORDS = ['paiement', 'transaction', 'bancaire', 'virement', 'carte', 'sepa'];

// Descriptions génériques
const GENERIC_DESCRIPTIONS = [
  'paiement - revenu',
  'paiement - dépense',
  'paiement - depense',
  'paiement revenu',
  'paiement depense',
];

/**
 * Normalise un texte pour comparaison
 */
export function normalize(text: string): string {
  return text.toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * Extrait les mots significatifs (longueur >= 4, hors mots vides)
 */
function extractSignificantWords(text: string): string[] {
  const normalized = normalize(text);
  return normalized
    .split(' ')
    .filter((word) => word.length >= 4 && !STOP_WORDS.includes(word));
}

/**
 * Compte les mots communs entre deux textes
 */
function countCommonWords(text1: string, text2: string): number {
  const words1 = extractSignificantWords(text1);
  const words2 = extractSignificantWords(text2);

  const set1 = new Set(words1);
  let count = 0;

  for (const word of words2) {
    if (set1.has(word)) {
      count++;
    }
  }

  return count;
}

/**
 * Vérifie si une description est générique
 */
function isGenericDescription(description: string): boolean {
  const normalized = normalize(description);
  return GENERIC_DESCRIPTIONS.some((generic) => normalized.includes(generic));
}

/**
 * Calcule les bonus locaux basés sur des règles métier
 */
function calculateLocalBonus(
  suggestion: MatchSuggestion,
  bankLine: BankStatementLine,
  suggestionAccountCode?: string,
  memoryAccountCode?: string | null
): number {
  let bonus = 0;

  const normalizedLabel = normalize(bankLine.label);
  const normalizedDescription = normalize(suggestion.description);

  // BONUS A — Égalité exacte normalisée (+20)
  if (normalizedLabel === normalizedDescription) {
    bonus += 20;
  }

  // BONUS B — Inclusion forte (+15)
  // Description contient le libellé bancaire (pas l'inverse pour éviter les faux positifs)
  if (normalizedDescription.includes(normalizedLabel) && normalizedLabel.length >= 5) {
    bonus += 15;
  }

  // BONUS C — Mots significatifs communs (+10 si >= 2 mots)
  const commonWords = countCommonWords(bankLine.label, suggestion.description);
  if (commonWords >= 2) {
    bonus += 10;
  }

  // BONUS D — Description spécifique (+10)
  if (!isGenericDescription(suggestion.description)) {
    bonus += 10;
  }

  // BONUS E — Cohérence métier (+10)
  // Client + revenu
  if (normalizedLabel.includes('client') &&
      (normalizedDescription.includes('client') || normalizedDescription.includes('revenu'))) {
    bonus += 10;
  }

  // Dépenses typiques
  const expenseKeywords = ['loyer', 'edf', 'achat', 'cb', 'prlv', 'prelevement'];
  const hasExpenseKeyword = expenseKeywords.some((kw) => normalizedLabel.includes(kw));
  if (hasExpenseKeyword && normalizedDescription.includes('depense')) {
    bonus += 10;
  }

  // BONUS F — Mémoire utilisateur (+25)
  if (suggestionAccountCode && memoryAccountCode && suggestionAccountCode === memoryAccountCode) {
    bonus += 25;
  }

  // Plafonner le bonus total à +55 maximum (30 local + 25 mémoire)
  return Math.min(bonus, 55);
}

/**
 * Applique un ranking métier local aux suggestions
 * Ajoute un score_final et trie les suggestions
 *
 * @param suggestions - Liste de suggestions du backend
 * @param bankLine - Ligne bancaire à rapprocher
 * @param accountCodeMap - Map entry_id -> account_code métier principal
 * @param memoryAccountCode - Code compte mémorisé pour ce libellé bancaire
 * @returns Nouveau tableau trié par score_final décroissant
 */
export function applyBusinessRanking(
  suggestions: MatchSuggestion[],
  bankLine: BankStatementLine,
  accountCodeMap?: Map<string, string>,
  memoryAccountCode?: string | null
): RankedSuggestion[] {
  try {
    // Cas 0 suggestion : retourner tableau vide
    if (!suggestions || suggestions.length === 0) {
      return [];
    }

    // Enrichir chaque suggestion avec score_final
    const rankedSuggestions: RankedSuggestion[] = suggestions.map((suggestion) => {
      const suggestionAccountCode = accountCodeMap?.get(suggestion.entry_id);
      const localBonus = calculateLocalBonus(
        suggestion,
        bankLine,
        suggestionAccountCode,
        memoryAccountCode
      );
      const score_final = suggestion.score + localBonus;

      return {
        ...suggestion,
        score_final,
      };
    });

    // Trier par score_final décroissant (tri stable)
    rankedSuggestions.sort((a, b) => {
      // Tri décroissant sur score_final
      if (b.score_final !== a.score_final) {
        return b.score_final - a.score_final;
      }

      // Si égalité, maintenir l'ordre d'origine (tri stable)
      // En pratique, l'ordre SQL sera préservé
      return 0;
    });

    return rankedSuggestions;
  } catch (error) {
    // En cas d'erreur, retourner les suggestions d'origine sans modification
    console.error('Error in applyBusinessRanking:', error);
    return suggestions.map((s) => ({ ...s, score_final: s.score }));
  }
}
