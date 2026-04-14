/*
  # Ajouter le champ payment_timing aux revenus

  1. Objectif
    - Distinguer les revenus immédiats (déjà encaissés) des revenus différés (factures à encaisser)
    - Mode "immediate" → écriture directe 512/7xx/TVA
    - Mode "deferred" → écriture via 411 (comportement actuel)

  2. Nouveau champ
    - `payment_timing` (TEXT)
      - 'immediate' : revenu encaissé immédiatement (CB, espèces, virement)
      - 'deferred' : facture client à encaisser plus tard
      - PAS de DEFAULT : le frontend doit toujours envoyer la valeur explicitement
      - NULL pour données existantes → traité comme 'deferred' par les triggers

  3. Compatibilité
    - Données existantes : payment_timing = NULL → traité comme 'deferred' dans les triggers
    - Condition trigger : v_is_immediate := (payment_timing = 'immediate')
    - Si NULL ou 'deferred' → FALSE → mode deferred
    - Aucune migration agressive, aucune modification rétroactive

  4. Sécurité
    - RLS existant s'applique automatiquement
    - Contrainte CHECK pour valeurs valides uniquement (NULL accepté)
*/

-- Ajouter le champ payment_timing SANS DEFAULT
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'revenue_documents' AND column_name = 'payment_timing'
  ) THEN
    ALTER TABLE revenue_documents ADD COLUMN payment_timing TEXT;
  END IF;
END $$;

-- Ajouter contrainte de validation (NULL autorisé implicitement)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE table_name = 'revenue_documents' AND constraint_name = 'revenue_documents_payment_timing_check'
  ) THEN
    ALTER TABLE revenue_documents
      ADD CONSTRAINT revenue_documents_payment_timing_check
      CHECK (payment_timing IN ('immediate', 'deferred'));
  END IF;
END $$;
