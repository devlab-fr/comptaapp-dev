/*
  # Add memory capture to validate_bank_match (V3 Phase 1)

  1. Changes
    - Add non-blocking memory capture after successful bank match validation
    - Capture normalized label, business account code, and journal code
    - Increment usage_count on duplicate matches

  2. Memory Capture Logic
    - Normalize bank statement label: LOWER(TRIM(regexp_replace(label, '\s+', ' ', 'g')))
    - Select business account (6xx or 7xx class) from accounting lines
    - Fallback to 401/411 only if no business account exists
    - Never store account 512 (bank account)
    - Store journal code for context

  3. Non-Blocking Behavior
    - Memory capture wrapped in EXCEPTION block
    - Errors are silently ignored
    - Never rollback the bank match validation
    - Match validation always succeeds independently

  4. Notes
    - No changes to suggestion logic or scoring
    - No frontend modifications
    - Memory is passive storage only at this stage
*/

CREATE OR REPLACE FUNCTION validate_bank_match(
  p_company_id uuid,
  p_entry_id uuid,
  p_line_id uuid
)
RETURNS jsonb AS $$
DECLARE
  v_entry accounting_entries%ROWTYPE;
  v_line bank_statement_lines%ROWTYPE;
  v_result jsonb;
  v_normalized_label text;
  v_account_code text;
  v_journal_code text;
BEGIN
  -- Vérifier écriture existe et appartient à l'entreprise
  SELECT * INTO v_entry
  FROM accounting_entries
  WHERE id = p_entry_id AND company_id = p_company_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Écriture comptable non trouvée'
    );
  END IF;

  -- Vérifier ligne bancaire existe et appartient à l'entreprise
  SELECT bsl.* INTO v_line
  FROM bank_statement_lines bsl
  JOIN bank_accounts ba ON ba.id = bsl.bank_account_id
  WHERE bsl.id = p_line_id AND ba.company_id = p_company_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Ligne bancaire non trouvée'
    );
  END IF;

  -- Vérifier écriture pas déjà rapprochée
  IF v_entry.bank_statement_line_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Écriture déjà rapprochée'
    );
  END IF;

  -- Vérifier écriture pas verrouillée
  IF v_entry.is_locked THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Écriture verrouillée, modification impossible'
    );
  END IF;

  -- Vérifier ligne bancaire pas déjà rapprochée
  IF EXISTS (
    SELECT 1 FROM accounting_entries
    WHERE bank_statement_line_id = p_line_id
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Ligne bancaire déjà rapprochée'
    );
  END IF;

  -- Effectuer le rapprochement
  UPDATE accounting_entries
  SET bank_statement_line_id = p_line_id
  WHERE id = p_entry_id;

  -- Mettre à jour statut rapprochement bancaire
  UPDATE bank_reconciliations
  SET match_status = 'matched',
      updated_at = now()
  WHERE bank_statement_line_id = p_line_id;

  -- Si pas de ligne dans bank_reconciliations, la créer
  INSERT INTO bank_reconciliations (company_id, bank_statement_line_id, match_status)
  VALUES (p_company_id, p_line_id, 'matched')
  ON CONFLICT (bank_statement_line_id) DO UPDATE
  SET match_status = 'matched', updated_at = now();

  -- ============================================
  -- MEMORY CAPTURE (NON-BLOCKING)
  -- ============================================
  BEGIN
    -- Normaliser le libellé bancaire
    v_normalized_label := LOWER(TRIM(regexp_replace(v_line.label, '\s+', ' ', 'g')));

    -- Récupérer le code journal
    SELECT j.code INTO v_journal_code
    FROM journals j
    WHERE j.id = v_entry.journal_id;

    -- Sélectionner le compte métier approprié
    -- Priorité 1 : compte classe 6xx ou 7xx (comptes de charges/produits)
    -- Priorité 2 : compte 401 ou 411 (fournisseurs/clients) si aucun compte métier
    -- Exclusion : compte 512 (banque)
    SELECT coa.code INTO v_account_code
    FROM accounting_lines al
    JOIN chart_of_accounts coa ON coa.id = al.account_id
    WHERE al.entry_id = p_entry_id
      AND coa.code != '512'
      AND (
        (coa.code LIKE '6%' OR coa.code LIKE '7%')
        OR (coa.code IN ('401', '411'))
      )
    ORDER BY
      CASE
        WHEN coa.code LIKE '6%' OR coa.code LIKE '7%' THEN 1
        WHEN coa.code IN ('401', '411') THEN 2
        ELSE 3
      END,
      al.line_order
    LIMIT 1;

    -- Insérer ou mettre à jour la mémoire
    IF v_account_code IS NOT NULL AND v_journal_code IS NOT NULL THEN
      INSERT INTO bank_match_memory (
        company_id,
        normalized_label,
        account_code,
        journal_code,
        usage_count,
        last_used_at
      )
      VALUES (
        p_company_id,
        v_normalized_label,
        v_account_code,
        v_journal_code,
        1,
        now()
      )
      ON CONFLICT (company_id, normalized_label, account_code)
      DO UPDATE SET
        usage_count = bank_match_memory.usage_count + 1,
        last_used_at = now();
    END IF;

  EXCEPTION
    WHEN OTHERS THEN
      -- Ignorer silencieusement toute erreur de capture mémoire
      -- Le rapprochement bancaire reste valide
      NULL;
  END;

  RETURN jsonb_build_object(
    'success', true,
    'entry_id', p_entry_id,
    'line_id', p_line_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
