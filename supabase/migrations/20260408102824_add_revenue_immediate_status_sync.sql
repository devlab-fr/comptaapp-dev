/*
  # Ajouter synchronisation statuts mode immediate (Revenus)

  1. Problème identifié
    - La logique comptable immediate fonctionne (journal BQ, compte 512, écriture créée)
    - v_is_immediate est correctement calculé
    - v_entry_id est correctement assigné
    - MAIS le bloc de synchronisation des statuts n'existe pas
    
  2. Conséquence
    - Les revenus immediate restent en payment_status = 'unpaid'
    - Les revenus immediate restent en accounting_status = 'draft'
    - L'utilisateur doit manuellement changer les statuts
    
  3. Solution minimale
    - Ajouter UNIQUEMENT le bloc de synchronisation des statuts
    - APRÈS l'UPDATE linked_accounting_entry_id
    - AVANT le RETURN final
    - Sans toucher à la logique deferred
    
  4. Impact
    - Mode immediate : payment_status = 'paid' + accounting_status = 'validated' automatiquement
    - Mode deferred : comportement strictement inchangé
    - Aucune autre logique modifiée
*/

-- Remplacer la fonction avec le bloc de synchronisation ajouté
CREATE OR REPLACE FUNCTION auto_create_revenue_accounting_entry_impl(p_revenue revenue_documents)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_journal_id uuid;
  v_entry_id uuid;
  v_fiscal_year int;
  v_account_411_id uuid;
  v_account_512_id uuid;
  v_account_44571_id uuid;
  v_line record;
  v_account_id uuid;
  v_line_counter int := 0;
  v_total_ttc numeric;
  total_debit decimal(15,2);
  total_credit decimal(15,2);
  v_line_count int;
  v_is_immediate boolean;
BEGIN
  -- GARDE ANTI-DUPLICATION : Si l'écriture existe déjà, ne rien faire
  IF p_revenue.linked_accounting_entry_id IS NOT NULL THEN
    RETURN p_revenue.linked_accounting_entry_id;
  END IF;

  -- SÉCURITÉ : Vérifier qu'il existe au moins 1 revenue_line
  SELECT COUNT(*) INTO v_line_count
  FROM revenue_lines
  WHERE document_id = p_revenue.id;

  IF v_line_count = 0 THEN
    -- Pas de lignes, on ne fait rien
    RETURN NULL;
  END IF;

  -- Déterminer le mode de paiement (NULL = deferred pour compatibilité)
  v_is_immediate := (p_revenue.payment_timing = 'immediate');

  -- Récupérer l'exercice comptable (année de la date de facture)
  v_fiscal_year := EXTRACT(YEAR FROM p_revenue.invoice_date);

  -- Récupérer le journal approprié selon le mode
  IF v_is_immediate THEN
    -- Mode immediate : utiliser le journal BQ (Banque)
    SELECT id INTO v_journal_id
    FROM journals
    WHERE company_id = p_revenue.company_id
      AND code = 'BQ'
      AND is_active = true
    LIMIT 1;
  ELSE
    -- Mode deferred : utiliser le journal VT (Ventes)
    SELECT id INTO v_journal_id
    FROM journals
    WHERE company_id = p_revenue.company_id
      AND code = 'VT'
      AND is_active = true
    LIMIT 1;
  END IF;

  -- Si le journal n'existe pas, on ne fait rien (sera géré manuellement)
  IF v_journal_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Récupérer le compte 44571 (TVA collectée)
  SELECT id INTO v_account_44571_id
  FROM chart_of_accounts
  WHERE company_id = p_revenue.company_id
    AND code = '44571'
    AND is_active = true
  LIMIT 1;

  -- Récupérer les comptes de contrepartie selon le mode
  IF v_is_immediate THEN
    -- Mode immediate : récupérer le compte 512 (Banque)
    SELECT id INTO v_account_512_id
    FROM chart_of_accounts
    WHERE company_id = p_revenue.company_id
      AND code = '512'
      AND is_active = true
    LIMIT 1;

    IF v_account_512_id IS NULL THEN
      RETURN NULL;
    END IF;
  ELSE
    -- Mode deferred : récupérer le compte 411 (Clients)
    SELECT id INTO v_account_411_id
    FROM chart_of_accounts
    WHERE company_id = p_revenue.company_id
      AND code = '411'
      AND is_active = true
    LIMIT 1;

    IF v_account_411_id IS NULL THEN
      RETURN NULL;
    END IF;
  END IF;

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
      p_revenue.company_id,
      v_fiscal_year,
      v_journal_id,
      p_revenue.invoice_date,
      CASE
        WHEN v_is_immediate THEN 'Revenu immédiat - '
        ELSE 'Revenu - '
      END || COALESCE((
        SELECT description
        FROM revenue_lines
        WHERE document_id = p_revenue.id
        ORDER BY line_order
        LIMIT 1
      ), 'Sans description'),
      auth.uid()
    )
    RETURNING id INTO v_entry_id;

    -- Ajouter d'abord la ligne de débit selon le mode
    v_total_ttc := p_revenue.total_incl_vat;

    IF v_is_immediate THEN
      -- Mode immediate : débit sur 512 (Banque)
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
        v_total_ttc,
        0,
        1
      );
    ELSE
      -- Mode deferred : débit sur 411 (Client)
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
    END IF;

    v_line_counter := 1;

    -- Générer les lignes comptables pour chaque ligne de revenu
    -- CETTE LOGIQUE EST IDENTIQUE POUR LES DEUX MODES (immediate et deferred)
    FOR v_line IN
      SELECT
        rl.description,
        rl.amount_excl_vat,
        rl.vat_rate,
        rl.vat_amount,
        rc.account_code
      FROM revenue_lines rl
      JOIN revenue_categories rc ON rc.id = rl.category_id
      WHERE rl.document_id = p_revenue.id
      ORDER BY rl.line_order
    LOOP
      v_line_counter := v_line_counter + 1;

      -- Récupérer l'ID du compte de produit
      SELECT id INTO v_account_id
      FROM chart_of_accounts
      WHERE company_id = p_revenue.company_id
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
  WHERE id = p_revenue.id;

  -- Synchronisation statuts mode immediate
  IF v_is_immediate AND v_entry_id IS NOT NULL THEN
    UPDATE revenue_documents
    SET
      payment_status = 'paid',
      accounting_status = 'validated',
      paid_at = p_revenue.invoice_date
    WHERE id = p_revenue.id
      AND (
        payment_status IS DISTINCT FROM 'paid'
        OR accounting_status IS DISTINCT FROM 'validated'
        OR paid_at IS DISTINCT FROM p_revenue.invoice_date
      );
  END IF;

  RETURN v_entry_id;
END;
$$;
