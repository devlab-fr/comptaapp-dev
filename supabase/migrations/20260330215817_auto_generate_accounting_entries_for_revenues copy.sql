/*
  # Génération automatique des écritures comptables pour les revenus

  1. Objectif
    - Créer automatiquement une écriture comptable lors de la création d'un revenu
    - Générer les lignes comptables en utilisant le mapping catégorie → compte
    - Gérer la TVA collectée (compte 44571)
    - Utiliser le compte client 411 comme contrepartie

  2. Mécanisme
    - Trigger AFTER INSERT sur revenue_documents
    - Création d'une écriture dans accounting_entries (journal VT)
    - Génération des lignes dans accounting_lines :
      * Pour chaque revenue_line : crédit HT sur le compte de produit
      * Si TVA > 0 : crédit TVA sur compte 44571
      * Contrepartie : débit TTC sur compte 411

  3. Sécurité
    - Ne rien faire si l'écriture existe déjà (évite les doublons)
    - Vérifier que le journal VT existe
    - Utiliser les comptes du plan comptable de l'entreprise

  4. Notes importantes
    - Compatible multi-lignes (plusieurs revenue_lines)
    - Respecte le plan comptable français
    - Ne modifie aucune table existante
    - Utilise uniquement account_code déjà présent dans revenue_categories
    - Réutilise le pattern technique validé pour les dépenses
*/

-- Fonction pour créer automatiquement l'écriture comptable d'un revenu
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
      auth.uid()
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

-- Trigger pour générer automatiquement l'écriture lors de la création d'un revenu
CREATE TRIGGER trigger_auto_revenue_accounting_entry
  AFTER INSERT ON revenue_documents
  FOR EACH ROW
  EXECUTE FUNCTION auto_create_revenue_accounting_entry();
