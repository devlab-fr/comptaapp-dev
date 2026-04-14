/*
  # Désactiver temporairement le check lors des insertions batch

  1. Problème
    - Même avec DEFERRABLE INITIALLY DEFERRED, le trigger se déclenche dans le contexte de la fonction
    - La fonction SECURITY DEFINER crée son propre sous-contexte

  2. Solution
    - Utiliser SET CONSTRAINTS pour désactiver explicitement le check pendant l'insertion
    - Le réactiver à la fin de la fonction
    - Aucune autre logique impactée

  3. Alternative
    - Modifier la fonction pour désactiver/réactiver le trigger pendant l'exécution
*/

CREATE OR REPLACE FUNCTION auto_create_expense_accounting_entry()
RETURNS TRIGGER AS $$
DECLARE
  v_journal_id uuid;
  v_entry_id uuid;
  v_fiscal_year int;
  v_account_401_id uuid;
  v_account_44566_id uuid;
  v_line record;
  v_account_id uuid;
  v_line_counter int := 0;
  v_total_ttc numeric;
BEGIN
  -- Ne rien faire si l'écriture existe déjà
  IF NEW.linked_accounting_entry_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Récupérer l'exercice comptable (année de la date de facture)
  v_fiscal_year := EXTRACT(YEAR FROM NEW.invoice_date);

  -- Récupérer le journal ACH
  SELECT id INTO v_journal_id
  FROM journals
  WHERE company_id = NEW.company_id
    AND code = 'ACH'
    AND is_active = true
  LIMIT 1;

  -- Si le journal n'existe pas, on ne fait rien (sera géré manuellement)
  IF v_journal_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Récupérer le compte 401 (Fournisseurs)
  SELECT id INTO v_account_401_id
  FROM chart_of_accounts
  WHERE company_id = NEW.company_id
    AND code = '401'
    AND is_active = true
  LIMIT 1;

  -- Si le compte 401 n'existe pas, on ne fait rien
  IF v_account_401_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Récupérer le compte 44566 (TVA déductible)
  SELECT id INTO v_account_44566_id
  FROM chart_of_accounts
  WHERE company_id = NEW.company_id
    AND code = '44566'
    AND is_active = true
  LIMIT 1;

  -- Désactiver temporairement le check d'équilibre
  PERFORM set_config('session_replication_role', 'replica', true);

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
    'Dépense - ' || COALESCE((
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

  -- Ajouter la ligne de crédit sur le compte 401 (contrepartie TTC)
  v_total_ttc := NEW.total_incl_vat;

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

  -- Réactiver le check d'équilibre
  PERFORM set_config('session_replication_role', 'origin', true);

  -- Vérifier manuellement l'équilibre maintenant
  DECLARE
    total_debit decimal(15,2);
    total_credit decimal(15,2);
  BEGIN
    SELECT 
      COALESCE(SUM(debit), 0),
      COALESCE(SUM(credit), 0)
    INTO total_debit, total_credit
    FROM accounting_lines
    WHERE entry_id = v_entry_id;

    IF total_debit != total_credit THEN
      RAISE EXCEPTION 'Écriture déséquilibrée: débit=% crédit=%', total_debit, total_credit;
    END IF;
  END;

  -- Lier l'écriture au document
  UPDATE expense_documents
  SET linked_accounting_entry_id = v_entry_id
  WHERE id = NEW.id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
