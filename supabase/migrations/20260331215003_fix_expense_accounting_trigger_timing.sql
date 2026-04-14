/*
  # Fix timing du trigger de génération comptable des dépenses

  1. Problème
    - Le trigger auto_create_expense_accounting_entry() s'exécute AFTER INSERT
    - À ce moment, les expense_lines n'existent pas encore
    - La boucle FOR ne trouve aucune ligne
    - Seul le crédit 401 est créé (pas de débits)
    - Écriture déséquilibrée → ERREUR

  2. Solution (même logique que revenue)
    - Créer auto_create_expense_accounting_entry_impl() : logique réelle
    - Créer auto_create_expense_accounting_entry_manual() : appel manuel après insertion lignes
    - Modifier auto_create_expense_accounting_entry() : vérifier flag skip
    - Ajouter vérification : au moins 1 expense_line présente

  3. Utilisation
    - Frontend doit faire :
      1. set_config('app.skip_expense_accounting_trigger', 'true', true)
      2. INSERT expense_document
      3. INSERT expense_lines
      4. set_config('app.skip_expense_accounting_trigger', 'false', true)
      5. SELECT auto_create_expense_accounting_entry_manual(document_id)

  4. Sécurité
    - Si aucune ligne trouvée, ne rien faire
    - Idempotence conservée (vérifie linked_accounting_entry_id)
*/

-- Fonction implémentation : logique réelle de création de l'écriture
CREATE OR REPLACE FUNCTION auto_create_expense_accounting_entry_impl(p_document expense_documents)
RETURNS void AS $$
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
  v_line_count int;
BEGIN
  -- Ne rien faire si l'écriture existe déjà
  IF p_document.linked_accounting_entry_id IS NOT NULL THEN
    RETURN;
  END IF;

  -- SÉCURITÉ : Vérifier qu'il existe au moins 1 expense_line
  SELECT COUNT(*) INTO v_line_count
  FROM expense_lines
  WHERE document_id = p_document.id;

  IF v_line_count = 0 THEN
    -- Pas de lignes, on ne fait rien
    RETURN;
  END IF;

  -- Récupérer l'exercice comptable
  v_fiscal_year := EXTRACT(YEAR FROM p_document.invoice_date);

  -- Récupérer le journal ACH
  SELECT id INTO v_journal_id
  FROM journals
  WHERE company_id = p_document.company_id
    AND code = 'ACH'
    AND is_active = true
  LIMIT 1;

  IF v_journal_id IS NULL THEN
    RETURN;
  END IF;

  -- Récupérer le compte 401 (Fournisseurs)
  SELECT id INTO v_account_401_id
  FROM chart_of_accounts
  WHERE company_id = p_document.company_id
    AND code = '401'
    AND is_active = true
  LIMIT 1;

  IF v_account_401_id IS NULL THEN
    RETURN;
  END IF;

  -- Récupérer le compte 44566 (TVA déductible)
  SELECT id INTO v_account_44566_id
  FROM chart_of_accounts
  WHERE company_id = p_document.company_id
    AND code = '44566'
    AND is_active = true
  LIMIT 1;

  -- Activer le batch mode pour éviter le check d'équilibre ligne par ligne
  PERFORM set_config('app.batch_accounting_insert', 'true', true);

  BEGIN
    -- Créer l'écriture comptable
    INSERT INTO accounting_entries (
      company_id,
      fiscal_year,
      journal_id,
      entry_date,
      description,
      created_by
    ) VALUES (
      p_document.company_id,
      v_fiscal_year,
      v_journal_id,
      p_document.invoice_date,
      'Dépense - ' || COALESCE((
        SELECT description 
        FROM expense_lines 
        WHERE document_id = p_document.id 
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
      WHERE el.document_id = p_document.id
      ORDER BY el.line_order
    LOOP
      v_line_counter := v_line_counter + 1;

      -- Récupérer l'ID du compte de charge
      SELECT id INTO v_account_id
      FROM chart_of_accounts
      WHERE company_id = p_document.company_id
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
    v_total_ttc := p_document.total_incl_vat;

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

    -- Désactiver le batch mode
    PERFORM set_config('app.batch_accounting_insert', 'false', true);

    -- Lier l'écriture au document
    UPDATE expense_documents
    SET linked_accounting_entry_id = v_entry_id
    WHERE id = p_document.id;

  EXCEPTION WHEN OTHERS THEN
    -- En cas d'erreur, désactiver le batch mode et propager
    PERFORM set_config('app.batch_accounting_insert', 'false', true);
    RAISE;
  END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Fonction trigger : vérifie le flag skip
CREATE OR REPLACE FUNCTION auto_create_expense_accounting_entry()
RETURNS TRIGGER AS $$
DECLARE
  v_skip_trigger text;
BEGIN
  -- Vérifier si le flag skip est activé
  v_skip_trigger := current_setting('app.skip_expense_accounting_trigger', true);
  
  IF v_skip_trigger = 'true' THEN
    RETURN NEW;
  END IF;

  -- Appeler l'implémentation
  PERFORM auto_create_expense_accounting_entry_impl(NEW);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Fonction manuelle : à appeler après insertion des lignes
CREATE OR REPLACE FUNCTION auto_create_expense_accounting_entry_manual(p_document_id uuid)
RETURNS void AS $$
DECLARE
  v_document expense_documents;
BEGIN
  -- Récupérer le document
  SELECT * INTO v_document
  FROM expense_documents
  WHERE id = p_document_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Document % non trouvé', p_document_id;
  END IF;

  -- Appeler l'implémentation
  PERFORM auto_create_expense_accounting_entry_impl(v_document);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Le trigger reste inchangé (déjà créé dans la migration précédente)
-- Il pointe vers auto_create_expense_accounting_entry() qui maintenant vérifie le flag
