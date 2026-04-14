/*
  # Phase 2 - Rapprochement bancaire semi-automatique

  1. Modifications
    - Ajout colonne `bank_statement_line_id` dans `accounting_entries`
    - Index unique pour éviter double rapprochement
    - Contrainte FK vers `bank_statement_lines`

  2. Fonctions SQL
    - `suggest_bank_matches` : suggère TOP 5 écritures correspondant à ligne bancaire
    - `validate_bank_match` : valide un rapprochement (lie écriture + ligne)
    - `cancel_bank_match` : annule un rapprochement existant

  3. Logique de matching
    - Exclusion journal BQ (via JOIN journals)
    - Calcul montant depuis accounting_lines (ABS(SUM(debit) - SUM(credit)))
    - Tolérance montant ±0.02€
    - Fenêtre date ±7 jours
    - Score : montant + proximité date + correspondance libellé
    - TOP 5 résultats

  4. Sécurité
    - Interdit double rapprochement (UNIQUE constraint)
    - Interdit écritures verrouillées (is_locked = true)
    - Interdit écritures déjà liées (bank_statement_line_id NOT NULL)
    - Vérification propriété company_id

  5. Compatibilité
    - Aucun impact sur triggers existants
    - Aucun impact sur génération automatique écritures
    - Colonne nullable : écritures existantes non impactées
*/

-- ============================================
-- 1. AJOUT COLONNE RAPPROCHEMENT
-- ============================================

ALTER TABLE accounting_entries
ADD COLUMN IF NOT EXISTS bank_statement_line_id uuid REFERENCES bank_statement_lines(id) ON DELETE SET NULL;

-- Index unique pour éviter double rapprochement
CREATE UNIQUE INDEX IF NOT EXISTS idx_accounting_entries_bank_line_unique
ON accounting_entries(bank_statement_line_id)
WHERE bank_statement_line_id IS NOT NULL;

-- Index performance pour recherche écritures non rapprochées
CREATE INDEX IF NOT EXISTS idx_accounting_entries_not_reconciled
ON accounting_entries(company_id, entry_date)
WHERE bank_statement_line_id IS NULL AND is_locked = false;

-- ============================================
-- 2. FONCTION SUGGESTION MATCHING
-- ============================================

CREATE OR REPLACE FUNCTION suggest_bank_matches(
  p_company_id uuid,
  p_line_id uuid,
  p_line_amount decimal,
  p_line_date date,
  p_line_description text
)
RETURNS TABLE (
  entry_id uuid,
  entry_number text,
  entry_date date,
  description text,
  montant_ecriture decimal,
  journal_code text,
  score int
) AS $$
DECLARE
  v_keyword text;
BEGIN
  -- Extraire premier mot significatif du libellé (>3 chars)
  v_keyword := COALESCE(
    (SELECT word FROM regexp_split_to_table(p_line_description, '\s+') AS word
     WHERE length(word) > 3 LIMIT 1),
    ''
  );

  RETURN QUERY
  WITH entry_totals AS (
    SELECT
      ae.id,
      ae.entry_number,
      ae.entry_date,
      ae.description,
      ae.journal_id,
      ae.is_locked,
      ae.bank_statement_line_id,
      j.code as journal_code,
      ABS(
        COALESCE(SUM(al.debit), 0) - COALESCE(SUM(al.credit), 0)
      ) as montant_calc
    FROM accounting_entries ae
    JOIN journals j ON j.id = ae.journal_id
    LEFT JOIN accounting_lines al ON al.entry_id = ae.id
    WHERE ae.company_id = p_company_id
      AND j.company_id = p_company_id
      AND ae.bank_statement_line_id IS NULL
      AND ae.is_locked = false
      AND j.code != 'BQ'
      AND ae.entry_date BETWEEN (p_line_date - INTERVAL '7 days') AND (p_line_date + INTERVAL '7 days')
    GROUP BY ae.id, ae.entry_number, ae.entry_date, ae.description, ae.journal_id, ae.is_locked, ae.bank_statement_line_id, j.code
  )
  SELECT
    et.id as entry_id,
    et.entry_number,
    et.entry_date,
    et.description,
    et.montant_calc as montant_ecriture,
    et.journal_code,
    (
      100 -- base score
      + (7 - ABS(EXTRACT(DAY FROM (et.entry_date - p_line_date))))::int * 5 -- proximité date (max +35)
      + CASE
          WHEN v_keyword != '' AND et.description ILIKE '%' || v_keyword || '%'
          THEN 15
          ELSE 0
        END -- bonus libellé
    ) as score
  FROM entry_totals et
  WHERE ABS(p_line_amount - et.montant_calc) <= 0.02
  ORDER BY score DESC, et.entry_date DESC
  LIMIT 5;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 3. FONCTION VALIDATION RAPPROCHEMENT
-- ============================================

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

  RETURN jsonb_build_object(
    'success', true,
    'entry_id', p_entry_id,
    'line_id', p_line_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 4. FONCTION ANNULATION RAPPROCHEMENT
-- ============================================

CREATE OR REPLACE FUNCTION cancel_bank_match(
  p_company_id uuid,
  p_line_id uuid
)
RETURNS jsonb AS $$
DECLARE
  v_entry_id uuid;
  v_line bank_statement_lines%ROWTYPE;
BEGIN
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

  -- Récupérer écriture liée
  SELECT id INTO v_entry_id
  FROM accounting_entries
  WHERE bank_statement_line_id = p_line_id
    AND company_id = p_company_id;

  IF v_entry_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Aucun rapprochement à annuler'
    );
  END IF;

  -- Vérifier écriture pas verrouillée
  IF EXISTS (
    SELECT 1 FROM accounting_entries
    WHERE id = v_entry_id AND is_locked = true
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Écriture verrouillée, impossible d''annuler le rapprochement'
    );
  END IF;

  -- Annuler le rapprochement
  UPDATE accounting_entries
  SET bank_statement_line_id = NULL
  WHERE id = v_entry_id;

  -- Mettre à jour statut rapprochement bancaire
  UPDATE bank_reconciliations
  SET match_status = 'unmatched',
      updated_at = now()
  WHERE bank_statement_line_id = p_line_id;

  RETURN jsonb_build_object(
    'success', true,
    'entry_id', v_entry_id,
    'line_id', p_line_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

/*
  USAGE :

  1. Obtenir suggestions pour ligne bancaire :
     SELECT * FROM suggest_bank_matches(
       'company-uuid',
       'line-uuid',
       150.00,
       '2024-03-15',
       'VIREMENT SALAIRE'
     );

  2. Valider rapprochement :
     SELECT validate_bank_match(
       'company-uuid',
       'entry-uuid',
       'line-uuid'
     );

  3. Annuler rapprochement :
     SELECT cancel_bank_match(
       'company-uuid',
       'line-uuid'
     );
*/