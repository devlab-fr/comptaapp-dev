/*
  # Ajouter le champ payment_timing aux dépenses

  1. Objectif
    - Distinguer les dépenses immédiates (déjà payées) des dépenses différées (factures à payer)
    - Mode "immediate" → écriture directe 6xx/TVA/512
    - Mode "deferred" → écriture via 401 (comportement actuel)

  2. Nouveau champ
    - `payment_timing` (TEXT)
      - 'immediate' : dépense payée immédiatement (CB, espèces, virement)
      - 'deferred' : facture fournisseur à payer plus tard
      - DEFAULT 'immediate' pour nouvelles dépenses
      - NULL pour données existantes → traité comme 'deferred'

  3. Compatibilité
    - Données existantes : payment_timing NULL → comportement actuel préservé
    - Pas de migration agressive, ajout progressif uniquement
    - Aucun impact sur écritures existantes

  4. Sécurité
    - RLS existant s'applique automatiquement
    - Contrainte CHECK pour valeurs valides uniquement
*/

-- Ajouter le champ payment_timing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'expense_documents' AND column_name = 'payment_timing'
  ) THEN
    ALTER TABLE expense_documents ADD COLUMN payment_timing TEXT DEFAULT 'immediate';
  END IF;
END $$;

-- Ajouter contrainte de validation
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE table_name = 'expense_documents' AND constraint_name = 'expense_documents_payment_timing_check'
  ) THEN
    ALTER TABLE expense_documents
      ADD CONSTRAINT expense_documents_payment_timing_check
      CHECK (payment_timing IN ('immediate', 'deferred'));
  END IF;
END $$;
