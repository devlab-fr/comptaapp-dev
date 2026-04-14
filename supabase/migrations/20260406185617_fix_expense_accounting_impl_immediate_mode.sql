/*
  # Fix auto_create_expense_accounting_entry_impl pour gérer le mode immediate

  1. Problème
    - La fonction auto_create_expense_accounting_entry_impl() génère toujours
      une écriture en mode deferred (401)
    - Ne prend pas en compte le champ payment_timing
    - Mode immediate génère une écriture déséquilibrée

  2. Solution
    - Détecter le payment_timing du document
    - Mode immediate : journal BQ, contrepartie 512
    - Mode deferred : journal ACH, contrepartie 401 (comportement actuel)
    - Réutiliser la MÊME logique de génération des débits (6xx + TVA)
    - Seule la contrepartie change selon le mode

  3. Modifications
    - Ajouter variable v_is_immediate
    - Ajouter lookup v_account_512_id pour mode immediate
    - Modifier choix du journal (BQ vs ACH)
    - Modifier contrepartie crédit finale (512 vs 401)
    - Ne PAS toucher la logique de génération des débits

  4. Sécurité
    - Compatibilité : payment_timing NULL → traité comme deferred
    - Idempotence conservée
    - Batch mode conservé
    - Validation lignes conservée
*/

CREATE OR REPLACE FUNCTION auto_create_expense_accounting_entry_impl(p_document expense_documents)
RETURNS void AS $$
DECLARE
  v_journal_id uuid;
  v_entry_id uuid;
  v_fiscal_year int;
  v_account_401_id uuid;
  v_account_512_id uuid;
  v_account_44566_id uuid;
  v_line record;
  v_account_id uuid;
  v_line_counter int := 0;
  v_total_ttc numeric;
  v_line_count int;
  v_is_immediate boolean;
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

  -- Déterminer le mode de paiement (NULL = deferred pour compatibilité)
  v_is_immediate := (p_document.payment_timing = 'immediate');

  -- Récupérer l'exercice comptable
  v_fiscal_year := EXTRACT(YEAR FROM p_document.invoice_date);

  -- Récupérer le journal approprié selon le mode
  IF v_is_immediate THEN
    -- Mode immediate : utiliser le journal BQ (Banque)
    SELECT id INTO v_journal_id
    FROM journals
    WHERE company_id = p_document.company_id
      AND code = 'BQ'
      AND is_active = true
    LIMIT 1;
  ELSE
    -- Mode deferred : utiliser le journal ACH (Achats)
    SELECT id INTO v_journal_id
    FROM journals
    WHERE company_id = p_document.company_id
      AND code = 'ACH'
      AND is_active = true
    LIMIT 1;
  END IF;

  IF v_journal_id IS NULL THEN
    RETURN;
  END IF;

  -- Récupérer les comptes de contrepartie selon le mode
  IF v_is_immediate THEN
    -- Mode immediate : récupérer le compte 512 (Banque)
    SELECT id INTO v_account_512_id
    FROM chart_of_accounts
    WHERE company_id = p_document.company_id
      AND code = '512'
      AND is_active = true
    LIMIT 1;

    IF v_account_512_id IS NULL THEN
      RETURN;
    END IF;
  ELSE
    -- Mode deferred : récupérer le compte 401 (Fournisseurs)
    SELECT id INTO v_account_401_id
    FROM chart_of_accounts
    WHERE company_id = p_document.company_id
      AND code = '401'
      AND is_active = true
    LIMIT 1;

    IF v_account_401_id IS NULL THEN
      RETURN;
    END IF;
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
      CASE 
        WHEN v_is_immediate THEN 'Dépense immédiate - '
        ELSE 'Dépense - '
      END || COALESCE((
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
    -- CETTE LOGIQUE EST IDENTIQUE POUR LES DEUX MODES (immediate et deferred)
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

    -- Ajouter la ligne de crédit selon le mode
    -- C'EST ICI QUE LES DEUX MODES DIVERGENT
    v_total_ttc := p_document.total_incl_vat;

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

/*
  Note importante :
  
  Cette modification NE TOUCHE PAS :
  - La fonction auto_create_expense_accounting_entry() (trigger wrapper)
  - La fonction auto_create_expense_accounting_entry_manual() (appel manuel)
  - Le trigger trigger_auto_expense_accounting_on_line_insert
  - Toute la logique de génération des débits (identique pour les 2 modes)
  
  Seules modifications :
  - Ajout détection payment_timing
  - Choix du journal selon le mode
  - Choix de la contrepartie crédit selon le mode (401 vs 512)
*/
