/*
  # Modifier le trigger d'achat pour gérer immediate vs deferred

  1. Objectif
    - Mode "immediate" : créer UNE SEULE écriture directe 6xx/TVA/512 (journal BQ)
    - Mode "deferred" : comportement actuel 6xx/TVA/401 (journal ACH)
    - Éviter toute duplication d'écriture

  2. Logique modifiée
    - Garde stricte : si linked_accounting_entry_id existe → RETURN
    - Si payment_timing = 'immediate' (ou NULL traité comme 'deferred')
      → Écriture directe dans journal BQ avec compte 512
      → PAS de passage par 401
      → Cette écriture compte comme l'écriture d'achat ET de paiement
    - Si payment_timing = 'deferred'
      → Comportement actuel (journal ACH, compte 401)

  3. Sécurité
    - Garde anti-duplication stricte en début de fonction
    - Gestion TVA identique dans les deux modes
    - Compatibilité avec données existantes (NULL → deferred)
*/

CREATE OR REPLACE FUNCTION auto_create_expense_accounting_entry()
RETURNS TRIGGER AS $$
DECLARE
  v_journal_id uuid;
  v_entry_id uuid;
  v_fiscal_year int;
  v_account_512_id uuid;
  v_account_401_id uuid;
  v_account_44566_id uuid;
  v_line record;
  v_account_id uuid;
  v_line_counter int := 0;
  v_total_ttc numeric;
  v_is_immediate boolean;
BEGIN
  -- GARDE ANTI-DUPLICATION : Si l'écriture existe déjà, ne rien faire
  IF NEW.linked_accounting_entry_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Déterminer le mode de paiement (NULL = deferred pour compatibilité)
  v_is_immediate := (NEW.payment_timing = 'immediate');

  -- Récupérer l'exercice comptable
  v_fiscal_year := EXTRACT(YEAR FROM NEW.invoice_date);

  -- Récupérer le journal approprié
  IF v_is_immediate THEN
    -- Mode immediate : utiliser le journal BQ (Banque)
    SELECT id INTO v_journal_id
    FROM journals
    WHERE company_id = NEW.company_id
      AND code = 'BQ'
      AND is_active = true
    LIMIT 1;
  ELSE
    -- Mode deferred : utiliser le journal ACH (Achats)
    SELECT id INTO v_journal_id
    FROM journals
    WHERE company_id = NEW.company_id
      AND code = 'ACH'
      AND is_active = true
    LIMIT 1;
  END IF;

  -- Si le journal n'existe pas, ne rien faire
  IF v_journal_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Récupérer le compte 44566 (TVA déductible)
  SELECT id INTO v_account_44566_id
  FROM chart_of_accounts
  WHERE company_id = NEW.company_id
    AND code = '44566'
    AND is_active = true
  LIMIT 1;

  -- Récupérer les comptes de contrepartie selon le mode
  IF v_is_immediate THEN
    -- Mode immediate : récupérer le compte 512 (Banque)
    SELECT id INTO v_account_512_id
    FROM chart_of_accounts
    WHERE company_id = NEW.company_id
      AND code = '512'
      AND is_active = true
    LIMIT 1;

    IF v_account_512_id IS NULL THEN
      RETURN NEW;
    END IF;
  ELSE
    -- Mode deferred : récupérer le compte 401 (Fournisseurs)
    SELECT id INTO v_account_401_id
    FROM chart_of_accounts
    WHERE company_id = NEW.company_id
      AND code = '401'
      AND is_active = true
    LIMIT 1;

    IF v_account_401_id IS NULL THEN
      RETURN NEW;
    END IF;
  END IF;

  -- Créer l'écriture comptable
  INSERT INTO accounting_entries (
    company_id,
    fiscal_year,
    journal_id,
    entry_date,
    description,
    created_by
  ) VALUES (
    NEW.company_id,
    v_fiscal_year,
    v_journal_id,
    NEW.invoice_date,
    CASE 
      WHEN v_is_immediate THEN 'Dépense immédiate - '
      ELSE 'Dépense - '
    END || COALESCE((
      SELECT description 
      FROM expense_lines 
      WHERE document_id = NEW.id 
      ORDER BY line_order 
      LIMIT 1
    ), 'Sans description'),
    auth.uid()
  )
  RETURNING id INTO v_entry_id;

  -- Générer les lignes comptables pour chaque ligne de dépense
  FOR v_line IN
    SELECT 
      el.description,
      el.amount_excl_vat,
      el.vat_rate,
      el.vat_amount,
      ec.account_code
    FROM expense_lines el
    JOIN expense_categories ec ON ec.id = el.category_id
    WHERE el.document_id = NEW.id
    ORDER BY el.line_order
  LOOP
    v_line_counter := v_line_counter + 1;

    -- Récupérer l'ID du compte de charge
    SELECT id INTO v_account_id
    FROM chart_of_accounts
    WHERE company_id = NEW.company_id
      AND code = v_line.account_code
      AND is_active = true
    LIMIT 1;

    -- Si le compte existe, créer la ligne de débit HT
    IF v_account_id IS NOT NULL THEN
      INSERT INTO accounting_lines (
        entry_id,
        account_id,
        label,
        debit,
        credit,
        vat_rate,
        line_order
      ) VALUES (
        v_entry_id,
        v_account_id,
        v_line.description,
        v_line.amount_excl_vat,
        0,
        v_line.vat_rate,
        v_line_counter
      );

      v_line_counter := v_line_counter + 1;

      -- Si TVA > 0, créer la ligne de débit TVA
      IF v_line.vat_amount > 0 AND v_account_44566_id IS NOT NULL THEN
        INSERT INTO accounting_lines (
          entry_id,
          account_id,
          label,
          debit,
          credit,
          vat_rate,
          line_order
        ) VALUES (
          v_entry_id,
          v_account_44566_id,
          'TVA déductible - ' || v_line.description,
          v_line.vat_amount,
          0,
          v_line.vat_rate,
          v_line_counter
        );

        v_line_counter := v_line_counter + 1;
      END IF;
    END IF;
  END LOOP;

  -- Ajouter la ligne de crédit selon le mode
  v_total_ttc := NEW.total_incl_vat;

  IF v_is_immediate THEN
    -- Mode immediate : crédit sur 512 (Banque)
    INSERT INTO accounting_lines (
      entry_id,
      account_id,
      label,
      debit,
      credit,
      line_order
    ) VALUES (
      v_entry_id,
      v_account_512_id,
      'Banque',
      0,
      v_total_ttc,
      v_line_counter + 1
    );
  ELSE
    -- Mode deferred : crédit sur 401 (Fournisseur)
    INSERT INTO accounting_lines (
      entry_id,
      account_id,
      label,
      debit,
      credit,
      line_order
    ) VALUES (
      v_entry_id,
      v_account_401_id,
      'Fournisseur',
      0,
      v_total_ttc,
      v_line_counter + 1
    );
  END IF;

  -- Lier l'écriture au document
  UPDATE expense_documents
  SET linked_accounting_entry_id = v_entry_id
  WHERE id = NEW.id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recréer le trigger (il est déjà présent, cette commande le remplace)
DROP TRIGGER IF EXISTS trigger_auto_expense_accounting_entry ON expense_documents;
CREATE TRIGGER trigger_auto_expense_accounting_entry
  AFTER INSERT ON expense_documents
  FOR EACH ROW
  EXECUTE FUNCTION auto_create_expense_accounting_entry();
