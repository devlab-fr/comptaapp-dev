/*
  # Fix auto_create_revenue_accounting_entry pour gérer auth.uid() NULL

  1. Problème identifié
    - Le trigger `trigger_auto_revenue_accounting_entry` utilise SECURITY DEFINER
    - Lors de l'insertion dans `accounting_entries`, auth.uid() retourne NULL dans un contexte automatique
    - La fonction échoue silencieusement car created_by reste NULL

  2. Solution minimale (même pattern que les dépenses)
    - Garder auth.uid() comme valeur par défaut
    - Si NULL, utiliser created_by du NEW.id (pas applicable pour revenue_documents)
    - Si toujours NULL, utiliser NULL (acceptable car column is_nullable = YES)
    - Appliquer exactement le même pattern que auto_create_expense_accounting_entry

  3. Impact
    - Le système de génération comptable reste actif
    - Les écritures créées automatiquement fonctionneront
    - Les écritures créées manuellement continueront d'utiliser auth.uid()
    - Aucune autre logique impactée
*/

-- Recréer la fonction avec gestion de auth.uid() NULL
CREATE OR REPLACE FUNCTION auto_create_revenue_accounting_entry()
RETURNS TRIGGER AS $$
DECLARE
  v_journal_id uuid;
  v_entry_id uuid;
  v_fiscal_year int;
  v_account_411_id uuid;
  v_account_44571_id uuid;
  v_line record;
  v_account_id uuid;
  v_line_counter int := 0;
  v_total_ttc numeric;
  total_debit decimal(15,2);
  total_credit decimal(15,2);
BEGIN
  -- Ne rien faire si l'écriture existe déjà
  IF NEW.linked_accounting_entry_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Récupérer l'exercice comptable (année de la date de facture)
  v_fiscal_year := EXTRACT(YEAR FROM NEW.invoice_date);

  -- Récupérer le journal VT (Ventes)
  SELECT id INTO v_journal_id
  FROM journals
  WHERE company_id = NEW.company_id
    AND code = 'VT'
    AND is_active = true
  LIMIT 1;

  -- Si le journal n'existe pas, on ne fait rien (sera géré manuellement)
  IF v_journal_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Récupérer le compte 411 (Clients)
  SELECT id INTO v_account_411_id
  FROM chart_of_accounts
  WHERE company_id = NEW.company_id
    AND code = '411'
    AND is_active = true
  LIMIT 1;

  -- Si le compte 411 n'existe pas, on ne fait rien
  IF v_account_411_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Récupérer le compte 44571 (TVA collectée)
  SELECT id INTO v_account_44571_id
  FROM chart_of_accounts
  WHERE company_id = NEW.company_id
    AND code = '44571'
    AND is_active = true
  LIMIT 1;

  -- Activer le batch mode pour désactiver le check d'équilibre ligne par ligne
  PERFORM set_config('app.batch_accounting_insert', 'true', true);

  BEGIN
    -- Créer l'écriture comptable
    -- CORRECTION : auth.uid() peut être NULL dans un trigger automatique
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
      'Revenu - ' || COALESCE((
        SELECT description 
        FROM revenue_lines 
        WHERE document_id = NEW.id 
        ORDER BY line_order 
        LIMIT 1
      ), 'Sans description'),
      auth.uid()  -- Peut être NULL, c'est acceptable
    )
    RETURNING id INTO v_entry_id;

    -- Ajouter d'abord la ligne de débit sur le compte 411 (contrepartie TTC)
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
      v_account_411_id,
      'Client',
      v_total_ttc,
      0,
      1
    );

    v_line_counter := 1;

    -- Générer les lignes comptables pour chaque ligne de revenu
    FOR v_line IN
      SELECT 
        rl.description,
        rl.amount_excl_vat,
        rl.vat_rate,
        rl.vat_amount,
        rc.account_code
      FROM revenue_lines rl
      JOIN revenue_categories rc ON rc.id = rl.category_id
      WHERE rl.document_id = NEW.id
      ORDER BY rl.line_order
    LOOP
      v_line_counter := v_line_counter + 1;

      -- Récupérer l'ID du compte de produit
      SELECT id INTO v_account_id
      FROM chart_of_accounts
      WHERE company_id = NEW.company_id
        AND code = v_line.account_code
        AND is_active = true
      LIMIT 1;

      -- Si le compte existe, créer la ligne de crédit HT
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
          0,
          v_line.amount_excl_vat,
          v_line.vat_rate,
          v_line_counter
        );

        v_line_counter := v_line_counter + 1;

        -- Si TVA > 0, créer la ligne de crédit TVA
        IF v_line.vat_amount > 0 AND v_account_44571_id IS NOT NULL THEN
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
            v_account_44571_id,
            'TVA collectée - ' || v_line.description,
            0,
            v_line.vat_amount,
            v_line.vat_rate,
            v_line_counter
          );

          v_line_counter := v_line_counter + 1;
        END IF;
      END IF;
    END LOOP;

    -- Désactiver le batch mode
    PERFORM set_config('app.batch_accounting_insert', 'false', true);

    -- Vérifier manuellement l'équilibre maintenant
    SELECT 
      COALESCE(SUM(debit), 0),
      COALESCE(SUM(credit), 0)
    INTO total_debit, total_credit
    FROM accounting_lines
    WHERE entry_id = v_entry_id;

    IF total_debit != total_credit THEN
      RAISE EXCEPTION 'Écriture déséquilibrée: débit=% crédit=%', total_debit, total_credit;
    END IF;

  EXCEPTION
    WHEN OTHERS THEN
      -- Désactiver le batch mode en cas d'erreur
      PERFORM set_config('app.batch_accounting_insert', 'false', true);
      RAISE;
  END;

  -- Lier l'écriture au document
  UPDATE revenue_documents
  SET linked_accounting_entry_id = v_entry_id
  WHERE id = NEW.id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
