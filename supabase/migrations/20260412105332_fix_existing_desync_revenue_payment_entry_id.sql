/*
  # Correction des désynchronisations existantes : payment_entry_id orphelin sur revenue_documents

  ## Contexte
  3 documents de revenu ont été identifiés avec :
  - payment_status = 'unpaid'
  - payment_entry_id IS NOT NULL (vestige d'un état 'paid' antérieur)

  ## Documents traités

  ### Documents corrigibles (écriture BQ, non verrouillée, non rapprochée) :
  - 118aa2f6 → payment_entry_id = e6c56aa3 (journal BQ, non verrouillé, non rapproché)
  - fa154370 → payment_entry_id = a59f7964 (journal BQ, non verrouillé, non rapproché)

  ### Document non touché (écriture rapprochée bancairement) :
  - 11bd78f7 → payment_entry_id = 8b907c1e (bank_statement_line_id renseigné)
    → cette écriture est protégée : aucune action sur ce document

  ## Actions
  Pour les 2 documents corrigibles :
  1. Dissocier payment_entry_id sur le document
  2. Supprimer l'écriture de paiement orpheline (et ses lignes en CASCADE)

  ## Sécurité
  - Vérification explicite avant chaque suppression : journal BQ, non verrouillé, non rapproché
  - Le document 11bd78f7 est intentionnellement laissé en l'état
*/

DO $$
DECLARE
  v_entry_id uuid;
  v_journal_code text;
  v_is_locked boolean;
  v_bank_reconciled boolean;
BEGIN

  -- ============================================
  -- CAS 1 : document 118aa2f6, entry e6c56aa3
  -- ============================================
  v_entry_id := 'e6c56aa3-224b-4bce-971c-d371b9867dd9'::uuid;

  SELECT j.code, ae.is_locked, (ae.bank_statement_line_id IS NOT NULL)
  INTO v_journal_code, v_is_locked, v_bank_reconciled
  FROM accounting_entries ae
  JOIN journals j ON j.id = ae.journal_id
  WHERE ae.id = v_entry_id;

  IF FOUND AND v_journal_code = 'BQ' AND v_is_locked = false AND v_bank_reconciled = false THEN
    UPDATE revenue_documents SET payment_entry_id = NULL
    WHERE id = '118aa2f6-5c0a-4076-9a79-2caf78eb4931'::uuid;

    DELETE FROM accounting_entries WHERE id = v_entry_id;
  END IF;

  -- ============================================
  -- CAS 2 : document fa154370, entry a59f7964
  -- ============================================
  v_entry_id := 'a59f7964-66b8-443b-b9fe-be5da6c36780'::uuid;

  SELECT j.code, ae.is_locked, (ae.bank_statement_line_id IS NOT NULL)
  INTO v_journal_code, v_is_locked, v_bank_reconciled
  FROM accounting_entries ae
  JOIN journals j ON j.id = ae.journal_id
  WHERE ae.id = v_entry_id;

  IF FOUND AND v_journal_code = 'BQ' AND v_is_locked = false AND v_bank_reconciled = false THEN
    UPDATE revenue_documents SET payment_entry_id = NULL
    WHERE id = 'fa154370-c38c-41e8-88df-d93f78053d69'::uuid;

    DELETE FROM accounting_entries WHERE id = v_entry_id;
  END IF;

  -- ============================================
  -- CAS 3 : document 11bd78f7, entry 8b907c1e
  -- → bank_statement_line_id renseigné : non touché intentionnellement
  -- ============================================

END $$;
