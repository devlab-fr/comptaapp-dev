/*
  # Fix synchronisation accounting_status en mode immediate
  
  1. Problème identifié
    - Le bloc de synchronisation automatique des statuts (payment_status/accounting_status)
    - était placé À L'INTÉRIEUR du bloc BEGIN...EXCEPTION...END
    - Ce placement causait un problème de visibilité transactionnelle
    - Le UPDATE s'exécutait mais dans le mauvais contexte
    
  2. Solution minimale
    - Déplacer le bloc de synchronisation EN DEHORS du bloc BEGIN...EXCEPTION...END
    - Le bloc s'exécute maintenant APRÈS la création complète de l'écriture comptable
    - Mais toujours dans le même contexte transactionnel global de la fonction
    
  3. Comportement attendu
    - Mode immediate : payment_status = 'paid' ET accounting_status = 'validated'
    - Mode deferred : inchangé (brouillon jusqu'au paiement)
    
  4. Sécurité
    - Aucune modification de la logique comptable
    - Aucune modification du mode deferred
    - Uniquement repositionnement du bloc de synchronisation immediate
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

  -- NOUVEAU : Synchroniser les statuts en mode immediate
  -- Déplacé EN DEHORS du bloc BEGIN pour s'exécuter après commit des lignes comptables
  -- Si mode immediate ET écriture créée avec succès,
  -- mettre à jour automatiquement les statuts
  IF v_is_immediate AND v_entry_id IS NOT NULL THEN
    UPDATE expense_documents
    SET
      payment_status = 'paid',
      accounting_status = 'validated'
    WHERE id = p_document.id
      AND (
        payment_status IS DISTINCT FROM 'paid'
        OR accounting_status IS DISTINCT FROM 'validated'
      );
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
